

use std::path::Path;
use std::sync::Mutex;
use tauri::{State, Manager, AppHandle, Emitter};
// use tauri::menu::{Menu, MenuItem, CheckMenuItem, Submenu, PredefinedMenuItem, MenuEvent};

mod state;
mod logic;
mod storage;
mod tray;

use state::{AppState, Note, NoteMeta};

// --- Commands ---

#[tauri::command]
fn fusen_select_folder(state: State<'_, Mutex<AppState>>) -> Option<String> {
    let folder_opt = rfd::FileDialog::new().pick_folder();
    if let Some(path_buf) = folder_opt {
        let path = path_buf.to_string_lossy().to_string();
        let notes = storage::list_notes(&path);
        
        logic::apply_set_folder(&mut *state.lock().unwrap(), path.clone(), notes);
        Some(path)
    } else {
        None
    }
}

#[tauri::command]
fn fusen_select_file(default_path: Option<String>) -> Option<String> {
    let mut dialog = rfd::FileDialog::new();
    if let Some(path) = default_path {
        dialog = dialog.set_directory(path);
    }
    let file = dialog.add_filter("Markdown", &["md"]).pick_file();
    file.map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
fn fusen_list_notes(state: State<'_, Mutex<AppState>>, folder_path: String) -> Vec<NoteMeta> {
    let notes = storage::list_notes(&folder_path);
    
    logic::apply_set_folder(&mut *state.lock().unwrap(), folder_path, notes.clone());
    notes
}

#[tauri::command]
fn fusen_read_note(state: State<'_, Mutex<AppState>>, path: String) -> Note {
    let note = storage::read_note(&path).unwrap_or_else(|_| Note {
        body: String::new(),
        frontmatter: String::new(),
        meta: NoteMeta { path: path.clone(), ..Default::default() },
    });
    
    logic::apply_select_note(&mut *state.lock().unwrap(), path);
    note
}

#[tauri::command]
fn fusen_create_note(state: State<'_, Mutex<AppState>>, folder_path: String, context: String) -> Result<Note, String> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let next_seq = storage::get_next_seq(&folder_path);
    
    let data = logic::build_create_note_data(&folder_path, &context, next_seq, &today);
    
    storage::write_note(&data.path_str, &data.content)?;
    
    logic::apply_add_note(&mut *state.lock().unwrap(), data.meta.clone());
    
    Ok(Note {
        body: data.body,
        frontmatter: data.frontmatter,
        meta: data.meta,
    })
}

#[tauri::command]
fn fusen_save_note(state: State<'_, Mutex<AppState>>, path: String, body: String, frontmatter_raw: String) -> Result<String, String> {
    let mut app_state = state.lock().unwrap();
    
    // Logicに全て任せる
    let (new_path, effect) = logic::handle_save_note(&mut app_state, &path, &body, &frontmatter_raw)?;
    
    // CommandはI/Oを実行するだけ
    match effect {
        logic::Effect::WriteNote { path, content } => storage::write_note(&path, &content)?,
        logic::Effect::RenameNote { old_path, new_path } => storage::rename_note(&old_path, &new_path)?,
        logic::Effect::Batch(effects) => {
            for e in effects {
                match e {
                    logic::Effect::WriteNote { path, content } => storage::write_note(&path, &content)?,
                    logic::Effect::RenameNote { old_path, new_path } => storage::rename_note(&old_path, &new_path)?,
                    _ => {}
                }
            }
        },
        _ => {}
    }
    
    Ok(new_path)
}

#[tauri::command]
fn fusen_move_to_trash(
    window: tauri::Window,
    state: State<'_, Mutex<AppState>>,
    path: String
) -> Result<String, String> {
    let current_path = Path::new(&path);
    let parent = current_path.parent().ok_or("no parent")?;
    
    let trash_dir = storage::ensure_trash_dir(parent)?;
    
    let filename = current_path.file_name().ok_or("no name")?.to_string_lossy();
    let new_path = trash_dir.join(filename.as_ref());
    let new_path_str = new_path.to_string_lossy().to_string();
    
    storage::rename_note(&path, &new_path_str)?;
    
    logic::apply_remove_note(&mut *state.lock().unwrap(), &path);
    
    // Close the window after successful trash move
    let _ = window.close();
    
    Ok(new_path_str)
}

#[tauri::command]
fn fusen_rename_note(state: State<'_, Mutex<AppState>>, path: String, new_context: String) -> Result<String, String> {
    let current_path = Path::new(&path);
    let filename = current_path.file_name().ok_or("no name")?.to_string_lossy().to_string();
        
    let (seq, updated, _) = logic::parse_filename(&filename);
    if seq == 0 && filename.starts_with("unknown") {
         return Err("Invalid format".to_string()); 
    }
    
    let new_filename = logic::generate_filename(seq, &updated, &new_context);
    let new_path = current_path.parent().ok_or("no parent")?.join(&new_filename);
    let new_path_str = new_path.to_string_lossy().to_string();
    
    storage::rename_note(&path, &new_path_str)?;

    if let Ok(saved_note) = storage::read_note(&new_path_str) {
        logic::apply_update_note(&mut *state.lock().unwrap(), &path, saved_note.meta);
    }

    Ok(new_path_str)
}

#[tauri::command]
fn fusen_get_state(state: State<'_, Mutex<AppState>>) -> AppState {
    state.lock().unwrap().clone()
}

#[tauri::command]
fn fusen_update_geometry(
    state: State<'_, Mutex<AppState>>,
    path: String,
    x: f64, y: f64, width: f64, height: f64
) -> Result<(), String> {
    let mut app_state = state.lock().unwrap();
    
    // Command層でI/O: 現在の内容を読み込む
    let note = storage::read_note(&path)?;
    
    // Logic層: 更新ロジックとState同期
    let effect = logic::handle_update_geometry(&mut app_state, &path, &note.body, x, y, width, height)?;
    
    // Effect実行
    match effect {
        logic::Effect::WriteNote { path, content } => storage::write_note(&path, &content)?,
        _ => {}
    }
    
    Ok(())
}

#[tauri::command]
fn fusen_toggle_always_on_top(
    window: tauri::Window,
    state: State<'_, Mutex<AppState>>,
    path: String,
    enable: bool
) -> Result<(), String> {
    let mut app_state = state.lock().unwrap();
    
    let note = storage::read_note(&path)?;
    let effect = logic::handle_toggle_always_on_top(&mut app_state, &path, &note.body, enable)?;
    
    match effect {
        logic::Effect::WriteNote { path, content } => storage::write_note(&path, &content)?,
        _ => {}
    }
    
    window.set_always_on_top(enable).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
fn fusen_open_containing_folder(path: String) -> Result<(), String> {
    storage::open_in_explorer(&path)?;
    Ok(())
}




#[tauri::command]
fn show_context_menu(
    _app: AppHandle,
    _window: tauri::Window,
    state: State<'_, Mutex<AppState>>,
    path: String
) -> Result<(), String> {
    // Store the target path in AppState for later use
    {
        let mut app_state = state.lock().unwrap();
        app_state.active_context_menu_path = Some(path.clone());
    }
    
    // Menu will be created and shown on frontend using @tauri-apps/api/menu
    Ok(())
}



// --- Entry Point ---

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(std::sync::Mutex::new(state::AppState::default()))
        .invoke_handler(tauri::generate_handler![
            fusen_select_folder,
            fusen_select_file,
            fusen_list_notes,
            fusen_read_note,
            fusen_create_note,
            fusen_save_note,
            fusen_move_to_trash,
            fusen_rename_note,
            fusen_get_state,
            fusen_update_geometry,
            fusen_toggle_always_on_top,
            fusen_open_containing_folder,
            show_context_menu
        ])
        /* .on_menu_event(|app, event| {
             // handle_menu_event(app, &event);
        }) */
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(tauri_plugin_log::Builder::default().build())?;
            }
            tray::create_tray(app.handle())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[derive(Clone, serde::Serialize)]
struct ActionPayload {
  path: String,
  action: String,
}
