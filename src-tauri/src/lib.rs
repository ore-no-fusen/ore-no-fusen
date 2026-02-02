
use std::path::Path;
use std::sync::Mutex;
use tauri::{State, Manager, AppHandle, Emitter};
use raw_window_handle::HasWindowHandle;
// use tauri::menu::{Menu, MenuItem, CheckMenuItem, Submenu, PredefinedMenuItem, MenuEvent};

mod state;
mod logic;
mod storage;
mod tray;
mod logger;  // ログシステム
mod settings; 
mod import; // [NEW] インポート機能
mod capture; // [NEW] キャプチャ機能
mod sound; // [NEW] サウンド機能
mod clipboard; // [NEW] クリップボード機能
use state::{AppState, Note, NoteMeta};

// --- Commands ---

#[tauri::command]
fn fusen_debug_log(message: String) {
    // [DEBUG] Redirect to file logger for persistence (especially for Release/Auto-launch)
    // Using log_info to ensure it appears in standard log file
    logger::log_info(&format!("[Frontend] {}", message));
    println!("[Frontend] {}", message);
}

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

// [NEW] 副作用のないフォルダ選択（インポート元選択用）
#[tauri::command]
fn fusen_pick_folder() -> Option<String> {
    rfd::FileDialog::new().pick_folder().map(|p| p.to_string_lossy().to_string())
}



#[tauri::command]
fn fusen_get_note(state: State<'_, Mutex<AppState>>, path: String) -> Result<NoteMeta, String> {
    // 1. Read note content
    let note = storage::read_note(&path)?;
    
    // 2. Parse Filename for basic meta
    let path_obj = Path::new(&path);
    let filename = path_obj.file_name()
        .ok_or("Invalid path")?
        .to_string_lossy()
        .to_string();
    let (seq, updated, context) = logic::parse_filename(&filename);

    // 3. Parse Content for extended meta
    let (x, y, w, h, bg, aot, tags) = logic::extract_meta_from_content(&note.body);

    let meta = NoteMeta {
        path: path.clone(),
        seq,
        context,
        updated,
        x, y, width: w, height: h,
        background_color: bg,
        always_on_top: aot,
        tags,
    };

    // 4. Update AppState
    logic::apply_update_note(&mut *state.lock().unwrap(), &path, meta.clone());

    Ok(meta)
}





