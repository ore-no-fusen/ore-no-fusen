/*
 * Tauri アプリケーションバックエンド (Core)
 *
 * 責務:
 * - Tauriコマンドの登録とハンドリング
 * - アプリケーションライフサイクルの管理
 * - 各モジュールの統合 (State, Logic, Storage, etc.)
 */

use std::path::Path;
use std::sync::Mutex;
use tauri::{State, Manager, AppHandle, Emitter};
use raw_window_handle::HasWindowHandle;

mod state;
mod logic;
mod storage;
mod tray;
mod logger;  // ログシステム
mod settings; 
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
        
        logic::apply_set_folder(&mut *state.lock().unwrap_or_else(|p| p.into_inner()), path.clone(), notes);
        Some(path)
    } else {
        None
    }
}




#[tauri::command]
fn fusen_set_always_on_top(window: tauri::Window, enabled: bool) -> Result<(), String> {
    // [FIX] Tauri の set_always_on_top() は内部 visibility 状態を参照するため、
    // fusen_show_at_position (生Win32 SetWindowPos) で表示したプールウィンドウに対して
    // 呼び出すと tao が "hidden" 判定でウィンドウを非表示にする。
    // 生Win32 SetWindowPos を直接使用することで Tauri 内部状態の影響を排除する。
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::WindowsAndMessaging::{
            SetWindowPos, HWND_TOPMOST, HWND_NOTOPMOST,
            SWP_NOMOVE, SWP_NOSIZE, SWP_NOACTIVATE,
        };
        use windows::Win32::Foundation::HWND;
        use raw_window_handle::{HasWindowHandle, RawWindowHandle};

        unsafe {
            if let Ok(handle) = window.window_handle() {
                if let RawWindowHandle::Win32(win32_handle) = handle.as_raw() {
                    let hwnd = HWND(win32_handle.hwnd.get());
                    let z_order = if enabled { HWND_TOPMOST } else { HWND_NOTOPMOST };
                    SetWindowPos(
                        hwnd, z_order, 0, 0, 0, 0,
                        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                    ).map_err(|e| format!("SetWindowPos failed: {}", e))?;
                }
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        window.set_always_on_top(enabled).map_err(|e| e.to_string())?;
    }

    Ok(())
}


#[tauri::command]
fn fusen_list_notes(state: State<'_, Mutex<AppState>>, folder_path: String) -> Vec<NoteMeta> {
    let notes = storage::list_notes(&folder_path);
    
    logic::apply_set_folder(&mut *state.lock().unwrap_or_else(|p| p.into_inner()), folder_path, notes.clone());
    notes
}

#[tauri::command]
fn fusen_read_note(state: State<'_, Mutex<AppState>>, path: String) -> Note {
    let note = storage::read_note(&path).unwrap_or_else(|_| Note {
        body: String::new(),
        frontmatter: String::new(),
        meta: NoteMeta { path: path.clone(), ..Default::default() },
    });
    
    logic::apply_select_note(&mut *state.lock().unwrap_or_else(|p| p.into_inner()), path);
    note
}

#[tauri::command]
fn fusen_create_note(state: State<'_, Mutex<AppState>>, folder_path: String, context: String) -> Result<Note, String> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let next_seq = storage::get_next_seq(&folder_path);

    let data = logic::build_create_note_data(&folder_path, &context, next_seq, &today);

    storage::write_note(&data.path_str, &data.content)?;

    logic::apply_add_note(&mut *state.lock().unwrap_or_else(|p| p.into_inner()), data.meta.clone());

    Ok(Note {
        body: data.body,
        frontmatter: data.frontmatter,
        meta: data.meta,
    })
}

#[tauri::command]
fn fusen_duplicate_note(state: State<'_, Mutex<AppState>>, path: String) -> Result<Note, String> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    // 元ノートを読む
    let original = storage::read_note(&path).map_err(|e| e.to_string())?;
    let (orig_front, orig_body) = logic::split_frontmatter(&original.body);
    let (_, _, _, _, color, _, tags, _) = logic::extract_meta_from_content(orig_front);
    let bg_color = color.as_deref().unwrap_or("#f7e9b0").to_string();

    // stateからfolder_pathとcontextを取得（lockをすぐ解放）
    let (folder_path, context, next_seq) = {
        let app_state = state.lock().unwrap_or_else(|p| p.into_inner());
        let fp = app_state.folder_path.clone().ok_or("No folder set")?;
        let ctx = app_state.notes.iter()
            .find(|n| n.path == path)
            .map(|n| n.context.clone())
            .unwrap_or_else(|| "copy".to_string());
        let seq = storage::get_next_seq(&fp);
        (fp, ctx, seq)
    };

    let new_frontmatter = logic::generate_frontmatter(next_seq, &context, &today, &today, Some(&bg_color), &tags, None);
    let new_filename = logic::generate_filename(next_seq, &today, &context);
    let new_path_str = std::path::Path::new(&folder_path).join(&new_filename).to_string_lossy().to_string();
    let content = format!("{}\n\n{}", new_frontmatter, orig_body.trim());

    storage::write_note(&new_path_str, &content)?;

    let meta = NoteMeta {
        path: new_path_str,
        seq: next_seq,
        context,
        updated: today,
        ..Default::default()
    };

    logic::apply_add_note(&mut *state.lock().unwrap_or_else(|p| p.into_inner()), meta.clone());

    Ok(Note {
        body: orig_body.to_string(),
        frontmatter: new_frontmatter,
        meta,
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

    let mut app_state = state.lock().unwrap_or_else(|p| p.into_inner());
    
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
        logic::Effect::RenameNote { old_path, new_path } => {
            if std::path::Path::new(&old_path).exists() {
                storage::rename_note(&old_path, &new_path)?;
            }
        },
        logic::Effect::Batch(effects) => {
            for e in effects {
                match e {
                    logic::Effect::WriteNote { path, content } => storage::write_note(&path, &content)?,
                    logic::Effect::RenameNote { old_path, new_path } => {
                        if std::path::Path::new(&old_path).exists() {
                            storage::rename_note(&old_path, &new_path)?;
                        }
                    },
                    logic::Effect::Batch(_) => {} // Nested batch not supported
                }
            }
        },
    }
    
    Ok(new_path)
}

#[tauri::command]
fn fusen_move_to_trash(
    state: State<'_, Mutex<AppState>>,
    path: String
) -> Result<String, String> {
    let current_path = Path::new(&path);

    // ファイルが既に存在しない場合（空のメモなど）は成功扱い（JS側でウィンドウを閉じる）
    if !current_path.exists() {
        return Ok("Already deleted".to_string());
    }

    let parent = current_path.parent().ok_or("no parent")?;

    let trash_dir = storage::ensure_trash_dir(parent)?;

    let filename = current_path.file_name().ok_or("no name")?.to_string_lossy();
    let new_path = trash_dir.join(filename.as_ref());
    let new_path_str = new_path.to_string_lossy().to_string();

    // Move associated assets (images) to Trash as well
    storage::copy_associated_assets(current_path, &trash_dir)?;
    storage::delete_associated_assets(current_path)?;

    storage::rename_note(&path, &new_path_str)?;

    logic::apply_remove_note(&mut *state.lock().unwrap_or_else(|p| p.into_inner()), &path);

    // ウィンドウのクローズは JS 側（useStickyNoteContextMenu）が担当
    Ok(new_path_str)
}

#[tauri::command]
fn fusen_archive_note(
    state: State<'_, Mutex<AppState>>,
    path: String
) -> Result<String, String> {
    let current_path = std::path::Path::new(&path);
    
    // 1. Get current tags
    let content = storage::read_note(&path)?;
    let (_, _, _, _, _, _, tags, _) = logic::extract_meta_from_content(&content.body);
    
    // 2. Determine vault root
    let vault_root = {
        let app_state = state.lock().unwrap_or_else(|p| p.into_inner());
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
        // Tagged notes: Move to the first tag folder only
        let first_tag = &tags[0];
        let tag_dir = storage::ensure_tag_dir(vault_root_path, first_tag)?;
        let new_path = tag_dir.join(current_path.file_name().ok_or("no name")?);
        let new_path_str = new_path.to_string_lossy().to_string();

        // Move the file and assets to the first tag folder
        storage::copy_associated_assets(current_path, &tag_dir)?;
        storage::delete_associated_assets(current_path)?;
        storage::rename_note(&path, &new_path_str)?;
    }
    
    // 4. Update state
    logic::apply_remove_note(&mut *state.lock().unwrap_or_else(|p| p.into_inner()), &path);
    
    // 5. Cleanup original assets? (Optional but requested as "移動")
    // Note: copy_associated_assets used fs::copy. 
    // If we want "Move", we should delete original after successful move of the note.
    // However, since multiple notes might share assets (rare in this app but possible),
    // we'll stick to Copy-and-Success-Move for now.
    
    // ウィンドウのクローズは JS 側（useStickyNoteContextMenu）が担当
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
    let app_state = state.lock().unwrap_or_else(|p| p.into_inner());
    let folder_path = match app_state.base_path.as_ref().or(app_state.folder_path.as_ref()) {
        Some(p) => p.clone(),
        None => {
            eprintln!("[Search] No folder path configured!");
            return Vec::new();
        }
    };
    drop(app_state);

    let hits = search_notes_logic(&folder_path, &query);

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
            // tagsフォルダとTrashフォルダを除外（重複ヒット防止）
            let path_str = e.path().to_string_lossy();
            if path_str.contains("\\Trash\\") || path_str.contains("/Trash/") || path_str.ends_with("Trash") {
                return false;
            }
            if path_str.contains("\\tags\\") || path_str.contains("/tags/") || path_str.ends_with("tags") {
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
fn fusen_get_state(state: State<'_, Mutex<AppState>>) -> AppState {
    state.lock().unwrap_or_else(|p| p.into_inner()).clone()
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
    let mut app_state = state.lock().unwrap_or_else(|p| p.into_inner());
    
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
    let mut app_state = state.lock().unwrap_or_else(|p| p.into_inner());
    
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
    // CRITICAL FIX: Refresh notes list before processing to ensure we have the latest state
    let mut app_state = state.lock().unwrap_or_else(|p| p.into_inner());
    let base_path = app_state.base_path.clone()
        .or(app_state.folder_path.clone())
        .ok_or("base_path is not set")?;

    // Reload all notes to get the most up-to-date list
    app_state.notes = storage::list_notes(&base_path);

    let mut modified_count = 0;
    let mut modified_paths: Vec<String> = Vec::new(); // Track modified paths

    // Create a list of paths to process to avoid borrowing issues
    let paths: Vec<String> = app_state.notes.iter().map(|n| n.path.clone()).collect();

    // Iterate through all notes
    for path in paths {
        // Read note content
        if let Ok(note) = storage::read_note(&path) {
            let (_, _, _, _, _, _, tags, _) = logic::extract_meta_from_content(&note.body);

            // Check if tag exists (trim both sides for safety)
            let tag_trimmed = tag.trim();
            if tags.iter().any(|t| t.trim() == tag_trimmed) {
                // Remove tag
                if let Ok(effect) = logic::handle_remove_tag(&mut *app_state, &path, &note.body, tag_trimmed) {
                    if let logic::Effect::WriteNote { path: write_path, content } = effect {
                        match storage::write_note(&write_path, &content) {
                            Ok(_) => {
                                modified_count += 1;
                                modified_paths.push(write_path);
                            },
                            Err(_e) => {},
                        }
                    }
                }
            }
        }
    }

    // Update tray menu
    drop(app_state);
    let _ = crate::tray::refresh_tray_menu(&app);

    // [NEW] Notify each modified window to reload
    for path in modified_paths {
        let _ = app.emit("fusen:reload_note", path);
    }

    Ok(modified_count)
}

#[tauri::command]
fn fusen_get_all_tags(state: State<'_, Mutex<AppState>>) -> Vec<String> {
    let app_state = state.lock().unwrap_or_else(|p| p.into_inner());
    logic::get_all_unique_tags(&*app_state)
}

#[tauri::command]
fn fusen_get_active_tags(state: State<'_, Mutex<AppState>>) -> Vec<String> {
    state.lock().unwrap_or_else(|p| p.into_inner()).active_tags.clone()
}

/// JSの getWindowLabel と同じアルゴリズムでウィンドウラベルを生成する
/// JS: path → normalizePath（小文字・スラッシュ統一）→ simpleHash（djb2変形・UTF-16）→ toString(36) → "note-{hash}"
fn normalize_path_for_label(path: &str) -> String {
    let s = path.trim().replace('\\', "/").to_lowercase();
    // 連続スラッシュを単一に
    let mut result = String::with_capacity(s.len());
    let mut prev_slash = false;
    for c in s.chars() {
        if c == '/' {
            if !prev_slash { result.push(c); }
            prev_slash = true;
        } else {
            result.push(c);
            prev_slash = false;
        }
    }
    // 末尾スラッシュ除去
    while result.ends_with('/') { result.pop(); }
    result
}

fn to_radix36(mut n: u64) -> String {
    if n == 0 { return "0".to_string(); }
    const DIGITS: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    let mut buf = Vec::new();
    while n > 0 {
        buf.push(DIGITS[(n % 36) as usize] as char);
        n /= 36;
    }
    buf.into_iter().rev().collect()
}

/// JSの simpleHash と同一: UTF-16 charCode の djb2変形
fn simple_hash_js(s: &str) -> String {
    let utf16: Vec<u16> = s.encode_utf16().collect();
    let mut hash: i32 = 0i32;
    for &c in &utf16 {
        hash = hash.wrapping_shl(5).wrapping_sub(hash).wrapping_add(c as i32);
    }
    to_radix36(hash.unsigned_abs() as u64)
}

pub fn get_window_label(path: &str) -> String {
    let normalized = normalize_path_for_label(path);
    let hash = simple_hash_js(&normalized);
    format!("note-{}", hash)
}

/// タグフィルタリングを直接Rust側で実行する関数
/// [Refactor] タグフィルタリング結果（パス一覧）を計算する関数
/// ウィンドウ操作は行わず、純粋なデータリストを返す（SSOT）
fn get_filtered_note_paths(state: State<'_, Mutex<AppState>>, active_tags: &[String]) -> Result<Vec<String>, String> {
    // 最新のノート一覧を取得
    let app_state = state.lock().unwrap_or_else(|p| p.into_inner());
    let base_path = app_state.base_path.clone()
        .or(app_state.folder_path.clone())
        .ok_or("base_path is not set")?;
    drop(app_state);
    
    // 全ノート取得 & タグ解析
    let mut all_notes = storage::list_notes(&base_path);
    for n in all_notes.iter_mut() {
        if let Ok(note) = storage::read_note(&n.path) {
            let (_, _, _, _, _, _, tags, _) = logic::extract_meta_from_content(&note.body);
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
    
    Ok(filtered_paths)
}

/// [Fix] 全隠し/全表示のクールダウン制御。
/// 高速連続操作で WebView2 COM のネストしたメッセージポンプが積み重なり
/// スタックオーバーフローが起きることを防ぐ。
/// 前回の操作から 3000ms 以内の呼び出しは無視する。
static LAST_VISIBILITY_MS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// [FIX] Ctrl+N連打クラッシュ防止: プールウィンドウ補充のスロットル
/// fusen_create_pool_windowが500ms以内に連続呼び出された場合にスキップする。
/// 1枚目の付箋昇格（promote）には一切影響しない。
static LAST_POOL_CREATE_MS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

pub fn can_do_visibility_op() -> bool {
    use std::sync::atomic::Ordering;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    let last = LAST_VISIBILITY_MS.load(Ordering::SeqCst);
    if now.saturating_sub(last) < 3000 {
        eprintln!("[Visibility] クールダウン中のためスキップ ({}ms 経過)", now.saturating_sub(last));
        return false;
    }
    LAST_VISIBILITY_MS.store(now, Ordering::SeqCst);
    true
}

/// [Fix] ShowWindowAsync: Win32の非同期版ShowWindow。PostMessageベースで動作するため
/// メインスレッドにSendMessageしないのでスタックオーバーフローが起きない。
/// Tauriの win.show()/win.hide() は内部でSendMessageを使うため複数ウィンドウの
/// ループで呼び出すとスタックが溢れる。この関数を代わりに使う。
#[cfg(target_os = "windows")]
pub fn win32_show_window_async<R: tauri::Runtime>(win: &tauri::WebviewWindow<R>, visible: bool) {
    use windows::Win32::UI::WindowsAndMessaging::{ShowWindowAsync, SW_SHOW, SW_HIDE};
    use windows::Win32::Foundation::HWND;
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    unsafe {
        if let Ok(handle) = win.window_handle() {
            if let RawWindowHandle::Win32(h) = handle.as_raw() {
                let hwnd = HWND(h.hwnd.get());
                let _ = ShowWindowAsync(hwnd, if visible { SW_SHOW } else { SW_HIDE });
            }
        }
    }
}

/// [Shared] タグフィルタを適用し、Rust側から直接ウィンドウをhide/showする
/// メインウィンドウがminimized状態でもJSに依存せず確実に動作する
pub fn update_tag_filter<R: tauri::Runtime>(app: &AppHandle<R>, state: State<'_, Mutex<AppState>>, tags: &[String]) -> Result<(), String> {
    eprintln!("[TagFilter] called. tags={:?}", tags);

    // 1. 計算 (Pure Logic)
    let visible_paths = get_filtered_note_paths(state, tags)?;
    eprintln!("[TagFilter] visible_paths ({} notes):", visible_paths.len());
    for p in &visible_paths {
        eprintln!("[TagFilter]   path={} => label={}", p, get_window_label(p));
    }

    // window.show()/hide() を Rust から直接呼ぶと Win32 の SendMessage で
    // メインスレッドに同期的に届きスタック溢れの原因になる。
    // JS側（WebView2 PostMessage = 非同期）に委ねることでスタックを消費しない。
    app.emit("fusen:sync_visible_notes", &visible_paths).map_err(|e| e.to_string())?;
    eprintln!("[TagFilter] emit done.");

    Ok(())
}

#[tauri::command]
fn fusen_set_active_tags(state: State<'_, Mutex<AppState>>, tags: Vec<String>, app: tauri::AppHandle) -> Result<(), String> {
    let mut app_state = state.lock().unwrap_or_else(|p| p.into_inner());
    app_state.active_tags = tags.clone();
    drop(app_state);

    // Shared Logic
    update_tag_filter(&app, state, &tags)?;
    
    Ok(())
}

// UC-01: ベースパスの取得
#[tauri::command]
fn get_base_path(state: State<'_, Mutex<AppState>>) -> Option<String> {
    let result = state.lock().unwrap_or_else(|p| p.into_inner()).base_path.clone();
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
        let mut app_state = state.lock().unwrap_or_else(|p| p.into_inner());
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
fn show_context_menu(
    _app: AppHandle,
    _window: tauri::Window,
    state: State<'_, Mutex<AppState>>,
    path: String
) -> Result<(), String> {
    // Store the target path in AppState for later use
    {
        let mut app_state = state.lock().unwrap_or_else(|p| p.into_inner());
        app_state.active_context_menu_path = Some(path.clone());
    }
    
    // Menu will be created and shown on frontend using @tauri-apps/api/menu
    Ok(())
}




// [NEW] ウィンドウをAlt+Tab/タスクビューから除外する（WS_EX_TOOLWINDOW適用）
#[tauri::command]
async fn fusen_make_tool_window(window: tauri::Window) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::WindowsAndMessaging::{
            GetWindowLongW, SetWindowLongW,
            GWL_EXSTYLE, WS_EX_TOOLWINDOW, WS_EX_APPWINDOW,
        };
        use windows::Win32::UI::Shell::{ITaskbarList, TaskbarList};
        use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
        use windows::Win32::Foundation::HWND;
        use raw_window_handle::RawWindowHandle;

        unsafe {
            if let Ok(handle) = window.window_handle() {
                let raw = handle.as_raw();
                if let RawWindowHandle::Win32(win32_handle) = raw {
                    let hwnd = HWND(win32_handle.hwnd.get());
                    let style = GetWindowLongW(hwnd, GWL_EXSTYLE);
                    // WS_EX_TOOLWINDOWを追加し、WS_EX_APPWINDOWを削除
                    let new_style = (style as u32 | WS_EX_TOOLWINDOW.0) & !WS_EX_APPWINDOW.0;
                    SetWindowLongW(hwnd, GWL_EXSTYLE, new_style as i32);
                    // ITaskbarList::DeleteTab でシェルのAlt+Tabリストから直接削除
                    if let Ok(tbl) = CoCreateInstance::<_, ITaskbarList>(&TaskbarList, None, CLSCTX_INPROC_SERVER) {
                        let _ = tbl.HrInit();
                        let _ = tbl.DeleteTab(hwnd);
                    }
                }
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = window;
    }

    Ok(())
}

/// HWNDごとに元のWndProcを保存するグローバルマップ（最小化ブロック用）
#[cfg(target_os = "windows")]
fn original_wndprocs() -> &'static std::sync::Mutex<std::collections::HashMap<isize, isize>> {
    static PROCS: std::sync::OnceLock<std::sync::Mutex<std::collections::HashMap<isize, isize>>> = std::sync::OnceLock::new();
    PROCS.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()))
}

/// タスクバーアイコン左クリックによる最小化をブロックするウィンドウプロシージャ
#[cfg(target_os = "windows")]
unsafe extern "system" fn minimize_block_proc(
    hwnd: windows::Win32::Foundation::HWND,
    msg: u32,
    wparam: windows::Win32::Foundation::WPARAM,
    lparam: windows::Win32::Foundation::LPARAM,
) -> windows::Win32::Foundation::LRESULT {
    use windows::Win32::UI::WindowsAndMessaging::{WM_SYSCOMMAND, SC_MINIMIZE, CallWindowProcW};
    use windows::Win32::Foundation::LRESULT;
    if msg == WM_SYSCOMMAND && (wparam.0 & 0xFFF0) == SC_MINIMIZE as usize {
        return LRESULT(0);
    }
    let orig = original_wndprocs()
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .get(&hwnd.0)
        .copied()
        .unwrap_or(0);
    if orig != 0 {
        type WndProcFn = unsafe extern "system" fn(
            windows::Win32::Foundation::HWND, u32,
            windows::Win32::Foundation::WPARAM,
            windows::Win32::Foundation::LPARAM,
        ) -> windows::Win32::Foundation::LRESULT;
        let orig_fn: WndProcFn = std::mem::transmute(orig as usize);
        CallWindowProcW(Some(orig_fn), hwnd, msg, wparam, lparam)
    } else {
        LRESULT(0)
    }
}

// [NEW] 直前に使用した付箋のみAlt+Tabに表示する
#[tauri::command]
async fn fusen_set_as_alt_tab_window(
    label: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, Mutex<AppState>>,
) -> Result<String, String> {
    let mut diag = format!("called with label={}", label);

    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::WindowsAndMessaging::{
            GetWindowLongW, SetWindowLongW,
            GWL_EXSTYLE, WS_EX_TOOLWINDOW, WS_EX_APPWINDOW,
        };
        use windows::Win32::UI::Shell::{ITaskbarList, TaskbarList};
        use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
        use windows::Win32::UI::WindowsAndMessaging::{GetWindowLongPtrW, SetWindowLongPtrW, GWLP_WNDPROC};
        use windows::Win32::Foundation::HWND;
        use raw_window_handle::RawWindowHandle;

        // 前のラベルを取得して新しいラベルを保存
        let prev_label = {
            let mut s = state.lock().unwrap_or_else(|p| p.into_inner());
            // 同じウィンドウへの再フォーカス: スタイル変更不要のため即リターン
            if s.last_alt_tab_window.as_deref() == Some(label.as_str()) {
                return Ok(format!("already_active label={}", label));
            }
            s.last_alt_tab_window.replace(label.clone())
        };
        diag.push_str(&format!(", prev={:?}", prev_label));

        // 前のウィンドウをAlt+Tabから除外（WS_EX_TOOLWINDOW を追加、WS_EX_APPWINDOW を除去）
        if let Some(prev) = prev_label {
            if prev != label {
                match app.get_webview_window(&prev) {
                    Some(prev_win) => unsafe {
                        if let Ok(handle) = prev_win.window_handle() {
                            let raw = handle.as_raw();
                            if let RawWindowHandle::Win32(win32_handle) = raw {
                                let hwnd = HWND(win32_handle.hwnd.get());
                                let style = GetWindowLongW(hwnd, GWL_EXSTYLE);
                                let new_style = (style as u32 | WS_EX_TOOLWINDOW.0) & !WS_EX_APPWINDOW.0;
                                SetWindowLongW(hwnd, GWL_EXSTYLE, new_style as i32);
                                // ITaskbarList::DeleteTab でシェルのAlt+Tabリストから直接削除
                                if let Ok(tbl) = CoCreateInstance::<_, ITaskbarList>(&TaskbarList, None, CLSCTX_INPROC_SERVER) {
                                    let _ = tbl.HrInit();
                                    let _ = tbl.DeleteTab(hwnd);
                                }
                                // 最小化ブロックのWndProcを解除して元に戻す
                                if let Some(orig) = original_wndprocs()
                                    .lock().unwrap_or_else(|p| p.into_inner())
                                    .remove(&hwnd.0)
                                {
                                    SetWindowLongPtrW(hwnd, GWLP_WNDPROC, orig);
                                }
                                diag.push_str(&format!("; HIDE {} ({:#010x}->{:#010x})", prev, style, new_style));
                            }
                        }
                    },
                    None => {
                        diag.push_str("; prev_win=NOT_FOUND");
                    }
                }
            }
        }

        // 現在のウィンドウをAlt+Tabに表示（WS_EX_TOOLWINDOW を除去、WS_EX_APPWINDOW を付与）
        match app.get_webview_window(&label) {
            Some(cur_win) => unsafe {
                if let Ok(handle) = cur_win.window_handle() {
                    let raw = handle.as_raw();
                    if let RawWindowHandle::Win32(win32_handle) = raw {
                        let hwnd = HWND(win32_handle.hwnd.get());
                        let style = GetWindowLongW(hwnd, GWL_EXSTYLE);
                        let new_style = (style as u32 & !WS_EX_TOOLWINDOW.0) | WS_EX_APPWINDOW.0;
                        SetWindowLongW(hwnd, GWL_EXSTYLE, new_style as i32);
                        // ITaskbarList::AddTab でシェルのAlt+Tabリストに直接追加
                        if let Ok(tbl) = CoCreateInstance::<_, ITaskbarList>(&TaskbarList, None, CLSCTX_INPROC_SERVER) {
                            let _ = tbl.HrInit();
                            let _ = tbl.AddTab(hwnd);
                        }
                        // 最小化ブロックのWndProcを登録（元のProcをHashMapに保存）
                        let orig = GetWindowLongPtrW(hwnd, GWLP_WNDPROC);
                        original_wndprocs()
                            .lock().unwrap_or_else(|p| p.into_inner())
                            .insert(hwnd.0, orig);
                        SetWindowLongPtrW(hwnd, GWLP_WNDPROC, minimize_block_proc as isize);
                        let after = GetWindowLongW(hwnd, GWL_EXSTYLE);
                        diag.push_str(&format!("; SHOW {:#010x}->{:#010x} verify={:#010x}", style, new_style, after));
                    }
                }
            },
            None => {
                diag.push_str("; cur_win=NOT_FOUND");
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, state);
        diag.push_str("; (non-windows noop)");
    }

    Ok(diag)
}

// [NEW] プールウィンドウを show+resize+move を1回の SetWindowPos で原子的に実行する。
// JS 側から thisWin.show() → setSize → setPosition の順で呼ぶと、
// show() が WINDOWPLACEMENT の古い位置を復元してしまい、その後 setPosition が
// JS async タイミングの問題で失敗することがある。
// SetWindowPos(SWP_SHOWWINDOW) は表示と位置を原子的に設定し WINDOWPLACEMENT を使わないため
// マルチモニター環境でも安定して動作する。
#[tauri::command]
async fn fusen_show_at_position(
    label: String,
    phys_x: Option<i32>,   // None → SWP_NOMOVE (位置変更なし、サイズのみ適用)
    phys_y: Option<i32>,
    phys_width: u32,
    phys_height: u32,
    app: tauri::AppHandle,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::WindowsAndMessaging::{
            SetWindowPos, SetForegroundWindow, HWND_TOP, SET_WINDOW_POS_FLAGS,
            SWP_SHOWWINDOW, SWP_NOMOVE,
        };
        use windows::Win32::Foundation::HWND;
        use raw_window_handle::RawWindowHandle;

        if let Some(win) = app.get_webview_window(&label) {
            unsafe {
                if let Ok(handle) = win.window_handle() {
                    if let RawWindowHandle::Win32(h) = handle.as_raw() {
                        let hwnd = HWND(h.hwnd.get());
                        // 位置が指定されている場合は位置+サイズ、なければサイズのみ
                        let flags: SET_WINDOW_POS_FLAGS = if phys_x.is_some() {
                            SWP_SHOWWINDOW
                        } else {
                            SWP_SHOWWINDOW | SWP_NOMOVE
                        };
                        SetWindowPos(
                            hwnd,
                            HWND_TOP,
                            phys_x.unwrap_or(0),
                            phys_y.unwrap_or(0),
                            phys_width as i32,
                            phys_height as i32,
                            flags,
                        ).map_err(|e| format!("SetWindowPos failed: {}", e))?;
                        // SetForegroundWindow でOSのフォアグラウンドに設定する。
                        // SetWindowPos だけでは document.hasFocus()=false のままで
                        // CodeMirror が hasFocus=false を報告し、キー入力を受け付けない。
                        // このコマンドはユーザー操作（+ボタン等）直後に呼ばれるため
                        // Windows のフォアグラウンド制限に引っかからない。
                        let _ = SetForegroundWindow(hwnd);
                    }
                }
            }
            // [FIX] 生Win32 SetWindowPos(SWP_SHOWWINDOW) はOSには表示を伝えるが
            // Tauri の内部 visibility 状態を更新しない。
            // win.show() で Tauri 状態を同期しないと、後続の Tauri API 呼び出し時に
            // tao が "hidden" 判定してウィンドウを非表示にするバグが発生する。
            let _ = win.show();
        }
    }

    #[cfg(not(target_os = "windows"))]
    let _ = (label, phys_x, phys_y, phys_width, phys_height, app);

    Ok(())
}

#[tauri::command]
async fn fusen_create_pool_window(app: tauri::AppHandle) -> Result<String, String> {
    // [FIX] Ctrl+N連打クラッシュ防止: 500ms以内の連続呼び出しをブロック
    // JS側スロットル（1.2秒）のダブルガード。付箋昇格（promote）には影響しない。
    use std::sync::atomic::Ordering;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    let last = LAST_POOL_CREATE_MS.load(Ordering::SeqCst);
    if now.saturating_sub(last) < 500 {
        logger::log_debug("[Pool] fusen_create_pool_window: throttled (< 500ms), skipping.");
        return Ok("Throttled".into());
    }
    LAST_POOL_CREATE_MS.store(now, Ordering::SeqCst);

    logger::log_info("[Pool] fusen_create_pool_window called (async)");
    create_pool_window_internal(&app)?;
    Ok("Pool window created".into())
}

fn create_pool_window_internal(app: &tauri::AppHandle) -> Result<(), String> {
    let uuid = uuid::Uuid::new_v4().to_string();
    let label = format!("pool-window-{}", uuid);
    
    logger::log_debug(&format!("[Pool] Creating hidden pool window: {}", label));
    
    // 背景色は透明ではなく黄色で初期化（OSレベルでの白フラッシュ防止）
    tauri::WebviewWindowBuilder::new(
        app,
        &label,
        tauri::WebviewUrl::App("/?path=&isPool=true".into())
    )
    .title("Quick Memo")
    .transparent(false) // 透明にせずに不透明にする
    .decorations(false)
    .visible(false) // 予備なので最初は非表示
    .focused(false) // [FIX] ここでフォーカスを奪わないようにする
    .skip_taskbar(true)
    .build()
    .map_err(|e| e.to_string())?;
    
    Ok(())
}


// --- Entry Point ---

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(std::sync::Mutex::new(state::AppState::default()))
        .plugin(tauri_plugin_os::init()) // Added tauri_plugin_os::init()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // 二重起動時: 最後にフォーカスした付箋を前面に出す
            let state = app.state::<Mutex<AppState>>();
            let label = state.lock().unwrap_or_else(|p| p.into_inner())
                .last_alt_tab_window.clone();
            let target_win = if let Some(label) = label {
                app.get_webview_window(&label)
            } else {
                app.webview_windows().into_values()
                    .find(|w| w.label() != "main" && !w.label().starts_with("pool-window-"))
            };
            if let Some(win) = target_win {
                let _ = win.show();
                // AttachThreadInput + SetForegroundWindow でスレッド間のフォアグラウンド制限を回避
                #[cfg(target_os = "windows")]
                {
                    use windows::Win32::UI::WindowsAndMessaging::{
                        SetForegroundWindow, BringWindowToTop, ShowWindow, SW_RESTORE,
                    };
                    use windows::Win32::Foundation::HWND;
                    use raw_window_handle::RawWindowHandle;
                    if let Ok(handle) = win.window_handle() {
                        if let RawWindowHandle::Win32(h) = handle.as_raw() {
                            unsafe {
                                let hwnd = HWND(h.hwnd.get());
                                let _ = ShowWindow(hwnd, SW_RESTORE);
                                let _ = SetForegroundWindow(hwnd);
                                let _ = BringWindowToTop(hwnd);
                            }
                        }
                    }
                }
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            fusen_debug_log, // [NEW] Frontend Logging Bridge
            fusen_set_always_on_top,
            fusen_select_folder,
            fusen_list_notes,
            fusen_read_note,
            fusen_create_note,
            fusen_duplicate_note,
            fusen_save_note,
            fusen_move_to_trash,
            fusen_get_state,
            fusen_add_tag,
            fusen_remove_tag,
            fusen_delete_tag_globally,
            fusen_get_all_tags,
            fusen_get_active_tags,
            fusen_set_active_tags,
            fusen_archive_note,
            fusen_open_containing_folder,
            fusen_open_file,
            show_context_menu,
            get_base_path,
            setup_first_launch,
            settings::get_settings,  // ← 「settings箱の中の」と指定！
            settings::save_settings,  // ← 「settings箱の中の」と指定！
            capture::fusen_capture_screen, // [NEW] 画面キャプチャ
            sound::fusen_play_sound, // [NEW] サウンド再生
            fusen_search_notes, // [NEW] 全文検索
            clipboard::fusen_get_image_from_clipboard, // [NEW] クリップボード画像取得
            fusen_make_tool_window, // [NEW] Alt+Tab/タスクビューから除外
            fusen_set_as_alt_tab_window, // [NEW] 直前に使用した付箋のみAlt+Tabに表示
            fusen_create_pool_window, // [NEW] プールウィンドウ生成
            fusen_show_at_position, // [NEW] プールウィンドウをShow+リサイズ+移動を原子的に実行
        ])
        /* .on_menu_event(|app, event| {
             // handle_menu_event(app, &event);
        }) */
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let label = window.label();
                if label == "main" {
                    // mainウィンドウの×はアプリを終了させず、JSの onCloseRequested に委ねる（win.hide()）
                    api.prevent_close();
                } else if !label.starts_with("pool-window-") {
                    // 付箋ウィンドウをタスクバーから「ウィンドウを閉じる」→ アプリ終了
                    // ※JSからの削除・アーカイブ時は destroy() を使うためここには来ない
                    window.app_handle().exit(0);
                }
            }
        })
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
                    let mut app_state = state.lock().unwrap_or_else(|p| p.into_inner());
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
                app.handle().plugin(tauri_plugin_log::Builder::default().timezone_strategy(tauri_plugin_log::TimezoneStrategy::UseLocal).build())?;
            }
            
            app.handle().plugin(tauri_plugin_shell::init())?;
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
            app.handle().plugin(tauri_plugin_process::init())?;
            
            if let Some(win) = app.get_webview_window("main") {
                // 古いPWA (ServiceWorker) のキャッシュを強制クリアする
                let _ = win.eval(r#"
                    (async function clearServiceWorkerCache() {
                        try {
                            let cleared = false;
                            if ('serviceWorker' in navigator) {
                                const registrations = await navigator.serviceWorker.getRegistrations();
                                for (const reg of registrations) {
                                    await reg.unregister();
                                    cleared = true;
                                }
                            }
                            if ('caches' in window) {
                                const names = await caches.keys();
                                for (const name of names) {
                                    await caches.delete(name);
                                    cleared = true;
                                }
                            }
                            if (cleared) {
                                window.location.reload();
                            }
                        } catch(e) {}
                    })();
                "#);
            }

            // Autostart plugin (デスクトップのみ)
            #[cfg(desktop)]
            {
                app.handle().plugin(tauri_plugin_autostart::init(
                    tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                    None, // 引数なし
                ))?;

                // 設定に従って自動起動をOSに登録/解除
                use tauri_plugin_autostart::ManagerExt;
                let auto_start = storage::load_settings()
                    .unwrap_or_default()
                    .auto_start;
                if auto_start {
                    let _ = app.handle().autolaunch().enable();
                } else {
                    let _ = app.handle().autolaunch().disable();
                }
            }

            tray::create_tray(app.handle())?;
            
            // [NEW] グローバルショートカット: Ctrl+Shift+H で全付箋を隠す/表示する
            use tauri_plugin_global_shortcut::{Builder as ShortcutBuilder, ShortcutState};
            
            // 付箋の表示/非表示状態を追跡するための静的変数
            use std::sync::atomic::{AtomicBool, Ordering};
            static NOTES_HIDDEN: AtomicBool = AtomicBool::new(false);
            
            // [Fix] Safely attempt to register shortcuts
            match ShortcutBuilder::new().with_shortcuts(["ctrl+shift+h"]) {
                Ok(builder) => {
                    let plugin = builder
                        .with_handler(|app, _shortcut, event| {
                            if event.state == ShortcutState::Pressed {
                                if !can_do_visibility_op() { return; }
                                let is_hidden = NOTES_HIDDEN.load(Ordering::SeqCst);
                                NOTES_HIDDEN.store(!is_hidden, Ordering::SeqCst);
                                let visible = is_hidden; // was hidden → now show (true)
                                let _ = app.emit("fusen:set_all_notes_visible", visible);
                                
                                logger::log_info(&format!(
                                    "[Shortcut] Ctrl+Shift+H pressed. Notes now {}.",
                                    if is_hidden { "SHOWN" } else { "HIDDEN" }
                                ));
                            }
                        })
                        .build();

                    if let Err(e) = app.handle().plugin(plugin) {
                        logger::log_warn(&format!("Failed to initialize global shortcut plugin: {}", e));
                    }
                },
                Err(e) => {
                    logger::log_warn(&format!("Failed to register global shortcuts (might be conflicting): {}", e));
                }
            }
            
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
