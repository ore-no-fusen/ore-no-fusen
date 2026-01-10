
use std::path::Path;
use std::sync::Mutex;
use tauri::{State, Manager, AppHandle, Emitter};
// use tauri::menu::{Menu, MenuItem, CheckMenuItem, Submenu, PredefinedMenuItem, MenuEvent};

mod state;
mod logic;
mod storage;
mod tray;
mod logger;  // ログシステム

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

// UC-01: ベースパスの取得
#[tauri::command]
fn get_base_path(state: State<'_, Mutex<AppState>>) -> Option<String> {
    let result = state.lock().unwrap().base_path.clone();
    logger::log_debug("get_base_path called");
    logger::log_debug(&format!("Returning: {:?}", result));
    logger::log_debug(&format!("Type: {}", if result.is_none() { "None" } else { "Some" }));
    result
}

// UC-01, UC-02, UC-03: セットアップ統合コマンド
#[tauri::command]
fn setup_first_launch(
    state: State<'_, Mutex<AppState>>,
    use_default: bool,
    custom_path: Option<String>,
    import_path: Option<String>
) -> Result<String, String> {
    use std::path::PathBuf;
    
    logger::log_action("Setup: User initiated first launch setup");
    
    // 1. ベースパスを決定
    let base_path = if use_default {
        // 推奨パス: Documents/OreNoFusen
        let docs = std::env::var("USERPROFILE")
            .map_err(|_| {
                logger::log_error("USERPROFILE environment variable not found");
                "USERPROFILE not found".to_string()
            })?;
        PathBuf::from(docs).join("Documents").join("OreNoFusen")
            .to_string_lossy().to_string()
    } else {
        custom_path.ok_or_else(|| {
            logger::log_error("Custom path required but not provided");
            "Custom path required".to_string()
        })?
    };
    
    logger::log_action(&format!("Setup: Vault folder selected - {}", 
        if use_default { "Default" } else { "Custom" }));
    logger::log_debug(&format!("Vault folder: {}", logger::sanitize_path(&base_path)));
    
    // 2. UC-03: フォルダ作成 + trashフォルダ作成
    storage::ensure_directory(&base_path)
        .map_err(|e| {
            logger::log_error(&format!("Failed to create vault directory: {}", e));
            e
        })?;
    storage::ensure_trash_dir(&PathBuf::from(&base_path))
        .map_err(|e| {
            logger::log_error(&format!("Failed to create trash directory: {}", e));
            e
        })?;
    
    // 3. UC-02: インポート（オプション）
    if let Some(import_from) = import_path {
        logger::log_action("Setup: Importing notes from existing folder");
        storage::import_files(&import_from, &base_path)
            .map_err(|e| {
                logger::log_error(&format!("Failed to import files: {}", e));
                e
            })?;
    }
    
    // 4. 設定保存
    let settings = storage::Settings {
        base_path: Some(base_path.clone()),
    };
    storage::save_settings(&settings)
        .map_err(|e| {
            logger::log_error(&format!("Failed to save settings: {}", e));
            e
        })?;
    
    // 5. AppState更新
    {
        let mut app_state = state.lock().unwrap();
        app_state.base_path = Some(base_path.clone());
        app_state.folder_path = Some(base_path.clone());
    }
    
    logger::log_info("Setup completed successfully");
    Ok(base_path)
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
            show_context_menu,
            get_base_path,
            setup_first_launch
        ])
        /* .on_menu_event(|app, event| {
             // handle_menu_event(app, &event);
        }) */
        .setup(|app| {
            // アプリケーション起動ログ
            logger::log_app_start();
            
            // UC-01: 設定ファイルからbase_pathを読み込み、AppStateに反映
            logger::log_info("Loading settings...");
            match storage::load_settings() {
                Ok(settings) => {
                    logger::log_info("Settings loaded successfully");
                    logger::log_debug(&format!("base_path: {:?}", settings.base_path));
                    
                    let state: State<Mutex<AppState>> = app.state();
                    let mut app_state = state.lock().unwrap();
                    app_state.base_path = settings.base_path.clone();
                    app_state.folder_path = settings.base_path.clone();
                    
                    if settings.base_path.is_some() {
                        logger::log_info("Vault folder configured");
                    } else {
                        logger::log_info("No vault folder - Setup required");
                    }
                },
                Err(e) => {
                    logger::log_warn(&format!("Settings file not found or invalid: {}", e));
                    logger::log_info("First launch or clean install detected");
                }
            }
            
            if cfg!(debug_assertions) {
                app.handle().plugin(tauri_plugin_log::Builder::default().build())?;
            }
            
            tray::create_tray(app.handle())?;
            logger::log_info("App initialization completed");
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