#[tauri::command]
async fn fusen_force_focus(window: tauri::Window) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::WindowsAndMessaging::{
            SetForegroundWindow, BringWindowToTop, 
            ShowWindow, SW_RESTORE, SW_SHOW
        };
        use windows::Win32::UI::Input::KeyboardAndMouse::SetFocus;
        use windows::Win32::Foundation::HWND;
        use raw_window_handle::RawWindowHandle;

        unsafe {
            if let Ok(handle) = window.window_handle() {
                 let raw = handle.as_raw();
                 if let RawWindowHandle::Win32(win32_handle) = raw {
                     let hwnd = HWND(win32_handle.hwnd.get());
                     
                     // 1. Ensure window is visible/restored
                     ShowWindow(hwnd, SW_SHOW);
                     if window.is_minimized().unwrap_or(false) {
                        ShowWindow(hwnd, SW_RESTORE);
                     }

                     // 2. Simply force foreground and top (Skip AttachThreadInput for now)
                     let _ = BringWindowToTop(hwnd);
                     let _ = SetForegroundWindow(hwnd);
                     let _ = SetFocus(hwnd);
                 }
            }
        }
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        window.set_focus().map_err(|e| e.to_string())?;
    }

    Ok(())
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
fn fusen_save_note(
    state: State<'_, Mutex<AppState>>, 
    path: String, 
    body: String, 
    frontmatter_raw: String,
    allow_rename: bool
) -> Result<String, String> {
    // Read old content for change detection
    let old_note = storage::read_note(&path).ok();
    let old_body = old_note.as_ref().map(|n| {
        // storage::read_note returns full content as body currently
        // We need to extract the actual body part to compare correctly with incoming 'body'
        let (_, body) = logic::split_frontmatter(&n.body);
        body.to_string()
    }).unwrap_or_default();

    let mut app_state = state.lock().unwrap();
    
    // Logicに全て任せる
    let (new_path, effect) = logic::handle_save_note(
        &mut app_state, 
        &path, 
        &body, 
        &old_body,
        &frontmatter_raw, 
        allow_rename
    )?;
    
    // CommandはI/Oを実行するだけ
    match effect {
        logic::Effect::WriteNote { path, content } => storage::write_note(&path, &content)?,
        logic::Effect::RenameNote { old_path, new_path } => storage::rename_note(&old_path, &new_path)?,
        logic::Effect::Batch(effects) => {
            for e in effects {
                match e {
                    logic::Effect::WriteNote { path, content } => storage::write_note(&path, &content)?,
                    logic::Effect::RenameNote { old_path, new_path } => storage::rename_note(&old_path, &new_path)?,
                    logic::Effect::Batch(_) => {} // Nested batch not supported
                }
            }
        },
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
fn fusen_archive_note(
    window: tauri::Window,
    state: State<'_, Mutex<AppState>>,
    path: String
) -> Result<String, String> {
    let current_path = std::path::Path::new(&path);
    
    // 1. Get current tags
    let content = storage::read_note(&path)?;
    let (_, _, _, _, _, _, tags) = logic::extract_meta_from_content(&content.body);
    
    // 2. Determine vault root
    let vault_root = {
        let app_state = state.lock().unwrap();
        app_state.base_path.clone().or(app_state.folder_path.clone())
            .ok_or("Vault root not found")?
    };
    let vault_root_path = std::path::Path::new(&vault_root);

    // 3. Move/Link files and handle assets
    if tags.is_empty() {
        // Tagless notes go to general "Archive" folder (Move)
        let archive_dir = storage::ensure_archive_dir(vault_root_path)?;
        let new_path = archive_dir.join(current_path.file_name().ok_or("no name")?);
        let new_path_str = new_path.to_string_lossy().to_string();

        // [New] Copy associated assets BEFORE moving the note
        storage::copy_associated_assets(current_path, &archive_dir)?;

        // [New] Delete original assets after copy (Move)
        storage::delete_associated_assets(current_path)?;

        storage::rename_note(&path, &new_path_str)?;
    } else {
        // Multi-tag logic
        let mut first_new_path: Option<std::path::PathBuf> = None;

        for (i, tag) in tags.iter().enumerate() {
            let tag_dir = storage::ensure_tag_dir(vault_root_path, tag)?;
            let new_path = tag_dir.join(current_path.file_name().ok_or("no name")?);
            let new_path_str = new_path.to_string_lossy().to_string();

            if i == 0 {
                // First tag: Move the file and assets
                storage::copy_associated_assets(current_path, &tag_dir)?;

                // [New] Delete original assets
                storage::delete_associated_assets(current_path)?;

                storage::rename_note(&path, &new_path_str)?;
                first_new_path = Some(new_path);
            } else if let Some(ref src) = first_new_path {
                // Subsequent tags: Create symbolic link
                if !new_path.exists() {
                    storage::create_symlink(src, &new_path)?;
                }
            }
        }
    }
    
    // 4. Update state
    logic::apply_remove_note(&mut *state.lock().unwrap(), &path);
    
    // 5. Cleanup original assets? (Optional but requested as "移動")
    // Note: copy_associated_assets used fs::copy. 
    // If we want "Move", we should delete original after successful move of the note.
    // However, since multiple notes might share assets (rare in this app but possible),
    // we'll stick to Copy-and-Success-Move for now.
    
    // Close the window
    let _ = window.close();
    
    Ok("Archived successfully".to_string())
}

// [NEW] 全文検索
#[derive(serde::Serialize, Clone)]
pub struct SearchHit {
    pub path: String,
    pub line: usize,
    pub preview: String,
}

#[tauri::command]
fn fusen_search_notes(
    state: State<'_, Mutex<AppState>>,
    query: String
) -> Vec<SearchHit> {
    let app_state = state.lock().unwrap();
    let folder_path = match app_state.base_path.as_ref().or(app_state.folder_path.as_ref()) {
        Some(p) => p.clone(),
        None => {
            eprintln!("[Search] No folder path configured!");
            return Vec::new();
        }
    };
    drop(app_state);

    eprintln!("[Search] Searching for '{}' in folder: {}", query, folder_path);

    let hits = search_notes_logic(&folder_path, &query);

    eprintln!("[Search] Found {} hits", hits.len());
    hits
}

fn search_notes_logic(folder_path: &str, query: &str) -> Vec<SearchHit> {
    use std::io::BufRead;
    
    let mut hits = Vec::new();
    let query_lower = query.to_lowercase();
    
    for entry in walkdir::WalkDir::new(folder_path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            // [Fix] Exclude Trash folder
            let path_str = e.path().to_string_lossy();
            if path_str.contains("\\Trash\\") || path_str.contains("/Trash/") || path_str.ends_with("Trash") {
                return false;
            }
            e.path().extension().map_or(false, |ext| ext == "md")
        })
    {
        if let Ok(file) = std::fs::File::open(entry.path()) {
            let reader = std::io::BufReader::new(file);
            
            // [Fix Line Numbers] State machine to track Body lines only
            let mut is_frontmatter = false;
            let mut body_started = false; // [Fix] Track if we hit the first non-empty body line
            let mut body_line_counter = 0;
            
            for (file_line_idx, line_res) in reader.lines().enumerate() {
                if let Ok(line) = line_res {
                    // Check Frontmatter Start
                    if file_line_idx == 0 && line.trim() == "---" {
                        is_frontmatter = true;
                        continue;
                    }
                    
                    // Check Frontmatter End
                    if is_frontmatter {
                        if line.trim() == "---" {
                            is_frontmatter = false;
                        }
                        continue;
                    }
                    
                    // Body Logic
                    // Mimic trim_start(): skip leading blank lines
                    if !body_started {
                        if line.trim().is_empty() {
                            continue;
                        }
                        body_started = true;
                    }

                    // Now we are in the "visible" body
                    body_line_counter += 1;
                    
                    if line.to_lowercase().contains(&query_lower) {
                        let preview = if line.chars().count() > 80 {
                            let start: String = line.chars().take(80).collect();
                            format!("{}...", start)
                        } else {
                            line.to_string()
                        };
                        hits.push(SearchHit {
                            path: entry.path().to_string_lossy().to_string(),
                            line: body_line_counter,
                            preview,
                        });
                    }
                }
            }
        }
    }
    hits
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
fn fusen_open_containing_folder(path: String) -> Result<(), String> {
    storage::open_in_explorer(&path)?;
    Ok(())
}

#[tauri::command]
fn fusen_open_file(path: String) -> Result<(), String> {
    storage::open_file(&path)?;
    Ok(())
}

#[tauri::command]
fn fusen_add_tag(state: State<'_, Mutex<AppState>>, path: String, tag: String, app: tauri::AppHandle) -> Result<(), String> {
    let mut app_state = state.lock().unwrap();
    
    // Read current content
    let content = storage::read_note(&path)
        .map_err(|e| format!("Failed to read note: {}", e))?;
    
    // Add tag
    let effect = logic::handle_add_tag(&mut *app_state, &path, &content.body, &tag)?;
    
    // Execute effect
    if let logic::Effect::WriteNote { path, content } = effect {
        storage::write_note(&path, &content)
            .map_err(|e| format!("Failed to write note: {}", e))?;
    }
    
    // Update tray menu
    drop(app_state);
    let _ = crate::tray::refresh_tray_menu(&app);
    
    Ok(())
}

#[tauri::command]
fn fusen_remove_tag(state: State<'_, Mutex<AppState>>, path: String, tag: String, app: tauri::AppHandle) -> Result<(), String> {
    let mut app_state = state.lock().unwrap();
    
    // Read current content
    let content = storage::read_note(&path)
        .map_err(|e| format!("Failed to read note: {}", e))?;
    
    // Remove tag
    let effect = logic::handle_remove_tag(&mut *app_state, &path, &content.body, &tag)?;
    
    // Execute effect
    if let logic::Effect::WriteNote { path, content } = effect {
        storage::write_note(&path, &content)
            .map_err(|e| format!("Failed to write note: {}", e))?;
    }
    
    // Update tray menu
    drop(app_state); // Release lock before calling refresh_tray_menu
    let _ = crate::tray::refresh_tray_menu(&app);
    
    Ok(())
}

#[tauri::command]
fn fusen_delete_tag_globally(state: State<'_, Mutex<AppState>>, tag: String, app: tauri::AppHandle) -> Result<usize, String> {
    eprintln!("[Global Delete] Request for tag: '{}'", tag);
    
    // CRITICAL FIX: Refresh notes list before processing to ensure we have the latest state
    let mut app_state = state.lock().unwrap();
    let base_path = app_state.base_path.clone()
        .or(app_state.folder_path.clone())
        .ok_or("base_path is not set")?;
    
    // Reload all notes to get the most up-to-date list
    eprintln!("[Global Delete] Reloading notes from: {}", base_path);
    app_state.notes = storage::list_notes(&base_path);
    eprintln!("[Global Delete] Found {} notes in total", app_state.notes.len());
    
    let mut modified_count = 0;
    let mut modified_paths: Vec<String> = Vec::new(); // Track modified paths
    
    // Create a list of paths to process to avoid borrowing issues
    let paths: Vec<String> = app_state.notes.iter().map(|n| n.path.clone()).collect();
    
    // Iterate through all notes
    for path in paths {
        // Read note content
        if let Ok(note) = storage::read_note(&path) {
            let (_, _, _, _, _, _, tags) = logic::extract_meta_from_content(&note.body);
            eprintln!("[Global Delete] Checking note: {} - tags: {:?}", path, tags);

            // Check if tag exists (trim both sides for safety)
            let tag_trimmed = tag.trim();
            if tags.iter().any(|t| t.trim() == tag_trimmed) {
                eprintln!("[Global Delete] Found tag '{}' in {}, attempting to remove...", tag, path);
                // Remove tag
                if let Ok(effect) = logic::handle_remove_tag(&mut *app_state, &path, &note.body, tag_trimmed) {
                    if let logic::Effect::WriteNote { path: write_path, content } = effect {
                        match storage::write_note(&write_path, &content) {
                            Ok(_) => {
                                eprintln!("[Global Delete] Successfully wrote modified note: {}", write_path);
                                modified_count += 1;
                                modified_paths.push(write_path);
                            },
                            Err(e) => eprintln!("[Global Delete] Failed to write note: {} error: {}", write_path, e),
                        }
                    }
                } else {
                    eprintln!("[Global Delete] handle_remove_tag returned error for {}", path);
                }
            }
        }
    }
    
    // Update tray menu
    drop(app_state);
    let _ = crate::tray::refresh_tray_menu(&app);
    
    // [NEW] Notify each modified window to reload
    for path in modified_paths {
        eprintln!("[Global Delete] Sending reload event for: {}", path);
        let _ = app.emit("fusen:reload_note", path);
    }
    
    eprintln!("[Global Delete] Finished. Modified {} notes.", modified_count);
    Ok(modified_count)
}

#[tauri::command]
fn fusen_get_all_tags(state: State<'_, Mutex<AppState>>) -> Vec<String> {
    let app_state = state.lock().unwrap();
    logic::get_all_unique_tags(&*app_state)
}

#[tauri::command]
fn fusen_get_active_tags(state: State<'_, Mutex<AppState>>) -> Vec<String> {
    state.lock().unwrap().active_tags.clone()
}

/// タグフィルタリングを直接Rust側で実行する関数
/// [Refactor] タグフィルタリング結果（パス一覧）を計算する関数
/// ウィンドウ操作は行わず、純粋なデータリストを返す（SSOT）
fn get_filtered_note_paths(state: State<'_, Mutex<AppState>>, active_tags: &[String]) -> Result<Vec<String>, String> {
    // 最新のノート一覧を取得
    let app_state = state.lock().unwrap();
    let base_path = app_state.base_path.clone()
        .or(app_state.folder_path.clone())
        .ok_or("base_path is not set")?;
    drop(app_state);
    
    // 全ノート取得 & タグ解析
    let mut all_notes = storage::list_notes(&base_path);
    for n in all_notes.iter_mut() {
        if let Ok(note) = storage::read_note(&n.path) {
            let (_, _, _, _, _, _, tags) = logic::extract_meta_from_content(&note.body);
            n.tags = tags;
        }
    }
    
    // フィルタリング（OR条件）
    let selected: Vec<String> = active_tags.iter().map(|t| t.trim().to_string()).collect();
    let filtered_paths: Vec<String> = if selected.is_empty() {
        all_notes.into_iter().map(|n| n.path).collect()
    } else {
        all_notes.into_iter()
            .filter(|n| n.tags.iter().any(|tag| selected.contains(&tag.trim().to_string())))
            .map(|n| n.path)
            .collect()
    };
    
    eprintln!("[Rust] Filter calculated. Tags: {:?}, Count: {}", selected, filtered_paths.len());
    Ok(filtered_paths)
}

/// [Shared] タグフィルタを適用し、結果を全ウィンドウに通知する
/// Command (Tag Selector) と Tray Menu の両方から呼ばれる共通ロジック
pub fn update_tag_filter<R: tauri::Runtime>(app: &AppHandle<R>, state: State<'_, Mutex<AppState>>, tags: &[String]) -> Result<(), String> {
    // 1. 計算 (Pure Logic)
    let visible_paths = get_filtered_note_paths(state, tags)?;

    // 2. 通知 (Event Emit) -> Frontend Orchestrator handles UI
    eprintln!("[Rust] Emitting fusen:sync_visible_notes with {} paths", visible_paths.len());
    app.emit("fusen:sync_visible_notes", &visible_paths).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
fn fusen_set_active_tags(state: State<'_, Mutex<AppState>>, tags: Vec<String>, app: tauri::AppHandle) -> Result<(), String> {
    let mut app_state = state.lock().unwrap();
    app_state.active_tags = tags.clone();
    drop(app_state);
    
    eprintln!("[Rust] fusen_set_active_tags called with: {:?}", tags);

    // Shared Logic
    update_tag_filter(&app, state, &tags)?;
    
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
    app_handle: tauri::AppHandle,
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
    // 既存の設定を読み込んで、base_pathだけを更新する
    let mut settings = storage::load_settings().unwrap_or_default();
    settings.base_path = Some(base_path.clone());
    
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

    // [FIX] イベント発行: フロントエンドに設定変更を通知
    use tauri::Emitter; // Emitterトレイトが必要
    app_handle.emit("settings_updated", &settings)
        .map_err(|e| {
            logger::log_error(&format!("Failed to emit settings_updated: {}", e));
            e.to_string()
        })?;
    
    logger::log_info("Setup completed successfully");
    Ok(base_path)
}

#[tauri::command]
fn fusen_import_from_folder(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    source_path: String,
    target_path: Option<String>
) -> Result<import::ImportStats, String> {
    let mut app_state = state.lock().unwrap(); // Lock for mutation later
    let target_path = target_path
        .or(app_state.base_path.clone())
        .or(app_state.folder_path.clone())
        .ok_or("Base path not set")?;
    
    // インポート実行
    // TODO: ここで非同期実行したいが、ファイルコピーはブロッキングでやる
    let stats = import::import_markdown_files(&source_path, &target_path)?;
    
    // [Fix] インポート成功後、ステートを更新して通知する
    eprintln!("[Import] Reloading notes from: {}", target_path);
    app_state.notes = storage::list_notes(&target_path);
    drop(app_state); // Release lock before emitting

    // 全ウィンドウに更新通知
    // page.tsx などで 'fusen:refresh_all' を監視させるか、
    // 既存の 'settings_updated' フローに乗せる（ただし設定変更ではないので別イベントが好ましい）
    // ここでは 'fusen:notes_updated' を発行する
    let _ = app.emit("fusen:notes_updated", ());
    
    // タグフィルタも再適用する（新規ノートを表示するため）
    // Show All（タグなし）の状態でも、全ノートを表示対象として更新する必要があるため常に呼び出す
    let state_clone = app.state::<Mutex<AppState>>();
    let app_state = state_clone.lock().unwrap();
    let active_tags = app_state.active_tags.clone();
    drop(app_state);
    
    // [Fix] active_tagsが空でも "全表示" として同期が必要なため、条件分岐を削除
    let _ = crate::update_tag_filter(&app, state_clone, &active_tags);

    // トレイメニューの件数なども更新が必要かもしれないのでリフレッシュ
    let _ = crate::tray::refresh_tray_menu(&app);
    
    Ok(stats)
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



#[tauri::command]
fn fusen_refresh_notes_with_tags(state: State<'_, Mutex<AppState>>) -> Result<Vec<NoteMeta>, String> {
    let mut app_state = state.lock().unwrap();

    let base_path = app_state
        .base_path
        .clone()
        .or(app_state.folder_path.clone())
        .ok_or("base_path is not set")?;

    // まず一覧（パス）を取る
    let mut notes = storage::list_notes(&base_path);

    // 各ノートを読んで tags を確実に詰める
    for n in notes.iter_mut() {
        if let Ok(note) = storage::read_note(&n.path) {
            let (_x, _y, _w, _h, _bg, _aot, tags) = logic::extract_meta_from_content(&note.body);
            n.tags = tags;
        }
    }

    // stateにも反映
    app_state.notes = notes.clone();
    Ok(notes)
}


// --- Entry Point ---

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(std::sync::Mutex::new(state::AppState::default()))
        .invoke_handler(tauri::generate_handler![
            fusen_debug_log, // [NEW] Frontend Logging Bridge
            fusen_get_note,
            fusen_force_focus,
            fusen_select_folder,
            fusen_list_notes,
            fusen_read_note,
            fusen_create_note,
            fusen_save_note,
            fusen_move_to_trash,
            fusen_rename_note,
            fusen_get_state,
            fusen_update_geometry,
            fusen_add_tag,
            fusen_remove_tag,
            fusen_delete_tag_globally,
            fusen_get_all_tags,
            fusen_get_active_tags,
            fusen_set_active_tags,
            fusen_refresh_notes_with_tags,
            fusen_archive_note,
            fusen_open_containing_folder,
            fusen_open_file,
            show_context_menu,
            get_base_path,
            setup_first_launch,
            settings::get_settings,  // ← 「settings箱の中の」と指定！
            settings::save_settings,  // ← 「settings箱の中の」と指定！
            fusen_import_from_folder, // [NEW] インポートコマンド
            fusen_pick_folder,        // [NEW] 純粋なフォルダ選択
            capture::fusen_capture_screen, // [NEW] 画面キャプチャ
            sound::fusen_play_sound, // [NEW] サウンド再生
            fusen_search_notes, // [NEW] 全文検索
            clipboard::fusen_get_image_from_clipboard, // [NEW] クリップボード画像取得
        ])
        /* .on_menu_event(|app, event| {
             // handle_menu_event(app, &event);
        }) */
        .setup(|app| {
            // アプリケーション起動ログ
            logger::log_app_start();
            
            // [DEBUG] Startup Environment Diagnosis
            if let Ok(cwd) = std::env::current_dir() {
                logger::log_info(&format!("現在の作業ディレクトリ: {:?}", cwd));
            } else {
                logger::log_warn("作業ディレクトリの取得に失敗しました");
            }
            
            if let Ok(exe) = std::env::current_exe() {
                logger::log_info(&format!("実行ファイルパス: {:?}", exe));
            }

            match storage::get_settings_path() {
                Ok(path) => logger::log_info(&format!("設定ファイルパス: {:?}", path)),
                Err(e) => logger::log_warn(&format!("設定ファイルパスの解決に失敗: {}", e)),
            }
            
            // UC-01: 設定ファイルからbase_pathを読み込み、AppStateに反映
            logger::log_info("設定を読み込んでいます...");
            match storage::load_settings() {
                Ok(settings) => {
                    logger::log_info("設定の読み込みに成功しました");
                    logger::log_debug(&format!("base_path: {:?}", settings.base_path));
                    
                    let state: State<Mutex<AppState>> = app.state();
                    let mut app_state = state.lock().unwrap();
                    app_state.base_path = settings.base_path.clone();
                    app_state.folder_path = settings.base_path.clone();
                    
                    if settings.base_path.is_some() {
                        logger::log_info("保存先フォルダは設定済みです");
                    } else {
                        logger::log_info("保存先フォルダが未設定です - セットアップが必要です");
                    }
                },
                Err(e) => {
                    logger::log_warn(&format!("設定ファイルが見つからないか無効です: {}", e));
                    logger::log_info("初回起動またはクリーンインストールを検出しました");
                }
            }
            
            if cfg!(debug_assertions) {
                app.handle().plugin(tauri_plugin_log::Builder::default().build())?;
            }
            
            app.handle().plugin(tauri_plugin_shell::init())?;

            // Autostart plugin (デスクトップのみ)
            #[cfg(desktop)]
            {
                app.handle().plugin(tauri_plugin_autostart::init(
                    tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                    None, // 引数なし
                ))?;
            }

            tray::create_tray(app.handle())?;
            logger::log_info("アプリの初期化が完了しました");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}



#[cfg(test)]
mod search_tests {
    use super::*;
    use tempfile::tempdir;
    use std::fs;

    #[test]
    fn test_search_logic() {
        let dir = tempdir().unwrap();
        let file1 = dir.path().join("Note1.md");
        let file2 = dir.path().join("Note2.md");
        
        fs::write(&file1, "Hello World\nThis is a test.").unwrap();
        fs::write(&file2, "Another note\nHello there.").unwrap();
        
        let hits = search_notes_logic(dir.path().to_str().unwrap(), "Hello");
        assert_eq!(hits.len(), 2);
    }
}
