/*
 * Tauri アプリケーションバックエンド (Core)
 *
 * 責務:
 * - Tauriコマンドの登録とハンドリング
 * - アプリケーションライフサイクルの管理
 * - 各モジュールの統合 (State, Logic, Storage, etc.)
 */

use raw_window_handle::HasWindowHandle;
use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Listener, Manager, Runtime, State};

mod arrange;
mod capture; // [NEW] キャプチャ機能
mod clipboard; // [NEW] クリップボード機能
mod crash_guard;
mod distribution;
mod desktop_shortcut;
mod double_tap;
mod gdrive; // Google Drive 連携
mod hotkey_manager;
mod import; // インポート機能
mod logger; // ログシステム
mod launcher;
mod logic;
mod perflog; // パフォーマンス計測ログ（JSON Lines）
mod settings;
mod member_identity;
mod sound; // [NEW] サウンド機能
mod state;
mod storage;
mod tray;
mod triple_right_click;
mod webpush; // Web Push (VAPID + AES-128-GCM + APNs) // 注入DLL由来の例外を記録するクラッシュガード（Windows専用）
use state::{AppState, CreateRecipeNoteRequest, Note, NoteMeta, ProConfig, RecipeCandidates};

static TRASH_OPERATIONS_IN_FLIGHT: std::sync::LazyLock<
    Mutex<std::collections::HashSet<String>>,
> = std::sync::LazyLock::new(|| Mutex::new(std::collections::HashSet::new()));

#[derive(serde::Serialize)]
struct TrashMoveResult {
    moved: bool,
    path: String,
}

fn try_begin_trash_operation(path: &str) -> bool {
    TRASH_OPERATIONS_IN_FLIGHT
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .insert(path.to_lowercase())
}

fn finish_trash_operation(path: &str) {
    TRASH_OPERATIONS_IN_FLIGHT
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .remove(&path.to_lowercase());
}

#[cfg(test)]
mod trash_operation_tests {
    use super::{finish_trash_operation, try_begin_trash_operation};

    #[test]
    fn duplicate_trash_operation_is_rejected_until_first_finishes() {
        let path = "C:/test/duplicate-trash-operation.md";
        finish_trash_operation(path);
        assert!(try_begin_trash_operation(path));
        assert!(!try_begin_trash_operation(path));
        finish_trash_operation(path);
        assert!(try_begin_trash_operation(path));
        finish_trash_operation(path);
    }

    #[test]
    fn different_paths_can_be_deleted_without_an_artificial_delay() {
        let first = "C:/notes/a.md";
        let second = "C:/notes/b.md";
        finish_trash_operation(first);
        finish_trash_operation(second);
        assert!(try_begin_trash_operation(first));
        assert!(try_begin_trash_operation(second));
        finish_trash_operation(first);
        finish_trash_operation(second);
    }
}

// --- Commands ---

#[tauri::command]
fn fusen_debug_log(message: String) {
    // [DEBUG] Redirect to file logger for persistence (especially for Release/Auto-launch)
    // Using log_info to ensure it appears in standard log file
    logger::log_info(&format!("[Frontend] {}", message));
    println!("[Frontend] {}", message);
}

#[tauri::command]
fn fusen_get_distribution_info() -> String {
    distribution::get_distribution_kind().to_string()
}

#[tauri::command]
fn fusen_open_startup_settings() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows::core::HSTRING;
        use windows::Foundation::Uri;
        use windows::System::Launcher;

        let uri = Uri::CreateUri(&HSTRING::from("ms-settings:startupapps"))
            .map_err(|e| e.to_string())?;
        let launched = Launcher::LaunchUriAsync(&uri)
            .map_err(|e| e.to_string())?
            .get()
            .map_err(|e| e.to_string())?;

        if launched {
            Ok(())
        } else {
            Err("Windows のスタートアップ設定を開けませんでした".to_string())
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("Windows 以外では利用できません".to_string())
    }
}

const STARTUP_TASK_ID: &str = "OreNoFusenStartup";

#[cfg(target_os = "windows")]
fn startup_task_state_to_string(
    state: windows::ApplicationModel::StartupTaskState,
) -> &'static str {
    use windows::ApplicationModel::StartupTaskState;

    match state {
        StartupTaskState::Enabled => "enabled",
        StartupTaskState::Disabled => "disabled",
        StartupTaskState::DisabledByUser => "disabled_by_user",
        StartupTaskState::DisabledByPolicy => "disabled_by_policy",
        _ => "disabled",
    }
}

#[cfg(target_os = "windows")]
fn get_startup_task() -> windows::core::Result<windows::ApplicationModel::StartupTask> {
    use windows::core::HSTRING;
    use windows::ApplicationModel::StartupTask;

    StartupTask::GetAsync(&HSTRING::from(STARTUP_TASK_ID))?.get()
}

#[cfg(target_os = "windows")]
fn get_msix_startup_state() -> Result<String, String> {
    let task = get_startup_task().map_err(|e| e.to_string())?;
    let state = task.State().map_err(|e| e.to_string())?;
    Ok(startup_task_state_to_string(state).to_string())
}

#[tauri::command]
fn fusen_get_startup_state() -> String {
    if !distribution::is_msix_packaged() {
        return "desktop".to_string();
    }

    #[cfg(target_os = "windows")]
    {
        get_msix_startup_state().unwrap_or_else(|e| {
            logger::log_warn(&format!("MSIX StartupTask state read failed: {}", e));
            "disabled".to_string()
        })
    }

    #[cfg(not(target_os = "windows"))]
    {
        "desktop".to_string()
    }
}

#[tauri::command]
fn fusen_set_startup_enabled(enabled: bool) -> String {
    if !distribution::is_msix_packaged() {
        return "desktop".to_string();
    }

    #[cfg(target_os = "windows")]
    {
        let result = (|| -> Result<String, String> {
            let task = get_startup_task().map_err(|e| e.to_string())?;
            if enabled {
                let state = task
                    .RequestEnableAsync()
                    .map_err(|e| e.to_string())?
                    .get()
                    .map_err(|e| e.to_string())?;
                Ok(startup_task_state_to_string(state).to_string())
            } else {
                task.Disable().map_err(|e| e.to_string())?;
                let state = task.State().map_err(|e| e.to_string())?;
                Ok(startup_task_state_to_string(state).to_string())
            }
        })();

        result.unwrap_or_else(|e| {
            logger::log_warn(&format!("MSIX StartupTask update failed: {}", e));
            get_msix_startup_state().unwrap_or_else(|_| "disabled".to_string())
        })
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = enabled;
        "desktop".to_string()
    }
}

#[tauri::command]
fn fusen_select_folder(state: State<'_, Mutex<AppState>>) -> Option<String> {
    let folder_opt = rfd::FileDialog::new().pick_folder();
    if let Some(path_buf) = folder_opt {
        let path = path_buf.to_string_lossy().to_string();
        let notes = storage::list_notes(&path);

        logic::apply_set_folder(
            &mut *state.lock().unwrap_or_else(|p| p.into_inner()),
            path.clone(),
            notes,
        );
        Some(path)
    } else {
        None
    }
}

#[tauri::command]
fn fusen_pick_folder() -> Option<String> {
    rfd::FileDialog::new()
        .pick_folder()
        .map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
fn fusen_import_from_folder(
    state: State<'_, Mutex<AppState>>,
    source_path: String,
    target_path: String,
) -> Result<import::ImportStats, String> {
    let stats = import::import_markdown_files(&source_path, &target_path)?;
    let notes = storage::list_notes(&target_path);
    logic::apply_set_folder(
        &mut *state.lock().unwrap_or_else(|p| p.into_inner()),
        target_path,
        notes,
    );
    Ok(stats)
}

#[tauri::command]
fn fusen_backup(app: AppHandle, source_path: String, dest_path: String, include_trash: bool) -> Result<usize, String> {
    let count = storage::backup_notes_with_options(&source_path, &dest_path, include_trash)?;
    let mut settings = storage::load_settings()?;
    settings.backup_history.insert(0, state::BackupRecord {
        path: dest_path,
        created_at: chrono::Local::now().to_rfc3339(),
        file_count: count,
    });
    settings.backup_history.truncate(2);
    storage::save_settings(&settings)?;
    let _ = app.emit("settings_updated", &settings);
    Ok(count)
}

#[tauri::command]
fn fusen_monthly_backup_due() -> Result<bool, String> {
    let settings = storage::load_settings()?;
    if !settings.monthly_backup_enabled {
        return Ok(false);
    }
    let Some(next_prompt) = settings.monthly_backup_next_prompt else {
        return Ok(true);
    };
    let next = chrono::DateTime::parse_from_rfc3339(&next_prompt)
        .map_err(|_| "月次バックアップの確認日時が不正です".to_string())?;
    Ok(chrono::Local::now() >= next.with_timezone(&chrono::Local))
}

#[tauri::command]
fn fusen_snooze_monthly_backup(app: AppHandle) -> Result<(), String> {
    let mut settings = storage::load_settings()?;
    settings.monthly_backup_skip_count = settings.monthly_backup_skip_count.saturating_add(1);
    if settings.monthly_backup_skip_count >= 2 {
        settings.monthly_backup_enabled = false;
        settings.monthly_backup_next_prompt = None;
    } else {
        settings.monthly_backup_next_prompt = Some(
            (chrono::Local::now() + chrono::Duration::days(7)).to_rfc3339(),
        );
    }
    storage::save_settings(&settings)?;
    let _ = app.emit("settings_updated", &settings);
    Ok(())
}

#[tauri::command]
fn fusen_run_monthly_backup(app: AppHandle) -> Result<state::BackupRecord, String> {
    let mut settings = storage::load_settings()?;
    let source_path = settings.base_path.clone().ok_or("データ保存場所が未設定です")?;
    let user_profile = std::env::var("USERPROFILE")
        .map_err(|_| "USERPROFILE not found".to_string())?;
    let root = Path::new(&user_profile).join("Documents").join("OreNoFusen_Backup");
    let current = root.join("Monthly");
    let pending = root.join("Monthly_pending");
    let previous = root.join("Monthly_previous");
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    if pending.exists() {
        std::fs::remove_dir_all(&pending).map_err(|e| e.to_string())?;
    }
    std::fs::create_dir(&pending).map_err(|e| e.to_string())?;
    let pending_str = pending.to_string_lossy().to_string();
    let count = match storage::backup_notes_with_options(
        &source_path,
        &pending_str,
        settings.backup_include_trash,
    ) {
        Ok(count) => count,
        Err(error) => {
            let _ = std::fs::remove_dir_all(&pending);
            return Err(error);
        }
    };
    let copied_count = walkdir::WalkDir::new(&pending).into_iter().filter_map(Result::ok)
        .filter(|e| e.file_type().is_file()).count();
    if count != copied_count {
        let _ = std::fs::remove_dir_all(&pending);
        return Err("月次バックアップの検証に失敗しました".to_string());
    }
    if previous.exists() {
        std::fs::remove_dir_all(&previous).map_err(|e| e.to_string())?;
    }
    if current.exists() {
        std::fs::rename(&current, &previous).map_err(|e| e.to_string())?;
    }
    if let Err(e) = std::fs::rename(&pending, &current) {
        if previous.exists() {
            let _ = std::fs::rename(&previous, &current);
        }
        return Err(e.to_string());
    }
    if previous.exists() {
        let _ = std::fs::remove_dir_all(&previous);
    }
    let record = state::BackupRecord {
        path: current.to_string_lossy().to_string(),
        created_at: chrono::Local::now().to_rfc3339(),
        file_count: count,
    };
    settings.monthly_backup_record = Some(record.clone());
    settings.monthly_backup_skip_count = 0;
    settings.monthly_backup_next_prompt = Some(
        (chrono::Local::now() + chrono::Duration::days(settings.monthly_backup_interval_days)).to_rfc3339(),
    );
    storage::save_settings(&settings)?;
    let _ = app.emit("settings_updated", &settings);
    Ok(record)
}

#[tauri::command]
fn fusen_restore_backup(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    backup_path: String,
) -> Result<String, String> {
    let source = Path::new(&backup_path);
    if !source.is_dir() {
        return Err("バックアップ先が見つかりません".to_string());
    }
    let markdown_count = walkdir::WalkDir::new(source)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file() && entry.path().extension().is_some_and(|ext| ext == "md"))
        .count();
    if markdown_count == 0 {
        return Err("復旧できるMarkdownファイルがありません".to_string());
    }
    let user_profile = std::env::var("USERPROFILE")
        .map_err(|_| "USERPROFILE not found".to_string())?;
    let recovery_root = Path::new(&user_profile)
        .join("Documents")
        .join("OreNoFusen_Recovery");
    std::fs::create_dir_all(&recovery_root).map_err(|e| e.to_string())?;
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let recovery = recovery_root.join(format!("OreNoFusen_recovered_{}", timestamp));
    std::fs::create_dir(&recovery).map_err(|e| e.to_string())?;
    let recovery_str = recovery.to_string_lossy().to_string();
    // 復旧対象に削除済みのTrashは含めない。本文・現行データだけを復旧する。
    if let Err(e) = storage::backup_notes_with_options(&backup_path, &recovery_str, false) {
        let _ = std::fs::remove_dir_all(&recovery);
        return Err(e);
    }
    let recovered_markdown_count = walkdir::WalkDir::new(&recovery)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file() && entry.path().extension().is_some_and(|ext| ext == "md"))
        .count();
    if recovered_markdown_count != markdown_count {
        let _ = std::fs::remove_dir_all(&recovery);
        return Err("復旧コピーの検証に失敗しました".to_string());
    }
    let mut settings = storage::load_settings()?;
    settings.base_path = Some(recovery_str.clone());
    storage::save_settings(&settings)?;
    {
        let mut app_state = state.lock().unwrap_or_else(|p| p.into_inner());
        app_state.base_path = Some(recovery_str.clone());
        app_state.folder_path = Some(recovery_str.clone());
        app_state.notes = storage::list_notes(&recovery_str);
    }
    let _ = app.emit("settings_updated", &settings);
    Ok(recovery_str)
}

#[tauri::command]
fn fusen_set_always_on_top(window: tauri::Window, enabled: bool) -> Result<(), String> {
    // [FIX] Tauri の set_always_on_top() は内部 visibility 状態を参照するため、
    // fusen_show_at_position (生Win32 SetWindowPos) で表示したプールウィンドウに対して
    // 呼び出すと tao が "hidden" 判定でウィンドウを非表示にする。
    // 生Win32 SetWindowPos を直接使用することで Tauri 内部状態の影響を排除する。
    #[cfg(target_os = "windows")]
    {
        use raw_window_handle::{HasWindowHandle, RawWindowHandle};
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{
            SetWindowPos, HWND_NOTOPMOST, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
        };

        unsafe {
            if let Ok(handle) = window.window_handle() {
                if let RawWindowHandle::Win32(win32_handle) = handle.as_raw() {
                    let hwnd = HWND(win32_handle.hwnd.get());
                    let z_order = if enabled {
                        HWND_TOPMOST
                    } else {
                        HWND_NOTOPMOST
                    };
                    SetWindowPos(
                        hwnd,
                        z_order,
                        0,
                        0,
                        0,
                        0,
                        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                    )
                    .map_err(|e| format!("SetWindowPos failed: {}", e))?;
                }
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        window
            .set_always_on_top(enabled)
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn bring_arranged_window_to_front_no_activate<R: Runtime>(
    window: &tauri::WebviewWindow<R>,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use raw_window_handle::RawWindowHandle;
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{
            SetWindowPos, HWND_TOP, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
        };

        unsafe {
            let handle = window
                .window_handle()
                .map_err(|e| format!("window_handle failed: {}", e))?;
            if let RawWindowHandle::Win32(win32_handle) = handle.as_raw() {
                let hwnd = HWND(win32_handle.hwnd.get());
                SetWindowPos(
                    hwnd,
                    HWND_TOP,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                )
                .map_err(|e| format!("SetWindowPos(HWND_TOP) failed: {}", e))?;
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = window;
    }

    Ok(())
}

#[tauri::command]
fn fusen_set_opacity(
    window_label: Option<String>,
    path: Option<String>,
    opacity: f64,
    app: tauri::AppHandle,
) -> Result<(), String> {
    if !(0.0..=1.0).contains(&opacity) {
        return Err(format!("opacity out of range: {}", opacity));
    }

    let label = window_label
        .or_else(|| path.as_deref().map(get_window_label))
        .ok_or_else(|| "window_label or path is required".to_string())?;
    let alpha = (opacity * 255.0).round() as u8;

    #[cfg(target_os = "windows")]
    {
        use raw_window_handle::RawWindowHandle;
        use windows::Win32::Foundation::{COLORREF, HWND};
        use windows::Win32::UI::WindowsAndMessaging::{
            GetWindowLongPtrW, SetLayeredWindowAttributes, SetWindowLongPtrW, GWL_EXSTYLE,
            LWA_ALPHA, WS_EX_LAYERED,
        };

        let win = app
            .get_webview_window(&label)
            .ok_or_else(|| format!("window not found: {}", label))?;

        unsafe {
            if let Ok(handle) = win.window_handle() {
                if let RawWindowHandle::Win32(h) = handle.as_raw() {
                    let hwnd = HWND(h.hwnd.get());

                    let current_ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
                    if current_ex & (WS_EX_LAYERED.0 as isize) == 0 {
                        let new_ex = current_ex | (WS_EX_LAYERED.0 as isize);
                        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new_ex);
                    }

                    SetLayeredWindowAttributes(hwnd, COLORREF(0), alpha, LWA_ALPHA).map_err(
                        |e| format!("SetLayeredWindowAttributes({}) failed: {}", alpha, e),
                    )?;
                }
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (label, alpha, app);
    }

    Ok(())
}

#[tauri::command]
fn fusen_list_notes(state: State<'_, Mutex<AppState>>, folder_path: String) -> Vec<NoteMeta> {
    let notes = storage::list_notes(&folder_path);

    logic::apply_set_folder(
        &mut *state.lock().unwrap_or_else(|p| p.into_inner()),
        folder_path,
        notes.clone(),
    );
    notes
}

#[tauri::command]
fn fusen_read_note(state: State<'_, Mutex<AppState>>, path: String) -> Result<Note, String> {
    // 読み込み失敗を握りつぶさず呼び出し側へ伝える。
    // 以前は失敗時に空 Note を返していたため、frontend が「読込成功・中身は空」と誤認し、
    // 開いていた付箋の作業コピーを空で上書きしてしまう不具合があった（データ空化の根本原因）。
    let mut note = storage::read_note(&path)?;
    if let Some(recovered_content) = storage::load_newer_recovery_draft(&path) {
        logger::log_warn(&format!(
            "[recovery] newer recovery copy loaded file={}",
            logger::sanitize_path(&path)
        ));
        note.body = recovered_content;
    }

    logic::apply_select_note(&mut *state.lock().unwrap_or_else(|p| p.into_inner()), path);
    Ok(note)
}

fn preserve_failed_save(path: &str, content: &str, save_error: String) -> String {
    let file_name = logger::sanitize_path(path);
    match storage::save_recovery_draft(path, content) {
        Ok(()) => logger::log_warn(&format!(
            "[recovery] normal save failed; recovery copy saved file={}",
            file_name
        )),
        Err(_) => logger::log_error(&format!(
            "[recovery] normal save and recovery copy both failed file={}",
            file_name
        )),
    }
    save_error
}

/// ノート作成の共通ロジック。Mutex を lock したまま get_next_seq → write_note → apply_add_note
/// を 1 トランザクションで実行する（pool 窓間の連番衝突を防ぐ Mutex 排他）。
fn do_create_note(
    state: &Mutex<AppState>,
    folder_path: &str,
    context: &str,
) -> Result<Note, String> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    // Mutex を lock して排他区間を開始
    let mut app_state = state.lock().unwrap_or_else(|p| p.into_inner());
    let next_seq = storage::get_next_seq(folder_path);
    let data = logic::build_create_note_data(folder_path, context, next_seq, &today);
    // I/O は排他区間内で実行（lock は write_note 完了まで保持）
    storage::write_note(&data.path_str, &data.content)?;
    logic::apply_add_note(&mut app_state, data.meta.clone());
    // lock はここで drop される
    Ok(Note {
        body: data.body,
        frontmatter: data.frontmatter,
        meta: data.meta,
    })
}

const SETTINGS_RECOVERY_NOTICE_BODY: &str = "設定ファイルを読み込めなかったため、安全な初期設定で起動しました。\n\n付箋ファイルは削除していません。一部の設定は初期値に戻っています。\n\n以前の付箋が表示されない場合は、設定の「データ管理」から取り込めます。\n\nこの付箋は確認後に削除できます。";

fn create_settings_recovery_notice(
    state: &Mutex<AppState>,
    folder_path: &str,
) -> Result<Note, String> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let mut app_state = state.lock().unwrap_or_else(|p| p.into_inner());
    let next_seq = storage::get_next_seq(folder_path);
    let mut data = logic::build_create_note_data(
        folder_path,
        "設定を安全な初期状態へ復旧しました",
        next_seq,
        &today,
    );
    data.body = SETTINGS_RECOVERY_NOTICE_BODY.to_string();
    data.content = format!("{}\n\n{}", data.frontmatter, data.body);
    storage::write_note(&data.path_str, &data.content)?;
    logic::apply_add_note(&mut app_state, data.meta.clone());
    Ok(Note {
        body: data.body,
        frontmatter: data.frontmatter,
        meta: data.meta,
    })
}

#[tauri::command]
fn fusen_create_note(
    state: State<'_, Mutex<AppState>>,
    folder_path: String,
    context: String,
) -> Result<Note, String> {
    do_create_note(&state, &folder_path, &context)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct IphoneNoteCreateResult {
    note: Note,
    created: bool,
}

fn iphone_source_hash(note_id: &str) -> String {
    use sha2::{Digest, Sha256};
    format!("{:x}", Sha256::digest(note_id.as_bytes()))
}

#[tauri::command]
fn fusen_has_iphone_note(folder_path: String, note_id: String) -> bool {
    let source_hash = iphone_source_hash(&note_id);
    storage::find_note_by_iphone_source_hash(&folder_path, &source_hash).is_some()
}

/// iPhone受信付箋を、受信ID単位で一度だけ作成する。
/// AppState の排他中に既存確認と作成を行い、同時実行でも重複させない。
#[tauri::command]
fn fusen_create_iphone_note(
    state: State<'_, Mutex<AppState>>,
    folder_path: String,
    context: String,
    body: String,
    note_id: String,
) -> Result<IphoneNoteCreateResult, String> {
    let source_hash = iphone_source_hash(&note_id);
    let mut app_state = state.lock().unwrap_or_else(|p| p.into_inner());

    if let Some(path) = storage::find_note_by_iphone_source_hash(&folder_path, &source_hash) {
        return Ok(IphoneNoteCreateResult {
            note: storage::read_note(&path)?,
            created: false,
        });
    }

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let next_seq = storage::get_next_seq(&folder_path);
    let mut data = logic::build_create_note_data(&folder_path, &context, next_seq, &today);
    let closing_fence = data
        .frontmatter
        .rfind("---")
        .ok_or_else(|| "付箋の管理情報を作成できませんでした".to_string())?;
    data.frontmatter.insert_str(
        closing_fence,
        &format!("iphone_source_hash: {}\n", source_hash),
    );
    data.content = format!("{}\n\n{}", data.frontmatter, body);
    data.body = body;
    storage::write_note(&data.path_str, &data.content)?;
    logic::apply_add_note(&mut app_state, data.meta.clone());

    Ok(IphoneNoteCreateResult {
        note: Note {
            body: data.body,
            frontmatter: data.frontmatter,
            meta: data.meta,
        },
        created: true,
    })
}

/// 1 文字目入力時にのみ呼ぶ lazy ファイル作成コマンド。
/// fusen_create_note と同等だが名前で用途を明示する（Pool 昇格後の遅延ファイル作成）。
/// Mutex 排他で複数 pool 窓が同時呼び出した場合の連番衝突を防ぐ。
#[tauri::command]
fn fusen_create_note_lazy(
    state: State<'_, Mutex<AppState>>,
    folder_path: String,
    context: String,
) -> Result<Note, String> {
    crate::perf_event!(
        &format!("lazy-{}", uuid::Uuid::new_v4()),
        "T2_FIRST_CHAR_RUST_ENTER",
        None,
        None,
        serde_json::json!({}),
    );
    do_create_note(&state, &folder_path, &context)
}

fn read_recipe_candidate_input(path: &Path) -> Option<logic::RecipeCandidateInput> {
    let content = std::fs::read_to_string(path).ok()?;
    let (_, body) = logic::split_frontmatter(&content);
    let (_, _, _, _, background_color, _, tags, _) = logic::extract_meta_from_content(&content);
    let filename = path.file_name()?.to_string_lossy().to_string();
    let (_, _, context) = logic::parse_filename(&filename);

    Some(logic::RecipeCandidateInput {
        path: path.to_string_lossy().to_string(),
        title: context,
        body: body.to_string(),
        background_color,
        tags,
    })
}

fn recipe_source_tags(source: &Note) -> Vec<String> {
    source.meta.tags.clone()
}

#[tauri::command]
fn fusen_get_recipe_candidates(
    state: State<'_, Mutex<AppState>>,
    source_path: String,
) -> Result<RecipeCandidates, String> {
    let base_path = {
        let app_state = state.lock().unwrap_or_else(|p| p.into_inner());
        app_state
            .base_path
            .clone()
            .or(app_state.folder_path.clone())
            .ok_or("base_path is not set")?
    };

    let source = storage::read_note(&source_path)?;
    let source_tags = recipe_source_tags(&source);
    let source_pathbuf = Path::new(&source_path);
    let candidates = storage::list_recipe_material_note_paths(Path::new(&base_path))
        .into_iter()
        .filter(|path| path != source_pathbuf)
        .filter_map(|path| read_recipe_candidate_input(&path))
        .collect();

    Ok(logic::filter_recipe_candidates(&source_tags, candidates))
}

#[tauri::command]
fn fusen_create_recipe_note(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    request: CreateRecipeNoteRequest,
) -> Result<String, String> {
    let base_path = {
        let app_state = state.lock().unwrap_or_else(|p| p.into_inner());
        app_state
            .base_path
            .clone()
            .or(app_state.folder_path.clone())
            .ok_or("base_path is not set")?
    };
    let base_path = Path::new(&base_path);
    let recipes_dir = storage::ensure_recipes_dir(base_path)?;
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let now = chrono::Local::now().to_rfc3339();
    let title = if request.title.trim().is_empty() {
        "recipe".to_string()
    } else {
        request.title.trim().to_string()
    };
    let safe_title = logic::sanitize_context(&title);
    let context = if safe_title.is_empty() { "recipe".to_string() } else { safe_title };
    let tags = logic::recipe_tags_from_request(&request.tags);
    let next_seq = storage::get_next_seq(&recipes_dir.to_string_lossy());
    let filename = logic::generate_crystal_filename("Reci", next_seq, &today, &context);
    let path = recipes_dir.join(filename);
    let frontmatter = logic::generate_recipe_frontmatter(next_seq, &title, &now, &now, &tags);
    let content = format!("{}\n\n{}", frontmatter, request.body);

    storage::write_note(&path.to_string_lossy(), &content)?;
    launcher::emit_launcher_shelf_changed(&app);

    Ok(path.to_string_lossy().to_string())
}

fn create_qa_note_file(base_path: &Path, request: CreateRecipeNoteRequest) -> Result<String, String> {
    let qa_dir = storage::ensure_qa_dir(base_path)?;
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let now = chrono::Local::now().to_rfc3339();
    let title = if request.title.trim().is_empty() {
        "qa".to_string()
    } else {
        request.title.trim().to_string()
    };
    let safe_title = logic::sanitize_context(&title);
    let context = if safe_title.is_empty() { "qa".to_string() } else { safe_title };
    let tags = logic::qa_tags_from_request(&request.tags);
    let next_seq = storage::get_next_seq(&qa_dir.to_string_lossy());
    let filename = logic::generate_crystal_filename("QA", next_seq, &today, &context);
    let path = qa_dir.join(filename);
    let frontmatter = logic::generate_recipe_frontmatter(next_seq, &title, &now, &now, &tags);
    let content = format!("{}\n\n{}", frontmatter, request.body);

    storage::write_note(&path.to_string_lossy(), &content)?;

    Ok(path.to_string_lossy().to_string())
}

fn create_term_note_file(base_path: &Path, request: CreateRecipeNoteRequest) -> Result<String, String> {
    let terms_dir = storage::ensure_terms_dir(base_path)?;
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let now = chrono::Local::now().to_rfc3339();
    let title = if request.title.trim().is_empty() {
        "term".to_string()
    } else {
        request.title.trim().to_string()
    };
    let safe_title = logic::sanitize_context(&title);
    let context = if safe_title.is_empty() { "term".to_string() } else { safe_title };
    let tags = logic::term_tags_from_request(&request.tags);
    let next_seq = storage::get_next_seq(&terms_dir.to_string_lossy());
    let filename = logic::generate_crystal_filename("Term", next_seq, &today, &context);
    let path = terms_dir.join(filename);
    let frontmatter = logic::generate_recipe_frontmatter(next_seq, &title, &now, &now, &tags);
    let content = format!("{}\n\n{}", frontmatter, request.body);

    storage::write_note(&path.to_string_lossy(), &content)?;

    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn fusen_create_qa_note(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    request: CreateRecipeNoteRequest,
) -> Result<String, String> {
    let base_path = {
        let app_state = state.lock().unwrap_or_else(|p| p.into_inner());
        app_state
            .base_path
            .clone()
            .or(app_state.folder_path.clone())
            .ok_or("base_path is not set")?
    };
    let path = create_qa_note_file(Path::new(&base_path), request)?;

    launcher::emit_launcher_shelf_changed(&app);

    Ok(path)
}

#[tauri::command]
fn fusen_create_term_note(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    request: CreateRecipeNoteRequest,
) -> Result<String, String> {
    let base_path = {
        let app_state = state.lock().unwrap_or_else(|p| p.into_inner());
        app_state
            .base_path
            .clone()
            .or(app_state.folder_path.clone())
            .ok_or("base_path is not set")?
    };
    let path = create_term_note_file(Path::new(&base_path), request)?;

    launcher::emit_launcher_shelf_changed(&app);

    Ok(path)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReturnRecipeGeometry {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

#[tauri::command]
fn fusen_return_recipe(
    path: String,
    body: String,
    improved: bool,
    geometry: ReturnRecipeGeometry,
) -> Result<String, String> {
    let note = storage::read_note(&path)?;
    let now = chrono::Local::now();
    let used_at = now.to_rfc3339();
    let updated_at = now.format("%Y-%m-%d").to_string();
    let geometry_value = format!(
        "{{ x: {}, y: {}, width: {}, height: {} }}",
        geometry.x, geometry.y, geometry.width, geometry.height
    );
    let content_with_geometry =
        logic::update_frontmatter_value(&note.body, "window", geometry_value);
    let content = logic::build_return_recipe_content(
        &content_with_geometry,
        &body,
        improved,
        &used_at,
        &updated_at,
    );
    storage::write_note(&path, &content)?;
    launcher::invalidate_quick_open_content(&path);
    Ok(content)
}

#[tauri::command]
fn fusen_duplicate_note(
    state: State<'_, Mutex<AppState>>,
    path: String,
    x: Option<f64>,
    y: Option<f64>,
    snapshot_body: Option<String>,
    snapshot_frontmatter: Option<String>,
) -> Result<Note, String> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    // 画面上の最新状態を優先する。未指定の旧呼び出しだけディスクを読む。
    let (orig_front, orig_body) = match (snapshot_frontmatter, snapshot_body) {
        (Some(frontmatter), Some(body)) => (frontmatter, body),
        _ => {
            let original = storage::read_note(&path).map_err(|e| e.to_string())?;
            let (frontmatter, body) = logic::split_frontmatter(&original.body);
            (frontmatter.to_string(), body.to_string())
        }
    };
    let (orig_x, orig_y, orig_width, orig_height, _, _, _, _) =
        logic::extract_meta_from_content(&orig_front);

    // stateからfolder_pathとcontextを取得（lockをすぐ解放）
    let (folder_path, context, next_seq) = {
        let app_state = state.lock().unwrap_or_else(|p| p.into_inner());
        let fp = app_state.folder_path.clone().ok_or("No folder set")?;
        let ctx = app_state
            .notes
            .iter()
            .find(|n| n.path == path)
            .map(|n| n.context.clone())
            .unwrap_or_else(|| "copy".to_string());
        let seq = storage::get_next_seq(&fp);
        (fp, ctx, seq)
    };

    let duplicate_x = x.or(orig_x).unwrap_or(100.0);
    let duplicate_y = y.or(orig_y).unwrap_or(100.0);
    let duplicate_width = orig_width.unwrap_or(400.0);
    let duplicate_height = orig_height.unwrap_or(300.0);
    let new_frontmatter = logic::duplicate_frontmatter(
        &orig_front,
        next_seq,
        &today,
        duplicate_x,
        duplicate_y,
        duplicate_width,
        duplicate_height,
    );
    let new_filename = logic::generate_filename(next_seq, &today, &context);
    let new_path_str = std::path::Path::new(&folder_path)
        .join(&new_filename)
        .to_string_lossy()
        .to_string();
    let duplicated_body = storage::duplicate_associated_assets(
        std::path::Path::new(&path),
        orig_body.trim(),
        std::path::Path::new(&folder_path),
    )?;
    let content = format!("{}\n\n{}", new_frontmatter, duplicated_body);
    storage::write_note(&new_path_str, &content)?;

    let (meta_x, meta_y, meta_width, meta_height, background_color, always_on_top, tags, folded) =
        logic::extract_meta_from_content(&new_frontmatter);
    let meta = NoteMeta {
        path: new_path_str,
        seq: next_seq,
        context,
        updated: today,
        x: meta_x,
        y: meta_y,
        width: meta_width,
        height: meta_height,
        background_color,
        always_on_top,
        folded,
        opacity: logic::extract_opacity(&new_frontmatter),
        font_size: logic::extract_font_size(&new_frontmatter),
        tags,
    };

    logic::apply_add_note(
        &mut *state.lock().unwrap_or_else(|p| p.into_inner()),
        meta.clone(),
    );

    Ok(Note {
        body: duplicated_body,
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
    allow_rename: bool,
) -> Result<String, String> {
    // Read old content for change detection
    let old_note = storage::read_note(&path).ok();
    let old_body = old_note
        .as_ref()
        .map(|n| {
            // storage::read_note returns full content as body currently
            // We need to extract the actual body part to compare correctly with incoming 'body'
            let (_, body) = logic::split_frontmatter(&n.body);
            body.to_string()
        })
        .unwrap_or_default();

    let mut app_state = state.lock().unwrap_or_else(|p| p.into_inner());

    // Logicに全て任せる
    let (new_path, effect) = logic::handle_save_note(
        &mut app_state,
        &path,
        &body,
        &old_body,
        &frontmatter_raw,
        allow_rename,
    )?;

    // CommandはI/Oを実行するだけ
    match effect {
        logic::Effect::WriteNote { path, content } => {
            if let Err(error) = storage::write_note(&path, &content) {
                return Err(preserve_failed_save(&path, &content, error));
            }
        }
        logic::Effect::RenameNote { old_path, new_path } => {
            if std::path::Path::new(&old_path).exists() {
                storage::rename_note(&old_path, &new_path)?;
            }
        }
        logic::Effect::Batch(effects) => {
            for e in effects {
                match e {
                    logic::Effect::WriteNote { path, content } => {
                        if let Err(error) = storage::write_note(&path, &content) {
                            return Err(preserve_failed_save(&path, &content, error));
                        }
                    }
                    logic::Effect::RenameNote { old_path, new_path } => {
                        if std::path::Path::new(&old_path).exists() {
                            storage::rename_note(&old_path, &new_path)?;
                        }
                    }
                    logic::Effect::Batch(_) => {} // Nested batch not supported
                }
            }
        }
    }

    storage::clear_recovery_draft(&path);
    if new_path != path {
        storage::clear_recovery_draft(&new_path);
    }

    Ok(new_path)
}

#[tauri::command]
fn fusen_move_to_trash(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    path: String,
) -> Result<TrashMoveResult, String> {
    if !try_begin_trash_operation(&path) {
        logger::log_warn("[trash] duplicate in-flight request ignored");
        return Ok(TrashMoveResult { moved: false, path });
    }

    let result = move_note_to_trash_once(&app, &state, &path);
    finish_trash_operation(&path);
    result
}

fn move_note_to_trash_once(
    app: &AppHandle,
    state: &State<'_, Mutex<AppState>>,
    path: &str,
) -> Result<TrashMoveResult, String> {
    let current_path = Path::new(&path);

    // 多重要求や移動済みファイルは成功扱いにするが、UI側へ再実行させない。
    if !current_path.exists() {
        return Ok(TrashMoveResult {
            moved: false,
            path: path.to_string(),
        });
    }

    let parent = current_path.parent().ok_or("no parent")?;

    let trash_dir = storage::ensure_trash_dir(parent)?;

    let filename = current_path.file_name().ok_or("no name")?.to_string_lossy();
    let new_path = non_colliding_path(&trash_dir.join(filename.as_ref()));
    let new_path_str = new_path.to_string_lossy().to_string();

    // Move associated assets (images) to Trash as well. Delete originals only after note move succeeds.
    storage::copy_associated_assets(current_path, &trash_dir)?;
    storage::rename_note(&path, &new_path_str)?;
    if let Err(e) = storage::delete_associated_assets(current_path) {
        logger::log_warn(&format!("[trash] associated asset cleanup skipped: {}", e));
    }

    logic::apply_remove_note(&mut *state.lock().unwrap_or_else(|p| p.into_inner()), &path);
    if let Err(e) = storage::append_trash_operation(current_path, &new_path, "note_window") {
        logger::log_warn(&format!("[trash] operation log failed: {}", e));
    }
    if let Err(e) = launcher::handle_note_trashed(&app, &path, &new_path_str) {
        logger::log_warn(&format!("[trash] launcher cleanup skipped: {}", e));
    }

    // ウィンドウのクローズは JS 側（useStickyNoteContextMenu）が担当
    Ok(TrashMoveResult {
        moved: true,
        path: new_path_str,
    })
}

fn non_colliding_path(path: &Path) -> std::path::PathBuf {
    if !path.exists() {
        return path.to_path_buf();
    }

    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("note");
    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");

    for i in 1..1000 {
        let filename = if ext.is_empty() {
            format!("{} ({})", stem, i)
        } else {
            format!("{} ({}).{}", stem, i, ext)
        };
        let candidate = parent.join(filename);
        if !candidate.exists() {
            return candidate;
        }
    }

    if ext.is_empty() {
        parent.join(format!("{}-{}", stem, uuid::Uuid::new_v4()))
    } else {
        parent.join(format!("{}-{}.{}", stem, uuid::Uuid::new_v4(), ext))
    }
}

fn resolve_archive_user_tag(
    target_tag: Option<String>,
    tags: &[String],
) -> Result<Option<String>, String> {
    match target_tag {
        Some(tag) if logic::is_reserved_tag(&tag) => {
            Err("system tags cannot be used as archive destinations".to_string())
        }
        Some(tag) => Ok(Some(tag)),
        None => Ok(logic::non_reserved_tags(tags).into_iter().next()),
    }
}

#[cfg(test)]
mod archive_user_tag_tests {
    use super::resolve_archive_user_tag;

    fn tags(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| value.to_string()).collect()
    }

    #[test]
    fn falls_back_to_first_user_tag() {
        assert_eq!(
            resolve_archive_user_tag(None, &tags(&["shortcut", "仕事", "調査"])).unwrap(),
            Some("仕事".to_string())
        );
    }

    #[test]
    fn system_tag_only_falls_back_to_archive() {
        assert_eq!(
            resolve_archive_user_tag(None, &tags(&["shortcut"])).unwrap(),
            None
        );
    }

    #[test]
    fn rejects_explicit_system_tag_destination() {
        assert!(resolve_archive_user_tag(
            Some(" SHORTCUT ".to_string()),
            &tags(&["仕事", "shortcut"]),
        )
        .is_err());
    }
}

#[tauri::command]
fn fusen_archive_note(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    path: String,
    target_tag: Option<String>,
) -> Result<String, String> {
    let current_path = std::path::Path::new(&path);

    // 1. Get current tags
    let content = storage::read_note(&path)?;
    let (_, _, _, _, _, _, tags, _) = logic::extract_meta_from_content(&content.body);

    // 2. Determine vault root
    let vault_root = {
        let app_state = state.lock().unwrap_or_else(|p| p.into_inner());
        app_state
            .base_path
            .clone()
            .or(app_state.folder_path.clone())
            .ok_or("Vault root not found")?
    };
    let vault_root_path = std::path::Path::new(&vault_root);

    // 3. Move/Link files and handle assets
    // タグフォルダ・アーカイブへ移動前にアプリ固有フィールドを除去（Obsidian互換化）
    let cleaned_content = storage::add_archived_at(
        &logic::strip_sticky_fields(&content.body),
        &chrono::Utc::now().to_rfc3339(),
    );

    // target_tag が指定されていればそのタグフォルダへ、なければ従来通り
    let resolved_tag = resolve_archive_user_tag(target_tag, &tags)?;

    if let Some(tag) = resolved_tag {
        let tag_dir = storage::ensure_tag_dir(vault_root_path, &tag)?;
        let new_path = tag_dir.join(current_path.file_name().ok_or("no name")?);

        storage::overwrite_associated_assets(current_path, &tag_dir)?;
        storage::write_note(&new_path.to_string_lossy(), &cleaned_content)?;
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
        if let Err(e) = storage::delete_associated_assets(current_path) {
            logger::log_warn(&format!(
                "[archive] associated asset cleanup skipped: {}",
                e
            ));
        }
    } else {
        // タグなし → Archive フォルダへ
        let archive_dir = storage::ensure_archive_dir(vault_root_path)?;
        let new_path = archive_dir.join(current_path.file_name().ok_or("no name")?);

        storage::overwrite_associated_assets(current_path, &archive_dir)?;
        storage::write_note(&new_path.to_string_lossy(), &cleaned_content)?;
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
        if let Err(e) = storage::delete_associated_assets(current_path) {
            logger::log_warn(&format!(
                "[archive] associated asset cleanup skipped: {}",
                e
            ));
        }
    }

    // 4. Update state
    logic::apply_remove_note(&mut *state.lock().unwrap_or_else(|p| p.into_inner()), &path);
    let _ = app.emit("fusen:archive_changed", ());

    // 5. Cleanup original assets? (Optional but requested as "移動")
    // Note: copy_associated_assets used fs::copy.
    // If we want "Move", we should delete original after successful move of the note.
    // However, since multiple notes might share assets (rare in this app but possible),
    // we'll stick to Copy-and-Success-Move for now.

    // ウィンドウのクローズは JS 側（useStickyNoteContextMenu）が担当
    Ok("Archived successfully".to_string())
}

#[tauri::command]
fn fusen_list_archived_notes(
    state: State<'_, Mutex<AppState>>,
) -> Result<Vec<storage::ArchivedNoteSummary>, String> {
    let base_path = {
        let app_state = state.lock().unwrap_or_else(|p| p.into_inner());
        app_state
            .base_path
            .clone()
            .or(app_state.folder_path.clone())
            .ok_or("base_path is not set")?
    };
    Ok(storage::list_archived_notes(Path::new(&base_path)))
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RestoreArchivedNoteResult {
    source_path: String,
    restored_path: Option<String>,
    status: String,
    error: Option<String>,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RestoreArchivedNotesResult {
    restored: Vec<RestoreArchivedNoteResult>,
    conflicts: Vec<RestoreArchivedNoteResult>,
    failed: Vec<RestoreArchivedNoteResult>,
}

#[tauri::command]
fn fusen_restore_archived_notes(
    state: State<'_, Mutex<AppState>>,
    paths: Vec<String>,
) -> Result<RestoreArchivedNotesResult, String> {
    let base_path = {
        let app_state = state.lock().unwrap_or_else(|p| p.into_inner());
        app_state.base_path.clone().or(app_state.folder_path.clone()).ok_or("base_path is not set")?
    };
    let mut result = RestoreArchivedNotesResult { restored: Vec::new(), conflicts: Vec::new(), failed: Vec::new() };
    let mut seen = std::collections::HashSet::new();

    for source_path in paths {
        if !seen.insert(source_path.clone()) { continue; }
        match storage::restore_archived_note(Path::new(&base_path), Path::new(&source_path)) {
            Ok(path) => result.restored.push(RestoreArchivedNoteResult {
                source_path,
                restored_path: Some(path.to_string_lossy().to_string()),
                status: "restored".to_string(),
                error: None,
            }),
            Err(error) if error.starts_with("conflict:") => result.conflicts.push(RestoreArchivedNoteResult {
                source_path,
                restored_path: None,
                status: "conflict".to_string(),
                error: Some(error),
            }),
            Err(error) => result.failed.push(RestoreArchivedNoteResult {
                source_path,
                restored_path: None,
                status: "failed".to_string(),
                error: Some(error),
            }),
        }
    }

    if !result.restored.is_empty() {
        state.lock().unwrap_or_else(|p| p.into_inner()).notes = storage::list_notes(&base_path);
    }
    Ok(result)
}

// [NEW] 全文検索
#[derive(serde::Serialize, Clone)]
pub struct SearchHit {
    pub path: String,
    pub line: usize,
    pub preview: String,
    pub kind: Option<String>,
}

fn crystal_kind_for_path(path: &Path) -> Option<String> {
    let parent = path.parent()?.file_name()?.to_string_lossy();
    if parent.eq_ignore_ascii_case(storage::QA_DIR_NAME) {
        Some("QA".to_string())
    } else if parent.eq_ignore_ascii_case(storage::RECIPES_DIR_NAME) {
        Some("Reci".to_string())
    } else if parent.eq_ignore_ascii_case(storage::TERMS_DIR_NAME) {
        Some("Term".to_string())
    } else {
        None
    }
}

#[tauri::command]
fn fusen_search_notes(state: State<'_, Mutex<AppState>>, query: String) -> Vec<SearchHit> {
    let app_state = state.lock().unwrap_or_else(|p| p.into_inner());
    let folder_path = match app_state
        .base_path
        .as_ref()
        .or(app_state.folder_path.as_ref())
    {
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
            if path_str.contains("\\Trash\\")
                || path_str.contains("/Trash/")
                || path_str.ends_with("Trash")
            {
                return false;
            }
            if path_str.contains("\\tags\\")
                || path_str.contains("/tags/")
                || path_str.ends_with("tags")
            {
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
                            kind: crystal_kind_for_path(entry.path()),
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
fn fusen_register_open_note_window(
    app: tauri::AppHandle,
    state: State<'_, Mutex<AppState>>,
    path: String,
    label: String,
) -> Result<(), String> {
    if app.get_webview_window(&label).is_none() {
        return Err("window not found".to_string());
    }

    let path = normalize_path_for_label(&path);
    if path.is_empty() {
        return Err("path is required".to_string());
    }

    let mut app_state = state.lock().unwrap_or_else(|p| p.into_inner());
    app_state
        .open_note_windows
        .retain(|_, registered_label| registered_label != &label);
    app_state.open_note_windows.insert(path, label);
    Ok(())
}

#[tauri::command]
fn fusen_resolve_open_note_window(
    app: tauri::AppHandle,
    state: State<'_, Mutex<AppState>>,
    path: String,
) -> Option<String> {
    let path = normalize_path_for_label(&path);
    let label = {
        let app_state = state.lock().unwrap_or_else(|p| p.into_inner());
        app_state.open_note_windows.get(&path).cloned()
    }?;

    if app.get_webview_window(&label).is_some() {
        return Some(label);
    }

    let mut app_state = state.lock().unwrap_or_else(|p| p.into_inner());
    app_state.open_note_windows.remove(&path);
    None
}

#[tauri::command]
fn fusen_unregister_open_note_window(
    state: State<'_, Mutex<AppState>>,
    label: String,
) {
    state
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .open_note_windows
        .retain(|_, registered_label| registered_label != &label);
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
fn fusen_open_tag_folder(state: State<'_, Mutex<AppState>>, tag: String) -> Result<(), String> {
    let vault_root = {
        let app_state = state.lock().unwrap_or_else(|p| p.into_inner());
        app_state
            .base_path
            .clone()
            .or(app_state.folder_path.clone())
            .ok_or("保存先フォルダが設定されていません")?
    };
    let tags_dir = Path::new(&vault_root).join("tags");
    let tag_dir = tags_dir.join(tag);
    let open_path = if tag_dir.exists() {
        tag_dir
    } else if tags_dir.exists() {
        tags_dir
    } else {
        Path::new(&vault_root).to_path_buf()
    };
    storage::open_file(open_path.to_string_lossy().as_ref())?;
    Ok(())
}

// 管理者ツール用: 設定ファイル（settings.json）のあるフォルダを開く
#[tauri::command]
fn fusen_open_settings_folder() -> Result<(), String> {
    let app_data = std::env::var("APPDATA").map_err(|_| "APPDATA not found".to_string())?;
    let config_dir = std::path::PathBuf::from(app_data).join("OreNoFusen");
    std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    storage::open_in_explorer(config_dir.to_string_lossy().as_ref())?;
    Ok(())
}

// 管理者ツール用: ログファイル（app.log）のあるフォルダを開く
#[tauri::command]
fn fusen_open_log_folder() -> Result<(), String> {
    let app_data =
        std::env::var("LOCALAPPDATA").map_err(|_| "LOCALAPPDATA not found".to_string())?;
    let log_dir = std::path::PathBuf::from(app_data).join("ore-no-fusen");
    std::fs::create_dir_all(&log_dir).map_err(|e| e.to_string())?;
    storage::open_in_explorer(log_dir.to_string_lossy().as_ref())?;
    Ok(())
}

// 管理者ツール用: Google Drive 上の「俺の付箋」フォルダ ID を返す（直リンク生成用）
#[tauri::command]
async fn fusen_get_drive_folder_id() -> Result<String, String> {
    let client = reqwest::Client::new();
    let access_token = gdrive::get_access_token(&client).await?;
    gdrive::ensure_folder(&client, &access_token).await
}

/// 管理者ツール用: PC→iPhone / iPhone→PC のキューに溜まっている未送信件数
#[derive(serde::Serialize)]
struct DriveQueueCounts {
    to_iphone: usize,
    from_iphone: usize,
}

/// キュー JSON の件数を数える。実体は { "items": [...] } 形式だが、
/// 旧仕様で配列だけの形式も読めるよう両対応する。
fn count_queue_items(v: &serde_json::Value) -> usize {
    if let Some(arr) = v.as_array() {
        return arr.len();
    }
    if let Some(arr) = v.get("items").and_then(|x| x.as_array()) {
        return arr.len();
    }
    0
}

#[tauri::command]
async fn fusen_get_drive_queue_counts() -> Result<DriveQueueCounts, String> {
    let client = reqwest::Client::new();
    let token = gdrive::get_access_token(&client).await?;

    // notes_to_iphone.json （PC→iPhone）の件数を取得。ファイル不在は 0 件扱い
    let to_iphone = match gdrive::download_json_with_migration(
        &client,
        &token,
        "notes_to_iphone.json",
        "fusen_note.json",
    )
    .await
    {
        Ok(v) => count_queue_items(&v),
        Err(_) => 0,
    };

    // notes_from_iphone.json （iPhone→PC）の件数を取得
    let from_iphone = match gdrive::download_json_with_migration(
        &client,
        &token,
        "notes_from_iphone.json",
        "fusen_from_iphone.json",
    )
    .await
    {
        Ok(v) => count_queue_items(&v),
        Err(_) => 0,
    };

    Ok(DriveQueueCounts {
        to_iphone,
        from_iphone,
    })
}

/// 管理者ツール用: Drive 上の任意 JSON ファイルを取得して整形済み文字列として返す。
/// fallback_filename が指定されていれば旧名からの自動移行を試みる。ファイル不在は空オブジェクト相当を返す。
#[tauri::command]
async fn fusen_read_drive_json(
    filename: String,
    fallback_filename: Option<String>,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let token = gdrive::get_access_token(&client).await?;
    let value = if let Some(fallback) = fallback_filename {
        gdrive::download_json_with_migration(&client, &token, &filename, &fallback).await
    } else {
        gdrive::download_json(&client, &token, &filename).await
    };
    match value {
        Ok(v) => serde_json::to_string_pretty(&v).map_err(|e| e.to_string()),
        Err(e) if e.contains("File not found") => Ok("{}".to_string()),
        Err(e) => Err(e),
    }
}

#[tauri::command]
async fn fusen_delete_drive_queue_json(
    filename: String,
    fallback_filename: Option<String>,
) -> Result<(), String> {
    let allowed = [
        "notes_to_iphone.json",
        "fusen_note.json",
        "notes_from_iphone.json",
        "fusen_from_iphone.json",
    ];
    if !allowed.contains(&filename.as_str()) {
        return Err(format!("削除できないファイルです: {}", filename));
    }
    if let Some(fallback) = fallback_filename.as_deref() {
        if !allowed.contains(&fallback) {
            return Err(format!("削除できないファイルです: {}", fallback));
        }
    }

    let client = reqwest::Client::new();
    let token = gdrive::get_access_token(&client).await?;
    gdrive::delete_file_by_name(&client, &token, &filename).await?;
    if let Some(fallback) = fallback_filename {
        gdrive::delete_file_by_name(&client, &token, &fallback).await?;
    }
    Ok(())
}

#[tauri::command]
fn fusen_add_tag(
    state: State<'_, Mutex<AppState>>,
    path: String,
    tag: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let mut app_state = state.lock().unwrap_or_else(|p| p.into_inner());

    // Read current content
    let content = storage::read_note(&path).map_err(|e| format!("Failed to read note: {}", e))?;

    // Add tag
    let effect = logic::handle_add_tag(&mut *app_state, &path, &content.body, &tag)?;

    // Execute effect
    if let logic::Effect::WriteNote { path, content } = effect {
        storage::write_note(&path, &content).map_err(|e| format!("Failed to write note: {}", e))?;
    }

    // Update tray menu
    drop(app_state);
    launcher::emit_launcher_shelf_changed_for_tag(&app, &tag);
    let _ = crate::tray::refresh_tray_menu(&app);

    Ok(())
}

#[tauri::command]
fn fusen_remove_tag(
    state: State<'_, Mutex<AppState>>,
    path: String,
    tag: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let mut app_state = state.lock().unwrap_or_else(|p| p.into_inner());

    // Read current content
    let content = storage::read_note(&path).map_err(|e| format!("Failed to read note: {}", e))?;

    // Remove tag
    let effect = logic::handle_remove_tag(&mut *app_state, &path, &content.body, &tag)?;

    // Execute effect
    if let logic::Effect::WriteNote { path, content } = effect {
        storage::write_note(&path, &content).map_err(|e| format!("Failed to write note: {}", e))?;
    }

    // Update tray menu
    drop(app_state); // Release lock before calling refresh_tray_menu
    launcher::emit_launcher_shelf_changed_for_tag(&app, &tag);
    let _ = crate::tray::refresh_tray_menu(&app);

    Ok(())
}

#[tauri::command]
fn fusen_delete_tag_globally(
    state: State<'_, Mutex<AppState>>,
    tag: String,
    app: tauri::AppHandle,
) -> Result<usize, String> {
    // CRITICAL FIX: Refresh notes list before processing to ensure we have the latest state
    let mut app_state = state.lock().unwrap_or_else(|p| p.into_inner());
    let base_path = app_state
        .base_path
        .clone()
        .or(app_state.folder_path.clone())
        .ok_or("base_path is not set")?;

    // Reload all notes to get the most up-to-date list
    app_state.notes = storage::list_notes(&base_path);

    // [事前チェック] 1枚でも書き換える前に、保存先フォルダが書き込み可能かを試し書きで確認する。
    // 権限なし・フォルダ消失・ディスク満杯などの「全滅する失敗」をここで先に弾き、
    // 付箋を中途半端に書き換えた状態を作らない（ユーザーに部分失敗を踏ませない）。
    // 個別ファイルの一時ロックは検知時刻と書込時刻の差で見抜けないため、そこはリトライが受け持つ。
    {
        let probe_path = std::path::Path::new(&base_path).join(".fusen_write_probe.tmp");
        if let Err(e) = std::fs::write(&probe_path, b"") {
            return Err(format!(
                "保存先フォルダに書き込めません。タグ削除を中止しました（付箋は変更していません）: {}",
                e
            ));
        }
        let _ = std::fs::remove_file(&probe_path);
    }

    let mut modified_count = 0;
    let mut modified_paths: Vec<String> = Vec::new(); // Track modified paths
    let mut failed_writes: Vec<String> = Vec::new();

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
                if let Ok(effect) =
                    logic::handle_remove_tag(&mut *app_state, &path, &note.body, tag_trimmed)
                {
                    if let logic::Effect::WriteNote {
                        path: write_path,
                        content,
                    } = effect
                    {
                        // 一時的な書込失敗（ファイルロック等）は、その1枚だけ短いリトライで
                        // 自動復旧を試みる。最大3回試して全滅した分だけ failed_writes に記録する。
                        let mut write_result = storage::write_note(&write_path, &content);
                        let mut attempts = 1;
                        while write_result.is_err() && attempts < 3 {
                            std::thread::sleep(std::time::Duration::from_millis(50 * attempts));
                            write_result = storage::write_note(&write_path, &content);
                            attempts += 1;
                        }
                        match write_result {
                            Ok(_) => {
                                modified_count += 1;
                                modified_paths.push(write_path);
                            }
                            Err(e) => {
                                failed_writes.push(format!(
                                    "{} ({}回試行後): {}",
                                    write_path, attempts, e
                                ));
                            }
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

    if !failed_writes.is_empty() {
        return Err(format!(
            "Failed to delete tag from {} note(s): {}",
            failed_writes.len(),
            failed_writes.join("; ")
        ));
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
    state
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .active_tags
        .clone()
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
            if !prev_slash {
                result.push(c);
            }
            prev_slash = true;
        } else {
            result.push(c);
            prev_slash = false;
        }
    }
    // 末尾スラッシュ除去
    while result.ends_with('/') {
        result.pop();
    }
    result
}

fn to_radix36(mut n: u64) -> String {
    if n == 0 {
        return "0".to_string();
    }
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
        hash = hash
            .wrapping_shl(5)
            .wrapping_sub(hash)
            .wrapping_add(c as i32);
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
fn get_filtered_note_paths(
    state: State<'_, Mutex<AppState>>,
    active_tags: &[String],
) -> Result<Vec<String>, String> {
    // 最新のノート一覧を取得
    let app_state = state.lock().unwrap_or_else(|p| p.into_inner());
    let base_path = app_state
        .base_path
        .clone()
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
        all_notes
            .into_iter()
            .filter(|n| {
                n.tags
                    .iter()
                    .any(|tag| selected.contains(&tag.trim().to_string()))
            })
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

/// Pool 窓の目標数（常時 3 個維持）
const POOL_TARGET: usize = 3;

/// 現在の pool 窓数と目標数から不足数を返す純粋関数。
/// テスト可能な形に分離（ファイルシステム・OS API に依存しない）。
pub(crate) fn count_missing_pool(current: usize, target: usize) -> usize {
    target.saturating_sub(current)
}

static LAST_IPHONE_NOTE_IDS: std::sync::LazyLock<
    std::sync::Mutex<std::collections::HashSet<String>>,
> = std::sync::LazyLock::new(|| std::sync::Mutex::new(std::collections::HashSet::new()));

pub fn can_do_visibility_op() -> bool {
    use std::sync::atomic::Ordering;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    let last = LAST_VISIBILITY_MS.load(Ordering::SeqCst);
    if now.saturating_sub(last) < 3000 {
        eprintln!(
            "[Visibility] クールダウン中のためスキップ ({}ms 経過)",
            now.saturating_sub(last)
        );
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
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{ShowWindowAsync, SW_HIDE, SW_SHOW};
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
pub fn update_tag_filter<R: tauri::Runtime>(
    app: &AppHandle<R>,
    state: State<'_, Mutex<AppState>>,
    tags: &[String],
) -> Result<(), String> {
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
    app.emit("fusen:sync_visible_notes", &visible_paths)
        .map_err(|e| e.to_string())?;
    eprintln!("[TagFilter] emit done.");

    Ok(())
}

#[tauri::command]
fn fusen_set_active_tags(
    state: State<'_, Mutex<AppState>>,
    tags: Vec<String>,
    app: tauri::AppHandle,
) -> Result<(), String> {
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
    let result = state
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .base_path
        .clone();
    logger::log_debug("get_base_path called");
    logger::log_debug(&format!("Returning: {:?}", result));
    logger::log_debug(&format!(
        "Type: {}",
        if result.is_none() { "None" } else { "Some" }
    ));
    result
}

// 指定パスがディレクトリとして実在するか
#[tauri::command]
fn fusen_path_exists(path: String) -> bool {
    std::path::Path::new(&path).is_dir()
}

#[tauri::command]
fn fusen_check_storage_health(path: String) -> Result<(), String> {
    storage::check_storage_health(&path)
}

fn log_startup_distribution_diagnostics() {
    logger::log_info(&format!(
        "distribution_kind: {}",
        distribution::get_distribution_kind()
    ));

    match std::env::current_exe() {
        Ok(path) => logger::log_info(&format!("diagnostic current_exe: {:?}", path)),
        Err(e) => logger::log_warn(&format!("diagnostic current_exe failed: {}", e)),
    }

    logger::log_info(&format!(
        "diagnostic APPDATA: {:?}",
        std::env::var("APPDATA")
    ));
    logger::log_info(&format!(
        "diagnostic LOCALAPPDATA: {:?}",
        std::env::var("LOCALAPPDATA")
    ));

    match storage::load_settings() {
        Ok(settings) => {
            logger::log_info(&format!("diagnostic base_path: {:?}", settings.base_path));
            if let Some(base_path) = settings.base_path {
                logger::log_info(&format!(
                    "diagnostic canonical_base_path: {:?}",
                    dunce::canonicalize(&base_path)
                ));
                logger::log_info(&format!(
                    "diagnostic base_path_is_symlink: {}",
                    std::fs::symlink_metadata(&base_path)
                        .map(|meta| meta.file_type().is_symlink())
                        .unwrap_or(false)
                ));
            }
        }
        Err(e) => logger::log_warn(&format!("diagnostic settings load failed: {}", e)),
    }

    match storage::get_settings_path() {
        Ok(path) => logger::log_info(&format!("diagnostic settings_path: {:?}", path)),
        Err(e) => logger::log_warn(&format!("diagnostic settings_path failed: {}", e)),
    }
}

// UC-01, UC-02, UC-03: セットアップ統合コマンド
#[tauri::command]
fn setup_first_launch(
    app_handle: tauri::AppHandle,
    state: State<'_, Mutex<AppState>>,
    use_default: bool,
    custom_path: Option<String>,
    import_path: Option<String>,
) -> Result<String, String> {
    use std::path::PathBuf;

    logger::log_action("Setup: User initiated first launch setup");

    // 1. ベースパスを決定
    let base_path = if use_default {
        // 推奨パス: Documents/OreNoFusen
        let docs = std::env::var("USERPROFILE").map_err(|_| {
            logger::log_error("USERPROFILE environment variable not found");
            "USERPROFILE not found".to_string()
        })?;
        PathBuf::from(docs)
            .join("Documents")
            .join("OreNoFusen")
            .to_string_lossy()
            .to_string()
    } else {
        custom_path.ok_or_else(|| {
            logger::log_error("Custom path required but not provided");
            "Custom path required".to_string()
        })?
    };

    logger::log_action(&format!(
        "Setup: Vault folder selected - {}",
        if use_default { "Default" } else { "Custom" }
    ));
    logger::log_debug(&format!(
        "Vault folder: {}",
        logger::sanitize_path(&base_path)
    ));

    storage::validate_storage_path(&base_path).map_err(|e| {
        logger::log_error(&format!("Invalid vault directory: {}", e));
        e
    })?;

    // 2. UC-03: フォルダ作成 + trashフォルダ作成
    storage::ensure_directory(&base_path).map_err(|e| {
        logger::log_error(&format!("Failed to create vault directory: {}", e));
        e
    })?;
    storage::ensure_trash_dir(&PathBuf::from(&base_path)).map_err(|e| {
        logger::log_error(&format!("Failed to create trash directory: {}", e));
        e
    })?;

    // 3. UC-02: インポート（オプション）
    if let Some(import_from) = import_path {
        logger::log_action("Setup: Importing notes from existing folder");
        storage::import_files(&import_from, &base_path).map_err(|e| {
            logger::log_error(&format!("Failed to import files: {}", e));
            e
        })?;
    }

    // 4. 設定保存
    // 既存の設定を読み込んで、base_pathだけを更新する。
    // 設定ファイルが壊れている/一時的に読めない場合は握りつぶさず中断する。
    // （load_settings はファイル不在なら Ok(既定) を返すため、? でエラーになるのは
    //  「存在するが読めない/壊れている」時だけ。空の既定で全設定を上書き保存して
    //  言語・同期設定などユーザー設定を丸ごと消す事故を防ぐ。）
    let mut settings = storage::load_settings()?;
    settings.base_path = Some(base_path.clone());
    if settings.monthly_backup_next_prompt.is_none() && settings.monthly_backup_record.is_none() {
        settings.monthly_backup_next_prompt = Some(
            (chrono::Local::now() + chrono::Duration::days(settings.monthly_backup_interval_days)).to_rfc3339(),
        );
    }

    storage::save_settings(&settings).map_err(|e| {
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
    app_handle
        .emit("settings_updated", &settings)
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
    path: String,
) -> Result<(), String> {
    // Store the target path in AppState for later use
    {
        let mut app_state = state.lock().unwrap_or_else(|p| p.into_inner());
        app_state.active_context_menu_path = Some(path.clone());
    }

    // Menu will be created and shown on frontend using @tauri-apps/api/menu
    Ok(())
}

// 付箋ウィンドウ（main以外）がフォーカスされているか確認
#[tauri::command]
async fn fusen_is_sticky_note_focused(app: tauri::AppHandle) -> bool {
    for (label, window) in app.webview_windows() {
        if label != "main" && window.is_focused().unwrap_or(false) {
            return true;
        }
    }
    false
}

fn arrange_note_seq(note: &arrange::ArrangeNote) -> i32 {
    let Some(filename) = std::path::Path::new(&note.path)
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
    else {
        return 0;
    };
    let (seq, _, _) = logic::parse_filename(&filename);
    seq
}

fn sort_notes_by_seq_desc(notes: &mut Vec<arrange::ArrangeNote>) {
    // Arrange order is decided here. Change only this function to switch ordering.
    notes.sort_by_cached_key(|note| std::cmp::Reverse(arrange_note_seq(note)));
}

fn update_note_window_position(path: &str, x: f64, y: f64) -> Result<(), String> {
    let note = storage::read_note(path)?;
    let re_window = regex::Regex::new(
        r"window:\s*\{\s*x:\s*(-?[\d\.]+),\s*y:\s*(-?[\d\.]+),\s*width:\s*(-?[\d\.]+),\s*height:\s*(-?[\d\.]+)\s*\}"
    ).map_err(|e| e.to_string())?;

    let Some(caps) = re_window.captures(&note.body) else {
        return Err("window metadata not found".to_string());
    };
    let width = caps.get(3).map(|m| m.as_str()).unwrap_or("400");
    let height = caps.get(4).map(|m| m.as_str()).unwrap_or("300");
    let replacement = format!(
        "window: {{ x: {:.1}, y: {:.1}, width: {}, height: {} }}",
        x, y, width, height
    );
    let updated_content = re_window
        .replace(&note.body, replacement.as_str())
        .to_string();
    storage::write_note(path, &updated_content)
}

fn is_crystal_tags(tags: &[String]) -> bool {
    tags.iter().any(|tag| {
        matches!(
            logic::normalize_reserved_tag(tag).as_str(),
            "recipe" | "qa" | "term"
        )
    })
}

fn arrange_tags_for_window(tags: Vec<String>, is_crystal: bool) -> Vec<String> {
    if is_crystal { Vec::new() } else { tags }
}

#[cfg(test)]
mod crystal_arrange_tests {
    use super::{arrange_tags_for_window, is_crystal_tags};

    fn tags(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| value.to_string()).collect()
    }

    #[test]
    fn recognizes_the_three_crystal_types() {
        assert!(is_crystal_tags(&tags(&["仕事", "recipe"])));
        assert!(is_crystal_tags(&tags(&["QA"])));
        assert!(is_crystal_tags(&tags(&["term"])));
        assert!(!is_crystal_tags(&tags(&["shortcut", "仕事"])));
    }

    #[test]
    fn crystal_is_always_arranged_as_unclassified() {
        assert!(arrange_tags_for_window(tags(&["recipe", "仕事"]), true).is_empty());
    }

    #[test]
    fn normal_note_keeps_its_tags_for_arrangement() {
        assert_eq!(
            arrange_tags_for_window(tags(&["shortcut", "仕事"]), false),
            tags(&["shortcut", "仕事"])
        );
    }
}

#[tauri::command]
fn fusen_register_crystal_arrange_window(
    state: State<'_, Mutex<AppState>>,
    label: String,
    path: String,
) -> Result<(), String> {
    let note = storage::read_note(&path)?;
    let (_, _, _, _, _, _, tags, _) = logic::extract_meta_from_content(&note.body);
    if !is_crystal_tags(&tags) {
        return Err("only crystal windows can be registered for crystal arrangement".to_string());
    }

    let mut app_state = state.lock().unwrap_or_else(|p| p.into_inner());
    app_state.arrange_crystal_windows.insert(label, path);
    Ok(())
}

#[tauri::command]
async fn fusen_arrange_by_tag(app: tauri::AppHandle) -> Result<(), String> {
    run_fusen_arrange_by_tag(app).await
}

#[tauri::command]
async fn fusen_arrange_undo(app: tauri::AppHandle) -> Result<(), String> {
    run_fusen_arrange_undo(app).await
}

pub(crate) async fn run_fusen_arrange_by_tag<R: Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<(), String> {
    let note_paths: Vec<String> = {
        let state = app.state::<Mutex<AppState>>();
        let app_state = state.lock().unwrap_or_else(|p| p.into_inner());
        app_state
            .notes
            .iter()
            .map(|note| note.path.clone())
            .collect()
    };
    let crystal_window_paths = {
        let state = app.state::<Mutex<AppState>>();
        let app_state = state.lock().unwrap_or_else(|p| p.into_inner());
        app_state.arrange_crystal_windows.clone()
    };

    let mut notes: Vec<arrange::ArrangeNote> = Vec::new();
    let mut undo_snapshot: Vec<(String, f64, f64)> = Vec::new();
    let mut window_labels_by_path: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    for (label, window) in app.webview_windows() {
        if label == "main" {
            continue;
        }

        logger::log_info(&format!("[ARRANGE] note window: {}", label));

        let window_scale_factor = window.scale_factor().ok().filter(|factor| *factor != 0.0);
        let logical_position = match (window.outer_position(), window_scale_factor) {
            (Ok(position), Some(scale_factor)) => Some((
                position.x as f64 / scale_factor,
                position.y as f64 / scale_factor,
            )),
            _ => None,
        };
        let current_window_size = match (window.outer_size(), window_scale_factor) {
            (Ok(size), Some(scale_factor)) => Some((
                size.width as f64 / scale_factor,
                size.height as f64 / scale_factor,
            )),
            _ => None,
        };

        let normal_path = note_paths
            .iter()
            .find(|path| get_window_label(path) == label)
            .cloned();
        let crystal_path = crystal_window_paths.get(&label).cloned();
        let is_crystal = normal_path.is_none() && crystal_path.is_some();
        let Some(path) = normal_path.or(crystal_path) else {
            logger::log_info(&format!("[ARRANGE] path not found for label: {}", label));
            continue;
        };
        window_labels_by_path.insert(path.clone(), label.clone());

        let content = match storage::read_note(&path) {
            Ok(note) => note.body,
            Err(e) => {
                logger::log_info(&format!("[ARRANGE] read failed path={} error={}", path, e));
                continue;
            }
        };
        let (_, _, width, height, background_color, _, tags, folded) =
            logic::extract_meta_from_content(&content);
        let tags = arrange_tags_for_window(tags, is_crystal);

        let folded = folded.unwrap_or(false);
        let Some((width, height)) =
            arrange::arrange_size_for_window(width, height, folded, current_window_size)
        else {
            logger::log_info(&format!("[ARRANGE] size missing path={}", path));
            continue;
        };

        let position_text = logical_position
            .map(|(x, y)| format!("{:.1},{:.1}", x, y))
            .unwrap_or_else(|| "unknown".to_string());
        logger::log_info(&format!(
            "[ARRANGE] meta path={} tags={:?} color={:?} size={:.1}x{:.1} position={}",
            path, tags, background_color, width, height, position_text
        ));

        if let Some((x, y)) = logical_position {
            undo_snapshot.push((path.clone(), x, y));
        }

        notes.push(arrange::ArrangeNote {
            path,
            tags,
            background_color,
            width,
            height,
            folded,
        });
    }
    logger::log_info(&format!("[ARRANGE] arrange note count: {}", notes.len()));

    let monitor = match app.primary_monitor() {
        Ok(Some(monitor)) => monitor,
        Ok(None) => {
            let message = "[ARRANGE] primary monitor not found".to_string();
            logger::log_info(&message);
            return Err(message);
        }
        Err(e) => {
            let message = format!("[ARRANGE] primary monitor error: {}", e);
            logger::log_info(&message);
            return Err(message);
        }
    };
    let scale_factor = monitor.scale_factor();
    if scale_factor == 0.0 {
        let message = "[ARRANGE] primary monitor scale factor is zero".to_string();
        logger::log_info(&message);
        return Err(message);
    }

    let monitor_work_area = monitor.work_area();
    let work_area = arrange::WorkArea {
        x: monitor_work_area.position.x as f64 / scale_factor,
        y: monitor_work_area.position.y as f64 / scale_factor,
        width: monitor_work_area.size.width as f64 / scale_factor,
        height: monitor_work_area.size.height as f64 / scale_factor,
    };
    logger::log_info(&format!(
        "[ARRANGE] primary monitor workArea logical x={:.1} y={:.1} width={:.1} height={:.1} scale={:.2}",
        work_area.x, work_area.y, work_area.width, work_area.height, scale_factor
    ));

    sort_notes_by_seq_desc(&mut notes);
    logger::log_info("[ARRANGE] sorted notes by seq desc");

    let positions = arrange::calculate_arrange_by_tag_positions(&notes, work_area);
    for position in &positions {
        logger::log_info(&format!(
            "[ARRANGE] calculated path={} -> x={:.1}, y={:.1}",
            position.path, position.x, position.y
        ));
    }
    logger::log_info(&format!(
        "[ARRANGE] calculated position count: {}",
        positions.len()
    ));

    {
        let state = app.state::<Mutex<AppState>>();
        let mut app_state = state.lock().unwrap_or_else(|p| p.into_inner());
        app_state.arrange_undo = if undo_snapshot.is_empty() {
            None
        } else {
            Some(undo_snapshot)
        };
    }

    let mut move_success_count = 0;
    let mut move_failed_count = 0;
    let mut moved_positions: Vec<(String, f64, f64)> = Vec::new();
    for position in &positions {
        let label = window_labels_by_path
            .get(&position.path)
            .cloned()
            .unwrap_or_else(|| get_window_label(&position.path));
        let Some(window) = app.get_webview_window(&label) else {
            logger::log_info(&format!(
                "[ARRANGE] move skipped path={} label={} reason=window_not_found",
                position.path, label
            ));
            move_failed_count += 1;
            continue;
        };

        match window.set_position(tauri::LogicalPosition::new(position.x, position.y)) {
            Ok(_) => {
                match bring_arranged_window_to_front_no_activate(&window) {
                    Ok(_) => {
                        logger::log_info(&format!(
                            "[ARRANGE] z-order success path={} label={}",
                            position.path, label
                        ));
                    }
                    Err(e) => {
                        logger::log_info(&format!(
                            "[ARRANGE] z-order failed path={} label={} error={}",
                            position.path, label, e
                        ));
                    }
                }
                logger::log_info(&format!(
                    "[ARRANGE] move success path={} label={} x={:.1} y={:.1}",
                    position.path, label, position.x, position.y
                ));
                move_success_count += 1;
                moved_positions.push((position.path.clone(), position.x, position.y));
            }
            Err(e) => {
                logger::log_info(&format!(
                    "[ARRANGE] move failed path={} label={} error={}",
                    position.path, label, e
                ));
                move_failed_count += 1;
            }
        }
    }
    logger::log_info(&format!(
        "[ARRANGE] move completed success={} failed={}",
        move_success_count, move_failed_count
    ));

    let mut frontmatter_success_count = 0;
    let mut frontmatter_failed_count = 0;
    for (path, x, y) in &moved_positions {
        match update_note_window_position(path, *x, *y) {
            Ok(_) => {
                logger::log_info(&format!(
                    "[ARRANGE] frontmatter update success path={} x={:.1} y={:.1}",
                    path, x, y
                ));
                frontmatter_success_count += 1;
            }
            Err(e) => {
                logger::log_info(&format!(
                    "[ARRANGE] frontmatter update failed path={} error={}",
                    path, e
                ));
                frontmatter_failed_count += 1;
            }
        }
    }
    logger::log_info(&format!(
        "[ARRANGE] frontmatter update completed success={} failed={}",
        frontmatter_success_count, frontmatter_failed_count
    ));
    Ok(())
}

pub(crate) async fn run_fusen_arrange_undo<R: Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<(), String> {
    let undo_snapshot = {
        let state = app.state::<Mutex<AppState>>();
        let mut app_state = state.lock().unwrap_or_else(|p| p.into_inner());
        app_state.arrange_undo.take()
    };

    let Some(undo_snapshot) = undo_snapshot else {
        logger::log_info("[ARRANGE] undo: no snapshot");
        return Ok(());
    };

    logger::log_info(&format!(
        "[ARRANGE] undo: snapshot count={}",
        undo_snapshot.len()
    ));

    let mut move_success_count = 0;
    let mut move_failed_count = 0;
    let mut moved_positions: Vec<(String, f64, f64)> = Vec::new();
    for (path, x, y) in &undo_snapshot {
        let label = {
            let state = app.state::<Mutex<AppState>>();
            let app_state = state.lock().unwrap_or_else(|p| p.into_inner());
            app_state
                .arrange_crystal_windows
                .iter()
                .find_map(|(label, crystal_path)| (crystal_path == path).then(|| label.clone()))
                .unwrap_or_else(|| get_window_label(path))
        };
        let Some(window) = app.get_webview_window(&label) else {
            logger::log_info(&format!(
                "[ARRANGE] undo move skipped path={} label={} reason=window_not_found",
                path, label
            ));
            move_failed_count += 1;
            continue;
        };

        match window.set_position(tauri::LogicalPosition::new(*x, *y)) {
            Ok(_) => {
                logger::log_info(&format!(
                    "[ARRANGE] undo move success path={} label={} x={:.1} y={:.1}",
                    path, label, x, y
                ));
                move_success_count += 1;
                moved_positions.push((path.clone(), *x, *y));
            }
            Err(e) => {
                logger::log_info(&format!(
                    "[ARRANGE] undo move failed path={} label={} error={}",
                    path, label, e
                ));
                move_failed_count += 1;
            }
        }
    }
    logger::log_info(&format!(
        "[ARRANGE] undo move completed success={} failed={}",
        move_success_count, move_failed_count
    ));

    let mut frontmatter_success_count = 0;
    let mut frontmatter_failed_count = 0;
    for (path, x, y) in &moved_positions {
        match update_note_window_position(path, *x, *y) {
            Ok(_) => {
                logger::log_info(&format!(
                    "[ARRANGE] undo frontmatter update success path={} x={:.1} y={:.1}",
                    path, x, y
                ));
                frontmatter_success_count += 1;
            }
            Err(e) => {
                logger::log_info(&format!(
                    "[ARRANGE] undo frontmatter update failed path={} error={}",
                    path, e
                ));
                frontmatter_failed_count += 1;
            }
        }
    }
    logger::log_info(&format!(
        "[ARRANGE] undo frontmatter update completed success={} failed={}",
        frontmatter_success_count, frontmatter_failed_count
    ));
    Ok(())
}

// [NEW] ウィンドウをAlt+Tab/タスクビューから除外する（WS_EX_TOOLWINDOW適用）
#[tauri::command]
async fn fusen_make_tool_window(window: tauri::Window) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use raw_window_handle::RawWindowHandle;
        use windows::Win32::Foundation::HWND;
        use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
        use windows::Win32::UI::Shell::{ITaskbarList, TaskbarList};
        use windows::Win32::UI::WindowsAndMessaging::{
            GetWindowLongW, SetWindowLongW, GWL_EXSTYLE, WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
        };

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
                    if let Ok(tbl) = CoCreateInstance::<_, ITaskbarList>(
                        &TaskbarList,
                        None,
                        CLSCTX_INPROC_SERVER,
                    ) {
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
    static PROCS: std::sync::OnceLock<std::sync::Mutex<std::collections::HashMap<isize, isize>>> =
        std::sync::OnceLock::new();
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
    use windows::Win32::Foundation::LRESULT;
    use windows::Win32::UI::WindowsAndMessaging::{CallWindowProcW, SC_MINIMIZE, WM_SYSCOMMAND};
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
            windows::Win32::Foundation::HWND,
            u32,
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
        use raw_window_handle::RawWindowHandle;
        use windows::Win32::Foundation::HWND;
        use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
        use windows::Win32::UI::Shell::{ITaskbarList, TaskbarList};
        use windows::Win32::UI::WindowsAndMessaging::{
            GetWindowLongPtrW, SetWindowLongPtrW, GWLP_WNDPROC,
        };
        use windows::Win32::UI::WindowsAndMessaging::{
            GetWindowLongW, SetWindowLongW, GWL_EXSTYLE, WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
        };

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
                                let new_style =
                                    (style as u32 | WS_EX_TOOLWINDOW.0) & !WS_EX_APPWINDOW.0;
                                SetWindowLongW(hwnd, GWL_EXSTYLE, new_style as i32);
                                // ITaskbarList::DeleteTab でシェルのAlt+Tabリストから直接削除
                                if let Ok(tbl) = CoCreateInstance::<_, ITaskbarList>(
                                    &TaskbarList,
                                    None,
                                    CLSCTX_INPROC_SERVER,
                                ) {
                                    let _ = tbl.HrInit();
                                    let _ = tbl.DeleteTab(hwnd);
                                }
                                // 最小化ブロックのWndProcを解除して元に戻す
                                if let Some(orig) = original_wndprocs()
                                    .lock()
                                    .unwrap_or_else(|p| p.into_inner())
                                    .remove(&hwnd.0)
                                {
                                    SetWindowLongPtrW(hwnd, GWLP_WNDPROC, orig);
                                }
                                diag.push_str(&format!(
                                    "; HIDE {} ({:#010x}->{:#010x})",
                                    prev, style, new_style
                                ));
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
                        if let Ok(tbl) = CoCreateInstance::<_, ITaskbarList>(
                            &TaskbarList,
                            None,
                            CLSCTX_INPROC_SERVER,
                        ) {
                            let _ = tbl.HrInit();
                            let _ = tbl.AddTab(hwnd);
                        }
                        // 最小化ブロックのWndProcを登録（元のProcをHashMapに保存）
                        let hook_proc = minimize_block_proc as *const () as isize;
                        let orig = GetWindowLongPtrW(hwnd, GWLP_WNDPROC);
                        if orig != hook_proc {
                            original_wndprocs()
                                .lock()
                                .unwrap_or_else(|p| p.into_inner())
                                .entry(hwnd.0)
                                .or_insert(orig);
                            SetWindowLongPtrW(hwnd, GWLP_WNDPROC, hook_proc);
                        } else {
                            diag.push_str("; WNDPROC_ALREADY_HOOKED");
                        }
                        let after = GetWindowLongW(hwnd, GWL_EXSTYLE);
                        diag.push_str(&format!(
                            "; SHOW {:#010x}->{:#010x} verify={:#010x}",
                            style, new_style, after
                        ));
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
// [Phase 19] Pool 昇格時: SetWindowPos → SetLayeredWindowAttributes(α=255) → SetForegroundWindow の
// 順序で 1 関数内で連続実行する（Atomic Coordination Constraint: JS からの複数 invoke await を禁止）
// pitfall 6: α=255 は SetForegroundWindow より前に設定する（透明窓に focus すると 1 文字目が消える）
#[tauri::command]
async fn fusen_show_at_position(
    label: String,
    phys_x: Option<i32>, // None → SWP_NOMOVE (位置変更なし、サイズのみ適用)
    phys_y: Option<i32>,
    phys_width: u32,
    phys_height: u32,
    run_id: Option<String>, // perflog 計測用 run_id（None なら perflog 記録しない）
    app: tauri::AppHandle,
) -> Result<bool, String> {
    let perf_started = perflog::enabled().then(std::time::Instant::now);

    // T1_RUST_ENTER: 関数突入時刻を記録（run_id が Some の場合のみ）
    if let Some(rid) = &run_id {
        crate::perf_event!(
            rid,
            "T1_RUST_ENTER",
            Some(&label),
            None,
            serde_json::json!({}),
        );
    }

    #[cfg(target_os = "windows")]
    {
        use raw_window_handle::RawWindowHandle;
        use windows::Win32::Foundation::{COLORREF, HWND};
        use windows::Win32::UI::WindowsAndMessaging::{
            SetForegroundWindow, SetLayeredWindowAttributes, SetWindowPos, HWND_TOP, LWA_ALPHA,
            SET_WINDOW_POS_FLAGS, SWP_NOMOVE, SWP_SHOWWINDOW,
        };

        if let Some(win) = app.get_webview_window(&label) {
            unsafe {
                if let Ok(handle) = win.window_handle() {
                    if let RawWindowHandle::Win32(h) = handle.as_raw() {
                        let hwnd = HWND(h.hwnd.get());
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
                        )
                        .map_err(|e| format!("SetWindowPos failed: {}", e))?;

                        // [Phase 19] Pool 昇格: α=0 → α=255 に変更（不透明化）
                        // pitfall 6: SetForegroundWindow より先に α=255 を設定する
                        // （透明のままフォーカスを取ると 1 文字目が消えるバグが発生する）
                        SetLayeredWindowAttributes(hwnd, COLORREF(0), 255, LWA_ALPHA).map_err(
                            |e| format!("SetLayeredWindowAttributes(255) failed: {}", e),
                        )?;

                        // SetForegroundWindow でOSのフォアグラウンドに設定する。
                        // SetWindowPos だけでは document.hasFocus()=false のままで
                        // CodeMirror が hasFocus=false を報告し、キー入力を受け付けない。
                        // このコマンドはユーザー操作（+ボタン等）直後に呼ばれるため
                        // Windows のフォアグラウンド制限に引っかからない。
                        let _ = SetForegroundWindow(hwnd);

                        // T2_READY: SetForegroundWindow 後（エディタ focus 到達の直前）
                        if let Some(rid) = &run_id {
                            let elapsed = perf_started
                                .map(|started| started.elapsed().as_millis() as u64);
                            crate::perf_event!(
                                rid,
                                "T2_READY",
                                Some(&label),
                                elapsed,
                                serde_json::json!({}),
                            );
                        }
                    }
                }
            }
            // [FIX] 生Win32 SetWindowPos(SWP_SHOWWINDOW) はOSには表示を伝えるが
            // Tauri の内部 visibility 状態を更新しない。
            // win.show() で Tauri 状態を同期しないと、後続の Tauri API 呼び出し時に
            // tao が "hidden" 判定してウィンドウを非表示にするバグが発生する。
            let _ = win.show();
        } else {
            logger::log_warn(&format!("window not found label={}", label));
        }
    }

    #[cfg(not(target_os = "windows"))]
    let _ = (
        label,
        phys_x,
        phys_y,
        phys_width,
        phys_height,
        run_id,
        app,
        perf_started,
    );

    Ok(perflog::enabled())
}

#[tauri::command]
fn fusen_perf_note_ready(run_id: String, elapsed_ms: u64) -> Result<(), String> {
    perflog::log_note_ready(&run_id, elapsed_ms)
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

    // visible(false) で build → 直後に Win32 API で WS_EX_LAYERED + α=0 + 画面外配置を設定する
    // pitfall 1: visible(true) で作ると Tauri が内部状態を "visible" にしてしまい後の show() 制御が崩れる
    // pitfall 2: SetWindowLongPtrW の上書きではなく OR パターンで付与する（既存 EX style を保持）
    // pitfall 3: 画面端 1px 配置ではなく -10000 に追い出す（α=0 でもクリックスルー安全のため）
    tauri::WebviewWindowBuilder::new(
        app,
        &label,
        tauri::WebviewUrl::App("/?path=&isPool=true".into()),
    )
    .title("Ore No Fusen")
    .transparent(false)
    .decorations(false)
    .disable_drag_drop_handler()
    .visible(false) // 後から SW_SHOWNOACTIVATE で立てる
    .focused(false)
    .skip_taskbar(true)
    .build()
    .map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    {
        use raw_window_handle::RawWindowHandle;
        use windows::Win32::Foundation::{COLORREF, HWND};
        use windows::Win32::UI::WindowsAndMessaging::{
            GetWindowLongPtrW, SetLayeredWindowAttributes, SetWindowLongPtrW, SetWindowPos,
            ShowWindow, GWL_EXSTYLE, HWND_TOP, LWA_ALPHA, SWP_NOACTIVATE, SWP_NOSIZE,
            SW_SHOWNOACTIVATE, WS_EX_LAYERED,
        };

        if let Some(win) = app.get_webview_window(&label) {
            unsafe {
                if let Ok(handle) = win.window_handle() {
                    if let RawWindowHandle::Win32(h) = handle.as_raw() {
                        let hwnd = HWND(h.hwnd.get());

                        // pitfall 2 対策: OR パターンで WS_EX_LAYERED を追加（上書きしない）
                        let current_ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
                        let new_ex = current_ex | (WS_EX_LAYERED.0 as isize);
                        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new_ex);

                        // α=0: 完全透明（見えない）にする
                        SetLayeredWindowAttributes(hwnd, COLORREF(0), 0, LWA_ALPHA)
                            .map_err(|e| format!("SetLayeredWindowAttributes(0) failed: {}", e))?;

                        // pitfall 3 対策: 画面外 (-10000, -10000) に配置
                        SetWindowPos(
                            hwnd,
                            HWND_TOP,
                            -10000,
                            -10000,
                            0,
                            0,
                            SWP_NOACTIVATE | SWP_NOSIZE,
                        )
                        .map_err(|e| format!("SetWindowPos(-10000) failed: {}", e))?;

                        // α=0 のため見えないが、ShowWindow で OS に "表示" を伝える
                        let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
                    }
                }
            }
        }
    }

    // perflog: Pool 生成完了
    Ok(())
}

/// Pool 窓を常時 POOL_TARGET 個に維持する補充コマンド。
/// 不足数を count_missing_pool で計算し、順次 1 個ずつ create（補充並列度 1）。
/// LAST_POOL_CREATE_MS セーフティネット 500ms スロットルを尊重する。
/// JS 側の T2_READY +5s トリガから非同期に呼ばれる。
#[tauri::command]
async fn fusen_replenish_pool(app: tauri::AppHandle) -> Result<(), String> {
    let current_count = app
        .webview_windows()
        .values()
        .filter(|w| w.label().starts_with("pool-window-"))
        .count();
    let missing = count_missing_pool(current_count, POOL_TARGET);

    if missing == 0 {
        logger::log_debug(&format!(
            "[Pool] fusen_replenish_pool: pool full (current={})",
            current_count
        ));
        return Ok(());
    }

    logger::log_info(&format!(
        "[Pool] fusen_replenish_pool: current={} missing={}",
        current_count, missing
    ));

    let app2 = app.clone();
    tauri::async_runtime::spawn(async move {
        for i in 0..missing {
            use std::sync::atomic::Ordering;
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64;
            let last = LAST_POOL_CREATE_MS.load(Ordering::SeqCst);
            if now.saturating_sub(last) < 500 {
                // セーフティネット: 前回生成から 500ms 未満なら待機
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            }
            LAST_POOL_CREATE_MS.store(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64,
                Ordering::SeqCst,
            );
            if let Err(e) = create_pool_window_internal(&app2) {
                logger::log_warn(&format!("[Pool] replenish #{}: create failed: {}", i, e));
            } else {
                logger::log_info(&format!("[Pool] replenish #{}: created OK", i));
            }
            if i + 1 < missing {
                // 連続作成: 500ms 間隔（CPU スパイク回避、pitfall 8 対策）
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            }
        }
    });

    Ok(())
}

// --- Pro / iPhone 連携コマンド ---

#[tauri::command]
async fn fusen_oauth_connect(app: tauri::AppHandle) -> Result<(), String> {
    gdrive::oauth_pkce_flow(&app).await?;
    let client = reqwest::Client::new();
    if let Ok(pc) = gdrive::register_pc_device(&client).await {
        logger::log_info(&format!(
            "[iphone receive] PC registered after OAuth id={} name={}",
            pc.pc_id, pc.pc_name
        ));
    }
    Ok(())
}

#[tauri::command]
async fn fusen_check_pro_setup(state: tauri::State<'_, Mutex<AppState>>) -> Result<bool, String> {
    let client = reqwest::Client::new();
    match gdrive::poll_push_config(&client, &state).await {
        Ok(_) => {
            let guard = state.lock().unwrap_or_else(|p| p.into_inner());
            Ok(!guard.pro_configs.is_empty())
        }
        Err(_) => Ok(false),
    }
}

#[tauri::command]
async fn fusen_list_push_devices() -> Result<Vec<gdrive::PushDeviceInfo>, String> {
    let client = reqwest::Client::new();
    gdrive::list_push_devices(&client).await
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct IphoneConnectionDiagnostic {
    status: String,
    summary: String,
    action: Option<String>,
    device_count: usize,
    details: Vec<String>,
}

#[tauri::command]
async fn fusen_diagnose_iphone_connection() -> Result<IphoneConnectionDiagnostic, String> {
    let client = reqwest::Client::new();
    let access_token = gdrive::get_access_token(&client).await?;

    let drive_keys_value = gdrive::download_json_with_migration(
        &client,
        &access_token,
        "push_keys.json",
        "vapid_keys.json",
    )
    .await
    .map_err(|e| {
        format!(
            "Driveのpush_keys.jsonを読めませんでした。PC側のDrive再接続を試してください。詳細: {}",
            e
        )
    })?;
    let drive_keys: webpush::VapidKeys = serde_json::from_value(drive_keys_value)
        .map_err(|e| format!("Driveのpush_keys.jsonを解析できませんでした。PC側のDrive再接続を試してください。詳細: {}", e))?;

    let devices = gdrive::list_push_devices(&client)
        .await
        .map_err(|e| format!("Driveのpush_devices.jsonを読めませんでした。iPhone側の再設定、またはPC側のDrive再接続を試してください。詳細: {}", e))?;

    let mut details = Vec::new();
    details.push("iPhone送信用の合い鍵があります。".to_string());
    details.push(format!(
        "通知を受け取れるiPhone / iPadが{}台あります。",
        devices.len()
    ));

    let mut status = "ok".to_string();
    let mut summary = "安心してください。iPhone送信の準備はできています。".to_string();
    let mut action = None;

    if devices.is_empty() {
        status = "warning".to_string();
        summary = "通知を受け取れるiPhone / iPadが見つかりませんでした。".to_string();
        action = Some(
            "iPhone側で俺の付箋をホーム画面に追加し、同じGoogleアカウントで初期設定してください。"
                .to_string(),
        );
    }

    let _ = drive_keys;

    Ok(IphoneConnectionDiagnostic {
        status,
        summary,
        action,
        device_count: devices.len(),
        details,
    })
}

#[tauri::command]
async fn fusen_get_google_account() -> Result<gdrive::GoogleAccountInfo, String> {
    let client = reqwest::Client::new();
    gdrive::get_google_account(&client).await
}

#[tauri::command]
async fn fusen_register_pc_device() -> Result<gdrive::PcDeviceInfo, String> {
    let client = reqwest::Client::new();
    gdrive::register_pc_device(&client).await
}

#[tauri::command]
async fn fusen_list_pc_devices() -> Result<Vec<gdrive::PcDeviceInfo>, String> {
    let client = reqwest::Client::new();
    gdrive::list_pc_devices(&client).await
}

#[tauri::command]
async fn fusen_delete_pc_device(pc_id: String) -> Result<(), String> {
    let client = reqwest::Client::new();
    gdrive::delete_pc_device_by_id(&client, &pc_id).await
}

async fn sync_vapid_keys_from_drive_or_create(
    client: &reqwest::Client,
    access_token: &str,
) -> Result<webpush::VapidKeys, String> {
    match gdrive::download_json_with_migration(
        client,
        access_token,
        "push_keys.json",
        "vapid_keys.json",
    )
    .await
    {
        Ok(value) => {
            let keys: webpush::VapidKeys = serde_json::from_value(value)
                .map_err(|e| format!("push_keys parse error: {}", e))?;
            Ok(keys)
        }
        Err(e) if e.contains("File not found") => {
            let keys = webpush::generate_vapid_keys()?;
            let value = serde_json::to_value(&keys).map_err(|e| e.to_string())?;
            gdrive::upload_json(client, access_token, "push_keys.json", &value).await?;
            Ok(keys)
        }
        Err(e) => Err(e),
    }
}

fn classify_webpush_error(error: &str) -> String {
    let lower = error.to_ascii_lowercase();
    if lower.contains("apns error: 413")
        || lower.contains("payload too large")
        || lower.contains("less than 4096 bytes")
    {
        return format!(
            "Push通知の容量上限（4KB）を超えました。本文は日本語で約1,000文字以内、英数字で約3,000文字以内を目安に短くして、もう一度送信してください。タイトル・タグ・画像情報も容量に含まれます。詳細: {}",
            error
        );
    }
    if lower.contains("apns error: 400") || lower.contains("bad request") {
        return format!(
            "APNs 400 Bad Request: Push鍵が一致しません。設定の「iPhone連携」でPC側のDriveを「再接続」するか、iPhone側でPWAを再インストールしてください。詳細: {}",
            error
        );
    }
    if lower.contains("apns error: 401") || lower.contains("unauthorized") {
        return format!(
            "APNs 401 Unauthorized: VAPID署名が拒否されました。設定の「iPhone連携」でPC側のDriveを再接続してください。詳細: {}",
            error
        );
    }
    if lower.contains("apns error: 403") || lower.contains("forbidden") {
        return format!(
            "APNs 403 Forbidden: Push Serviceが送信を拒否しました。VAPID鍵または購読先endpointを確認してください。詳細: {}",
            error
        );
    }
    if lower.contains("apns error: 404")
        || lower.contains("apns error: 410")
        || lower.contains("not found")
        || lower.contains("gone")
    {
        return format!(
            "APNs 404/410: iPhoneのPush購読が無効です。iPhoneのホーム画面からアプリを削除し、Safariから再度「ホーム画面に追加」して初期設定をやり直してください。詳細: {}",
            error
        );
    }
    if lower.contains("apns error: 429") || lower.contains("too many requests") {
        return format!(
            "APNs 429 Too Many Requests: Push通知が短時間に多すぎます。少し待ってから再送してください。詳細: {}",
            error
        );
    }
    if lower.contains("apns error: 5")
        || lower.contains("timeout")
        || lower.contains("reqwest error")
    {
        return format!(
            "Push通信エラー: APNs/Push Serviceまたはネットワークが一時的に失敗しました。Driveキューは保存済みなので、時間を置いて再試行してください。詳細: {}",
            error
        );
    }
    format!("Push送信エラー: {}", error)
}

fn is_retryable_webpush_error(error: &str) -> bool {
    let lower = error.to_ascii_lowercase();
    lower.contains("apns error: 429")
        || lower.contains("too many requests")
        || lower.contains("apns error: 5")
        || lower.contains("timeout")
        || lower.contains("reqwest error")
}

#[cfg(test)]
mod webpush_error_message_tests {
    use super::*;

    #[test]
    fn apns_400_guides_pc_reconnect_or_pwa_reinstall() {
        let message = classify_webpush_error("APNs error: 400: VapidPkHashMismatch");

        assert!(message.contains("Push鍵が一致しません"));
        assert!(message.contains("設定の「iPhone連携」でPC側のDriveを「再接続」"));
        assert!(message.contains("iPhone側でPWAを再インストール"));
    }

    #[test]
    fn apns_404_410_guides_pwa_reinstall_flow() {
        let message = classify_webpush_error("APNs error: 410: Gone");

        assert!(message.contains("iPhoneのPush購読が無効です"));
        assert!(message.contains("iPhoneのホーム画面からアプリを削除"));
        assert!(message.contains("Safariから再度「ホーム画面に追加」"));
    }

    #[test]
    fn android_4096_byte_error_is_classified_as_payload_too_large() {
        let message = classify_webpush_error(
            "APNs error: 400 Bad Request: binary passed in the request must be less than 4096 bytes.",
        );

        assert!(message.contains("容量上限（4KB）"));
        assert!(message.contains("日本語で約1,000文字以内"));
        assert!(!message.contains("Push鍵が一致しません"));
    }

    #[test]
    fn iphone_send_refreshes_push_devices_after_queue_save_before_push() {
        let source = include_str!("lib.rs");
        let fn_start = source
            .rfind("async fn fusen_send_to_iphone(")
            .expect("fusen_send_to_iphone should exist");
        let send_source = &source[fn_start..];
        let queue_save = send_source
            .find("gdrive::upload_json(&client, &access_token, \"notes_to_iphone.json\", &data)")
            .expect("iPhone send queue save step should exist");
        let refresh = send_source
            .find("gdrive::poll_push_config(&client, &state).await?;")
            .expect("iPhone send should refresh push_devices.json before Web Push");
        let push_send = send_source
            .find("webpush::send_web_push(&client, config, &vapid_keys, &plaintext).await")
            .expect("iPhone send Web Push step should exist");

        assert!(
            queue_save < refresh,
            "push_devices.json must be refreshed after notes_to_iphone.json is safely saved"
        );
        assert!(
            refresh < push_send,
            "push_devices.json must be refreshed before sending Web Push"
        );
    }
}

fn webpush_device_label(index: usize, total: usize, config: &ProConfig) -> String {
    let endpoint_tail = config
        .push_endpoint
        .chars()
        .rev()
        .take(10)
        .collect::<String>()
        .chars()
        .rev()
        .collect::<String>();
    format!(
        "{}/{} device_id={} name={} account={} endpoint=...{}",
        index + 1,
        total,
        config.device_id.as_deref().unwrap_or("unknown"),
        config.device_name.as_deref().unwrap_or("unknown"),
        config.google_account_email.as_deref().unwrap_or("unknown"),
        endpoint_tail
    )
}

#[tauri::command]
async fn fusen_ensure_push_keys() -> Result<(), String> {
    let client = reqwest::Client::new();
    let access_token = gdrive::get_access_token(&client).await?;
    sync_vapid_keys_from_drive_or_create(&client, &access_token).await?;
    Ok(())
}

#[tauri::command]
async fn fusen_delete_push_device(device_id: String) -> Result<(), String> {
    let client = reqwest::Client::new();
    gdrive::delete_push_device(&client, &device_id).await
}

#[tauri::command]
async fn fusen_delete_all_push_devices() -> Result<(), String> {
    let client = reqwest::Client::new();
    gdrive::delete_all_push_devices(&client).await
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DriveTempFileView {
    id: String,
    name: String,
    modified_time: Option<String>,
    size: Option<u64>,
    kind: String,
    is_old: bool,
    is_referenced: bool,
    can_delete: bool,
    preview_data_url: Option<String>,
    preview_text: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DriveTempCleanupSummary {
    total_count: usize,
    old_count: usize,
    deletable_count: usize,
    total_bytes: u64,
    old_bytes: u64,
    deletable_bytes: u64,
    deleted_count: usize,
    failed_count: usize,
    skipped_referenced_count: usize,
    retention_days: i64,
    files: Vec<DriveTempFileView>,
}

const DRIVE_TEMP_RETENTION_DAYS: i64 = 30;
const DRIVE_TEMP_PREVIEW_MAX_BYTES: u64 = 2 * 1024 * 1024;

fn is_drive_temp_old(
    file: &gdrive::DriveTempMediaFile,
    now: chrono::DateTime<chrono::Utc>,
) -> bool {
    let Some(modified_time) = &file.modified_time else {
        return false;
    };
    chrono::DateTime::parse_from_rfc3339(modified_time)
        .map(|dt| {
            now.signed_duration_since(dt.with_timezone(&chrono::Utc))
                .num_days()
                >= DRIVE_TEMP_RETENTION_DAYS
        })
        .unwrap_or(false)
}

fn drive_temp_file_kind(name: &str) -> &'static str {
    if name.starts_with("fusen_img_") {
        "image"
    } else if name.starts_with("fusen_video_") {
        "video"
    } else {
        "unknown"
    }
}

fn drive_temp_image_mime(name: &str) -> Option<&'static str> {
    let ext = std::path::Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match ext.as_str() {
        "jpg" | "jpeg" => Some("image/jpeg"),
        "png" => Some("image/png"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "bmp" => Some("image/bmp"),
        _ => None,
    }
}

fn collect_temp_tokens_from_str(text: &str, names: &mut std::collections::HashSet<String>) {
    for prefix in ["fusen_img_", "fusen_video_"] {
        let mut rest = text;
        while let Some(pos) = rest.find(prefix) {
            let candidate = &rest[pos..];
            let end = candidate
                .find(|ch: char| {
                    ch.is_whitespace() || matches!(ch, ')' | '"' | '\'' | ',' | ']' | '}')
                })
                .unwrap_or(candidate.len());
            let name = candidate[..end].trim_matches(|ch| matches!(ch, '.' | ';' | ':'));
            if name.starts_with(prefix) {
                names.insert(name.to_string());
            }
            rest = &candidate[prefix.len()..];
        }
    }
}

fn collect_temp_refs_from_value(
    value: &serde_json::Value,
    names: &mut std::collections::HashSet<String>,
) {
    match value {
        serde_json::Value::String(s) => collect_temp_tokens_from_str(s, names),
        serde_json::Value::Array(items) => {
            for item in items {
                collect_temp_refs_from_value(item, names);
            }
        }
        serde_json::Value::Object(map) => {
            for value in map.values() {
                collect_temp_refs_from_value(value, names);
            }
        }
        _ => {}
    }
}

async fn drive_referenced_temp_names(
    client: &reqwest::Client,
    token: &str,
) -> Result<std::collections::HashSet<String>, String> {
    let mut names = std::collections::HashSet::new();
    for (new_name, old_name) in [
        ("notes_from_iphone.json", "fusen_from_iphone.json"),
        ("notes_to_iphone.json", "fusen_note.json"),
    ] {
        match gdrive::download_json_with_migration(client, token, new_name, old_name).await {
            Ok(value) => collect_temp_refs_from_value(&value, &mut names),
            Err(e) if e.contains("File not found") => {}
            Err(e) => return Err(e),
        }
    }
    Ok(names)
}

fn summarize_drive_temp_files(
    files: &[gdrive::DriveTempMediaFile],
    referenced: &std::collections::HashSet<String>,
) -> DriveTempCleanupSummary {
    let now = chrono::Utc::now();
    let mut summary = DriveTempCleanupSummary {
        total_count: files.len(),
        old_count: 0,
        deletable_count: 0,
        total_bytes: files.iter().filter_map(|f| f.size).sum(),
        old_bytes: 0,
        deletable_bytes: 0,
        deleted_count: 0,
        failed_count: 0,
        skipped_referenced_count: 0,
        retention_days: DRIVE_TEMP_RETENTION_DAYS,
        files: Vec::new(),
    };

    for file in files {
        if !referenced.contains(&file.name) {
            summary.deletable_count += 1;
            summary.deletable_bytes += file.size.unwrap_or(0);
        }
        if is_drive_temp_old(file, now) {
            if referenced.contains(&file.name) {
                summary.skipped_referenced_count += 1;
            } else {
                summary.old_count += 1;
                summary.old_bytes += file.size.unwrap_or(0);
            }
        }
    }
    summary
}

async fn build_drive_temp_file_view(
    client: &reqwest::Client,
    access_token: &str,
    file: &gdrive::DriveTempMediaFile,
    referenced: &std::collections::HashSet<String>,
    now: chrono::DateTime<chrono::Utc>,
) -> DriveTempFileView {
    use base64::{engine::general_purpose, Engine as _};

    let kind = drive_temp_file_kind(&file.name).to_string();
    let is_referenced = referenced.contains(&file.name);
    let is_old = is_drive_temp_old(file, now);
    let can_delete = !is_referenced;
    let preview_data_url = if kind == "image"
        && file.size.unwrap_or(DRIVE_TEMP_PREVIEW_MAX_BYTES + 1) <= DRIVE_TEMP_PREVIEW_MAX_BYTES
    {
        match drive_temp_image_mime(&file.name) {
            Some(mime) => match gdrive::download_binary_by_id(client, access_token, &file.id).await
            {
                Ok(bytes) => Some(format!(
                    "data:{};base64,{}",
                    mime,
                    general_purpose::STANDARD.encode(bytes)
                )),
                Err(e) => {
                    logger::log_info(&format!(
                        "[drive temp] preview download failed {}: {}",
                        file.name, e
                    ));
                    None
                }
            },
            None => None,
        }
    } else {
        None
    };

    DriveTempFileView {
        id: file.id.clone(),
        name: file.name.clone(),
        modified_time: file.modified_time.clone(),
        size: file.size,
        kind,
        is_old,
        is_referenced,
        can_delete,
        preview_data_url,
        preview_text: None,
    }
}

async fn summarize_drive_temp_files_with_previews(
    client: &reqwest::Client,
    access_token: &str,
    files: &[gdrive::DriveTempMediaFile],
    referenced: &std::collections::HashSet<String>,
) -> DriveTempCleanupSummary {
    let now = chrono::Utc::now();
    let mut summary = summarize_drive_temp_files(files, referenced);
    let mut views = Vec::with_capacity(files.len());
    for file in files {
        views.push(build_drive_temp_file_view(client, access_token, file, referenced, now).await);
    }
    views.sort_by(|a, b| {
        b.modified_time
            .cmp(&a.modified_time)
            .then_with(|| a.name.cmp(&b.name))
    });
    summary.files = views;
    summary
}

#[tauri::command]
async fn fusen_list_drive_temp_files() -> Result<DriveTempCleanupSummary, String> {
    let client = reqwest::Client::new();
    let token = gdrive::get_access_token(&client).await?;
    let files = gdrive::list_temp_media_files(&client, &token).await?;
    let referenced = drive_referenced_temp_names(&client, &token).await?;
    Ok(summarize_drive_temp_files_with_previews(&client, &token, &files, &referenced).await)
}

#[tauri::command]
async fn fusen_cleanup_drive_temp_files() -> Result<DriveTempCleanupSummary, String> {
    let client = reqwest::Client::new();
    let token = gdrive::get_access_token(&client).await?;
    let files = gdrive::list_temp_media_files(&client, &token).await?;
    let referenced = drive_referenced_temp_names(&client, &token).await?;
    let now = chrono::Utc::now();
    let mut summary = summarize_drive_temp_files(&files, &referenced);

    for file in files {
        if !is_drive_temp_old(&file, now) {
            continue;
        }
        if referenced.contains(&file.name) {
            continue;
        }
        match gdrive::delete_file_by_id(&client, &token, &file.id).await {
            Ok(_) => summary.deleted_count += 1,
            Err(e) => {
                summary.failed_count += 1;
                logger::log_info(&format!(
                    "[drive cleanup] delete failed {}: {}",
                    file.name, e
                ));
            }
        }
    }
    let files = gdrive::list_temp_media_files(&client, &token).await?;
    let referenced = drive_referenced_temp_names(&client, &token).await?;
    let mut updated =
        summarize_drive_temp_files_with_previews(&client, &token, &files, &referenced).await;
    updated.deleted_count = summary.deleted_count;
    updated.failed_count = summary.failed_count;
    Ok(updated)
}

#[tauri::command]
async fn fusen_cleanup_selected_drive_temp_files(
    selected_file_ids: Vec<String>,
) -> Result<DriveTempCleanupSummary, String> {
    let client = reqwest::Client::new();
    let token = gdrive::get_access_token(&client).await?;
    let files = gdrive::list_temp_media_files(&client, &token).await?;
    let referenced = drive_referenced_temp_names(&client, &token).await?;
    let selected: std::collections::HashSet<String> = selected_file_ids.into_iter().collect();
    let mut deleted_count = 0;
    let mut failed_count = 0;

    for file in files {
        if !selected.contains(&file.id) || referenced.contains(&file.name) {
            continue;
        }
        match gdrive::delete_file_by_id(&client, &token, &file.id).await {
            Ok(_) => deleted_count += 1,
            Err(e) => {
                failed_count += 1;
                logger::log_info(&format!(
                    "[drive cleanup] selected delete failed {}: {}",
                    file.name, e
                ));
            }
        }
    }

    let files = gdrive::list_temp_media_files(&client, &token).await?;
    let referenced = drive_referenced_temp_names(&client, &token).await?;
    let mut summary =
        summarize_drive_temp_files_with_previews(&client, &token, &files, &referenced).await;
    summary.deleted_count = deleted_count;
    summary.failed_count = failed_count;
    Ok(summary)
}

/// body 中のローカル画像パスを Drive にアップロードして fusen_img_*.ext 参照に変換する
/// note_dir: ノートファイルのディレクトリ（相対パス解決に使用）
async fn upload_local_images_to_drive(
    client: &reqwest::Client,
    access_token: &str,
    body: &str,
    note_dir: &std::path::Path,
) -> String {
    let re = regex::Regex::new(r"!\[([^\]]*)\]\(([^)]+)\)").unwrap();
    let mut result = body.to_string();
    for caps in re.captures_iter(body) {
        let full = caps[0].to_string();
        let alt = &caps[1];
        let raw_path = &caps[2];
        if raw_path.starts_with("http://")
            || raw_path.starts_with("https://")
            || raw_path.starts_with("data:")
            || raw_path.starts_with("fusen_img_")
        {
            continue;
        }
        let resolved = if raw_path.len() >= 2 && raw_path.chars().nth(1) == Some(':') {
            std::path::PathBuf::from(raw_path.replace('/', "\\"))
        } else if raw_path.starts_with("\\\\") {
            std::path::PathBuf::from(raw_path.to_string())
        } else {
            note_dir.join(raw_path.replace('/', std::path::MAIN_SEPARATOR_STR))
        };
        let bytes = match std::fs::read(&resolved) {
            Ok(b) => b,
            Err(_) => continue,
        };
        let ext = std::path::Path::new(&resolved)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("png")
            .to_lowercase();
        let mime = match ext.as_str() {
            "jpg" | "jpeg" => "image/jpeg",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "bmp" => "image/bmp",
            _ => "image/png",
        };
        let ts = chrono::Local::now().format("%Y%m%d_%H%M%S");
        let uid = &uuid::Uuid::new_v4().to_string()[..8];
        let filename = format!("fusen_img_{}_{}.{}", ts, uid, ext);
        if gdrive::upload_binary(client, access_token, &filename, bytes, mime)
            .await
            .is_ok()
        {
            result = result.replace(&full, &format!("![{}]({})", alt, filename));
        }
    }
    result
}

fn split_iphone_title_body(body: &str) -> (String, String) {
    let first_line = body.lines().next().unwrap_or("");
    if let Ok(image_re) = regex::Regex::new(r"!\[[^\]]*\]\([^)]+\)") {
        if let Some(image_match) = image_re.find(first_line) {
            let title = first_line[..image_match.start()]
                .trim_start_matches('#')
                .trim()
                .to_string();
            let image_line = &first_line[image_match.start()..];
            let remaining_lines = body.lines().skip(1).collect::<Vec<_>>().join("\n");
            let content = if remaining_lines.is_empty() {
                image_line.to_string()
            } else {
                format!("{image_line}\n{remaining_lines}")
            };
            return (title, content);
        }
    }
    if first_line.starts_with('#') {
        let title = first_line.trim_start_matches('#').trim().to_string();
        let rest = body.lines().skip(1).collect::<Vec<_>>().join("\n");
        return (title, rest.trim_start_matches('\n').to_string());
    }
    let title = first_line.trim().to_string();
    let rest = body.lines().skip(1).collect::<Vec<_>>().join("\n");
    (title, rest.trim_start_matches('\n').to_string())
}

fn put_iphone_images_on_separate_lines(body: &str) -> String {
    let Ok(image_re) = regex::Regex::new(r"!\[[^\]]*\]\([^)]+\)") else {
        return body.to_string();
    };
    let mut result = String::with_capacity(body.len());
    let mut previous_end = 0;

    for image_match in image_re.find_iter(body) {
        result.push_str(&body[previous_end..image_match.start()]);
        if !result.is_empty() && !result.ends_with('\n') {
            result.push('\n');
        }
        result.push_str(image_match.as_str());
        if body[image_match.end()..]
            .chars()
            .next()
            .is_some_and(|next| next != '\n')
        {
            result.push('\n');
        }
        previous_end = image_match.end();
    }
    result.push_str(&body[previous_end..]);
    result
}

/// body 中のローカル画像パスを [画像] に置換する（Web Push 4KB制限対応）
fn strip_local_images(body: &str) -> String {
    let re = regex::Regex::new(r"!\[([^\]]*)\]\(([^)]+)\)").unwrap();
    re.replace_all(body, |caps: &regex::Captures| {
        let raw_path = &caps[2];
        if raw_path.starts_with("http://")
            || raw_path.starts_with("https://")
            || raw_path.starts_with("data:")
        {
            caps[0].to_string()
        } else {
            "[画像]".to_string()
        }
    })
    .into_owned()
}

/// body 中のローカル画像パスを base64 data URI に変換して埋め込む
/// note_dir: ノートファイルのディレクトリ（相対パス解決に使用）
/// data: URI はそのまま返す（http/https も変換しない）
#[cfg(test)]
fn embed_local_images(body: &str, note_dir: &std::path::Path) -> String {
    use base64::{engine::general_purpose, Engine as _};
    let re = regex::Regex::new(r"!\[([^\]]*)\]\(([^)]+)\)").unwrap();
    re.replace_all(body, |caps: &regex::Captures| {
        let alt = &caps[1];
        let raw_path = &caps[2];
        // data: / http: / https: はそのまま返す
        if raw_path.starts_with("data:")
            || raw_path.starts_with("http://")
            || raw_path.starts_with("https://")
        {
            return caps[0].to_string();
        }
        // 絶対パスまたは note_dir からの相対パスとして解決
        let path = {
            let p = std::path::Path::new(raw_path);
            if p.is_absolute() {
                p.to_path_buf()
            } else {
                note_dir.join(p)
            }
        };
        // ファイルが存在しなければそのまま返す
        let bytes = match std::fs::read(&path) {
            Ok(b) => b,
            Err(_) => return caps[0].to_string(),
        };
        let mime = match path.extension().and_then(|e| e.to_str()) {
            Some("png") => "image/png",
            Some("jpg") | Some("jpeg") => "image/jpeg",
            Some("gif") => "image/gif",
            Some("webp") => "image/webp",
            _ => "application/octet-stream",
        };
        let encoded = general_purpose::STANDARD.encode(&bytes);
        format!("![{}](data:{};base64,{})", alt, mime, encoded)
    })
    .into_owned()
}

/// PC→iPhone 未処理キューへ1件を追加する。
/// 読込失敗時は既存キューを守るため、ファイル不在以外では更新を返さない。
fn append_note_to_iphone_queue(
    existing: Result<serde_json::Value, String>,
    note: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let mut items = match existing {
        Ok(value) => {
            if let Some(items) = value["items"].as_array() {
                items.clone()
            } else if value.get("id").is_some() && value.get("received_at").is_none() {
                vec![value]
            } else {
                Vec::new()
            }
        }
        Err(error) if error.contains("File not found") => Vec::new(),
        Err(error) => {
            return Err(format!(
                "iPhone送信用キューの読み込みに失敗しました。既存の未送信データを守るため送信を中止しました: {}",
                error
            ));
        }
    };
    items.push(note);
    if items.len() > 20 {
        items = items.split_off(items.len() - 20);
    }
    Ok(serde_json::json!({ "items": items }))
}

#[cfg(test)]
mod iphone_send_queue_tests {
    use super::*;

    #[test]
    fn r12_queue_read_failure_returns_an_error_without_an_update_payload() {
        let result = append_note_to_iphone_queue(
            Err("temporary Drive failure".to_string()),
            serde_json::json!({ "id": "new-note" }),
        );

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("既存の未送信データを守るため送信を中止"));
    }

    #[test]
    fn r13_append_keeps_existing_items_and_limits_the_queue_to_the_latest_twenty() {
        let existing = serde_json::json!({
            "items": (0..20).map(|index| serde_json::json!({ "id": format!("old-{index}") })).collect::<Vec<_>>(),
        });
        let data = append_note_to_iphone_queue(Ok(existing), serde_json::json!({ "id": "new-note" }))
            .expect("queue update should be prepared");
        let items = data["items"].as_array().expect("items array");

        assert_eq!(items.len(), 20);
        assert_eq!(items.first().and_then(|item| item["id"].as_str()), Some("old-1"));
        assert_eq!(items.last().and_then(|item| item["id"].as_str()), Some("new-note"));
    }
}

#[tauri::command]
async fn fusen_send_to_iphone(
    state: tauri::State<'_, Mutex<AppState>>,
    path: String,
) -> Result<(), String> {
    let settings = storage::load_settings()?;
    if !settings.iphone_send_enabled {
        return Err(
            "iPhone送信は設定で無効です。設定画面のiPhone連携で有効にしてください。".to_string(),
        );
    }

    let client = reqwest::Client::new();

    // 1. ノートの内容を読む
    let note = {
        let guard = state.lock().unwrap_or_else(|p| p.into_inner());
        let _folder = guard
            .folder_path
            .clone()
            .ok_or_else(|| "Folder not set".to_string())?;
        drop(guard);
        std::fs::read_to_string(&path).map_err(|e| e.to_string())?
    };

    // 2. frontmatter を除去して body を取り出し、Drive用／Push用に変換
    let (frontmatter, body) = if note.starts_with("---") {
        let fm_end = note[3..].find("---").map(|end| 3 + end + 3).unwrap_or(0);
        if fm_end > 0 {
            let fm = &note[..fm_end];
            let b = note[fm_end..].trim_start_matches('\n').to_string();
            (fm.to_string(), b)
        } else {
            (String::new(), note.clone())
        }
    } else {
        (String::new(), note.clone())
    };
    let (_, _, _, _, _, _, note_tags, _) = logic::extract_meta_from_content(&frontmatter);
    let note_dir = std::path::Path::new(&path)
        .parent()
        .unwrap_or(std::path::Path::new("."));
    let sent_at = chrono::Utc::now().to_rfc3339();
    let note_id = uuid::Uuid::new_v4().to_string();

    // 先頭画像はタイトルにせず本文へ残し、Driveアップロード対象にする。
    let (title, body_content) = split_iphone_title_body(&body);
    let body_content = put_iphone_images_on_separate_lines(&body_content);

    // Push通知用: ローカル画像パスを [画像] に置換（Web Push 4KB制限対応）
    let body_push = strip_local_images(&body_content);

    // 3. access_token 取得
    let access_token = gdrive::get_access_token(&client).await?;

    // Drive用: ローカル画像を Drive にアップロードして fusen_img_* 参照に変換
    let body_rich =
        upload_local_images_to_drive(&client, &access_token, &body_content, note_dir).await;

    let note_json_drive = serde_json::json!({
        "id": note_id.clone(),
        "title": title,
        "body": body_rich,
        "tags": note_tags,
        "sent_at": sent_at,
        "received_at": null
    });
    let mut note_json_push = serde_json::json!({
        "id": note_id.clone(),
        "title": title.clone(),
        "body": body_push,
        "tags": note_tags,
        "sent_at": sent_at.clone()
    });
    insert_distinct_body_rich(&mut note_json_push, &body_push, &body_rich);
    let plaintext = build_web_push_plaintext(
        &note_json_push,
        &note_id,
        &title,
        &sent_at,
        body.chars().count(),
    )?;

    // 3a. VAPID鍵を Drive から取得する。
    // Drive の push_keys.json が正。PCローカルには保存せず、この送信中だけメモリ上で使う。
    // Drive に存在しない初回だけ生成し、Drive へ保存する。
    let vapid_keys = sync_vapid_keys_from_drive_or_create(&client, &access_token).await?;

    // 4. Google Drive に notes_to_iphone.json をアップロード（read-modify-write 配列追加）
    // Drive 書き込み成功前に Push すると、iPhone が起きても読む本文がない状態になる。
    let data = append_note_to_iphone_queue(
        gdrive::download_json_with_migration(
            &client,
            &access_token,
            "notes_to_iphone.json",
            "fusen_note.json",
        )
        .await,
        note_json_drive,
    )?;
    gdrive::upload_json(&client, &access_token, "notes_to_iphone.json", &data)
        .await
        .map_err(|e| {
            format!(
                "iPhone送信用キューのDrive保存に失敗しました。Push通知は送らずに中止しました: {}",
                e
            )
        })?;

    // 5. 送信直前に Drive の push_devices.json を再取得する。
    // iPhone の購読更新後に古いメモリキャッシュで送ると APNs の VAPID 鍵不一致になり得る。
    gdrive::poll_push_config(&client, &state).await?;
    let pro_configs = {
        let guard = state.lock().unwrap_or_else(|p| p.into_inner());
        guard.pro_configs.clone()
    };
    if pro_configs.is_empty() {
        return Err(
            "push_config not found in Google Drive. Please set up the iPhone app first."
                .to_string(),
        );
    }

    // 6. Web Push 全デバイスに順次送信（1台でも届けばOK）
    let mut send_errors: Vec<String> = Vec::new();
    let mut send_success_count = 0usize;
    let total_targets = pro_configs.len();
    for (index, config) in pro_configs.iter().enumerate() {
        let target = webpush_device_label(index, total_targets, config);
        let mut last_error: Option<String> = None;
        for attempt in 1..=3 {
            match webpush::send_web_push(&client, config, &vapid_keys, &plaintext).await {
                Ok(_) => {
                    send_success_count += 1;
                    eprintln!("[webpush] 送信成功: target={} attempt={}", target, attempt);
                    last_error = None;
                    break;
                }
                Err(e) => {
                    let retryable = is_retryable_webpush_error(&e);
                    let classified = classify_webpush_error(&e);
                    eprintln!(
                        "[webpush] 送信失敗: target={} attempt={} retryable={} error={}",
                        target, attempt, retryable, classified
                    );
                    last_error = Some(classified);
                    if !retryable || attempt == 3 {
                        break;
                    }
                    let delay_ms = if attempt == 1 { 500 } else { 1500 };
                    tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
                }
            }
        }
        if let Some(error) = last_error {
            send_errors.push(format!("{}: {}", target, error));
        }
    }
    eprintln!(
        "[webpush] 送信結果: total={} success={} failed={}",
        total_targets,
        send_success_count,
        send_errors.len()
    );
    // 全デバイスが失敗した場合のみエラーとする
    if !pro_configs.is_empty() && send_errors.len() == pro_configs.len() {
        return Err(format!(
            "全デバイスへの送信が失敗しました: {}",
            send_errors.join(", ")
        ));
    }

    Ok(())
}

fn insert_distinct_body_rich(
    payload: &mut serde_json::Value,
    body_push: &str,
    body_rich: &str,
) {
    if body_rich != body_push {
        payload["body_rich"] = serde_json::Value::String(body_rich.to_string());
    }
}

// RFC 8291暗号化で付く103 bytes分を、Push Serviceの4096 bytes上限から除いた値。
const WEB_PUSH_MAX_PLAINTEXT_BYTES: usize = 3992;

fn validate_web_push_payload_size(payload: &str, note_char_count: usize) -> Result<(), String> {
    let payload_bytes = payload.len();
    if payload_bytes <= WEB_PUSH_MAX_PLAINTEXT_BYTES {
        return Ok(());
    }

    Err(format!(
        "Push通知の容量上限（4KB）を超えるため送信できません（現在の本文: {}文字、Pushデータ: {} bytes）。本文は日本語で約1,000文字以内、英数字で約3,000文字以内を目安に短くしてください。タイトル・タグ・画像情報も容量に含まれます。",
        note_char_count, payload_bytes
    ))
}

fn build_web_push_plaintext(
    full_payload: &serde_json::Value,
    note_id: &str,
    title: &str,
    sent_at: &str,
    note_char_count: usize,
) -> Result<String, String> {
    let full_json = serde_json::to_string(full_payload).map_err(|e| e.to_string())?;
    if full_json.len() <= WEB_PUSH_MAX_PLAINTEXT_BYTES {
        return Ok(full_json);
    }

    let compact_payload = serde_json::json!({
        "id": note_id,
        "title": title.chars().take(80).collect::<String>(),
        "body": "",
        "fetch_from_drive": true,
        "sent_at": sent_at
    });
    let compact_json = serde_json::to_string(&compact_payload).map_err(|e| e.to_string())?;
    validate_web_push_payload_size(&compact_json, note_char_count)?;
    Ok(compact_json)
}

#[cfg(test)]
mod phone_push_payload_tests {
    use super::{
        build_web_push_plaintext, insert_distinct_body_rich, validate_web_push_payload_size,
        WEB_PUSH_MAX_PLAINTEXT_BYTES,
    };

    #[test]
    fn omits_duplicate_rich_body_from_push_payload() {
        let mut payload = serde_json::json!({ "body": "長い本文" });

        insert_distinct_body_rich(&mut payload, "長い本文", "長い本文");

        assert!(payload.get("body_rich").is_none());
    }

    #[test]
    fn keeps_rich_body_when_it_contains_drive_image_references() {
        let mut payload = serde_json::json!({ "body": "[画像]" });

        insert_distinct_body_rich(
            &mut payload,
            "[画像]",
            "![画像](fusen_img_20260731_120000_1.jpg)",
        );

        assert_eq!(
            payload["body_rich"],
            "![画像](fusen_img_20260731_120000_1.jpg)"
        );
    }

    #[test]
    fn reports_character_count_and_safe_length_guidance_when_payload_is_too_large() {
        let payload = "あ".repeat(WEB_PUSH_MAX_PLAINTEXT_BYTES + 1);

        let error = validate_web_push_payload_size(&payload, 1400).unwrap_err();

        assert!(error.contains("現在の本文: 1400文字"));
        assert!(error.contains("日本語で約1,000文字以内"));
        assert!(error.contains("英数字で約3,000文字以内"));
    }

    #[test]
    fn accepts_payload_at_the_encrypted_push_limit() {
        let payload = "a".repeat(WEB_PUSH_MAX_PLAINTEXT_BYTES);

        assert!(validate_web_push_payload_size(&payload, payload.len()).is_ok());
    }

    #[test]
    fn regression_plain_japanese_note_fits_after_duplicate_body_is_removed() {
        let body = "あ".repeat(1000);
        let mut fixed_payload = serde_json::json!({
            "id": "12345678-1234-1234-1234-123456789012",
            "title": "長文テスト",
            "body": body,
            "tags": [],
            "sent_at": "2026-07-31T12:00:00+00:00"
        });
        insert_distinct_body_rich(&mut fixed_payload, &body, &body);
        let fixed_json = serde_json::to_string(&fixed_payload).unwrap();

        let broken_json = serde_json::to_string(&serde_json::json!({
            "id": "12345678-1234-1234-1234-123456789012",
            "title": "長文テスト",
            "body": body,
            "body_rich": body,
            "tags": [],
            "sent_at": "2026-07-31T12:00:00+00:00"
        }))
        .unwrap();

        assert!(validate_web_push_payload_size(&broken_json, 1000).is_err());
        assert!(validate_web_push_payload_size(&fixed_json, 1000).is_ok());
        assert!(fixed_payload.get("body_rich").is_none());
    }

    #[test]
    fn long_note_uses_compact_drive_fetch_payload_instead_of_failing() {
        let body = "あ".repeat(1354);
        let full_payload = serde_json::json!({
            "id": "long-note",
            "title": "長文テスト",
            "body": body,
            "tags": [],
            "sent_at": "2026-07-31T12:00:00+00:00"
        });

        let plaintext = build_web_push_plaintext(
            &full_payload,
            "long-note",
            "長文テスト",
            "2026-07-31T12:00:00+00:00",
            1354,
        )
        .unwrap();
        let compact: serde_json::Value = serde_json::from_str(&plaintext).unwrap();

        assert!(plaintext.len() <= WEB_PUSH_MAX_PLAINTEXT_BYTES);
        assert_eq!(compact["fetch_from_drive"], true);
        assert_eq!(compact["id"], "long-note");
        assert_eq!(compact["body"], "");
    }
}

// --- iPhone受信 ---

fn collect_iphone_image_refs(body: &str) -> Vec<(String, String)> {
    let re = regex::Regex::new(r"!\[[^\]]*\]\(([^)]+)\)").expect("valid image regex");
    re.captures_iter(body)
        .filter_map(|capture| {
            let reference = capture.get(1)?.as_str();
            let filename = reference.strip_prefix("assets/").unwrap_or(reference);
            if filename.is_empty()
                || filename == "."
                || filename == ".."
                || filename.contains('/')
                || filename.contains('\\')
            {
                return None;
            }
            let extension = std::path::Path::new(filename)
                .extension()
                .and_then(|value| value.to_str())?
                .to_ascii_lowercase();
            if !matches!(extension.as_str(), "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp") {
                return None;
            }
            Some((reference.to_string(), filename.to_string()))
        })
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect()
}

#[cfg(test)]
mod iphone_image_receive_tests {
    use super::*;

    #[test]
    fn accepts_iphone_images_and_pc_images_returned_from_iphone() {
        let refs = collect_iphone_image_refs(
            "![iphone](fusen_img_20260810_1.jpg)\n![pc](assets/pasted_20260806_1.png)",
        );

        assert!(refs.contains(&(
            "fusen_img_20260810_1.jpg".to_string(),
            "fusen_img_20260810_1.jpg".to_string(),
        )));
        assert!(refs.contains(&(
            "assets/pasted_20260806_1.png".to_string(),
            "pasted_20260806_1.png".to_string(),
        )));
    }

    #[test]
    fn rejects_paths_and_non_image_files() {
        let refs = collect_iphone_image_refs(
            "![bad](assets/../secret.png)\n![bad](assets/folder/image.png)\n![bad](assets/note.txt)",
        );

        assert!(refs.is_empty());
    }
}

/// iPhoneからの body 内の安全な画像参照を
/// Drive からダウンロードしてローカル保存し、絶対パスに書き換えた body を返す
#[tauri::command]
async fn fusen_download_iphone_images(folder_path: String, body: String) -> Result<String, String> {
    use std::path::Path;

    let image_refs = collect_iphone_image_refs(&body);

    // assets ディレクトリを作成（PC貼り付け画像と統一）
    let assets_dir = Path::new(&folder_path).join("assets");
    std::fs::create_dir_all(&assets_dir).map_err(|e| e.to_string())?;

    if image_refs.is_empty() {
        return Ok(body);
    }

    let mut rewritten = body.clone();

    // Drive接続・トークン取得
    let client = reqwest::Client::new();
    let token = gdrive::get_access_token(&client)
        .await
        .map_err(|e| format!("Drive未接続: {}", e))?;

    // 各画像をダウンロードしてローカル保存
    for (reference, filename) in &image_refs {
        let local_path = assets_dir.join(filename);

        // 既存ファイルはスキップ（冪等）
        if local_path.exists() {
            rewritten = rewritten.replace(
                &format!("({reference})"),
                &format!("(assets/{filename})"),
            );
            continue;
        }

        match gdrive::download_binary(&client, &token, filename).await {
            Ok(bytes) => {
                std::fs::write(&local_path, &bytes)
                    .map_err(|e| format!("画像保存失敗 {}: {}", filename, e))?;
                rewritten = rewritten.replace(
                    &format!("({reference})"),
                    &format!("(assets/{filename})"),
                );
            }
            Err(e) => {
                logger::log_info(&format!("[assets] download failed {}: {}", filename, e));
                // ダウンロード失敗した画像はそのまま残す（表示エラーになるが致命的ではない）
            }
        }
    }

    Ok(rewritten)
}

fn build_context(title: &str, body: &str) -> String {
    if !title.is_empty() {
        return title.to_string();
    }
    if is_image_only_body(body) {
        return "画像".to_string();
    }
    let first_line = body.lines().next().unwrap_or("").trim();
    if !first_line.is_empty() {
        return first_line.chars().take(10).collect();
    }
    chrono::Local::now().format("%H:%M").to_string()
}

fn is_image_only_body(body: &str) -> bool {
    let mut saw_image = false;
    for line in body.lines().map(str::trim).filter(|line| !line.is_empty()) {
        if !is_markdown_image_line(line) {
            return false;
        }
        saw_image = true;
    }
    saw_image
}

fn is_markdown_image_line(line: &str) -> bool {
    if !line.starts_with("![") || !line.ends_with(')') {
        return false;
    }
    let Some(target_start) = line.find("](") else {
        return false;
    };
    let target = &line[target_start + 2..line.len() - 1];
    target.starts_with("fusen_img_") || target.starts_with("assets/fusen_img_")
}

#[cfg(test)]
mod iphone_context_tests {
    use super::*;

    #[test]
    fn image_only_iphone_body_uses_image_context() {
        assert_eq!(
            build_context("", "![](fusen_img_20260630_235053_1.jpg)"),
            "画像"
        );
        assert_eq!(
            build_context("", "![](assets/fusen_img_20260630_235053_1.jpg)"),
            "画像"
        );
    }

    #[test]
    fn image_only_context_allows_multiple_image_lines() {
        let body = "![](fusen_img_1.jpg)\n\n![memo](fusen_img_2.jpg)";

        assert_eq!(build_context("", body), "画像");
    }

    #[test]
    fn non_image_body_keeps_existing_context_behavior() {
        assert_eq!(build_context("", "hello world memo"), "hello worl");
        assert_eq!(
            build_context("", "![](fusen_img_1.jpg)\ncaption"),
            "![](fusen_"
        );
    }

    #[test]
    fn explicit_title_still_wins() {
        assert_eq!(
            build_context("タイトル", "![](fusen_img_20260630_235053_1.jpg)"),
            "タイトル"
        );
    }
}

#[derive(Clone, serde::Serialize)]
struct IphoneNotePayload {
    id: String,
    title: String,
    body: String,
    context: String,
    tags: Vec<String>,
}

fn collect_iphone_image_names(item: &serde_json::Value) -> Vec<String> {
    let title = item.get("title").and_then(|v| v.as_str()).unwrap_or("");
    let body = item.get("body").and_then(|v| v.as_str()).unwrap_or("");
    let combined = format!("{} {}", title, body);
    let mut search = combined.as_str();
    let mut image_names = Vec::new();
    while let Some(start) = search.find("](fusen_img_") {
        let rest = &search[start + 2..];
        if let Some(end) = rest.find(')') {
            image_names.push(rest[..end].to_string());
        }
        search = &search[start + 1..];
    }
    image_names
}

#[derive(Clone, Debug)]
struct IphoneVideoRef {
    video_file_name: String,
    original_file_name: String,
}

fn collect_iphone_videos(item: &serde_json::Value) -> Vec<IphoneVideoRef> {
    if let Some(videos) = item.get("videos").and_then(|v| v.as_array()) {
        return videos
            .iter()
            .filter_map(|video| {
                let video_file_name = video.get("videoFileName").and_then(|v| v.as_str())?;
                if !video_file_name.starts_with("fusen_video_") {
                    return None;
                }
                let original_file_name = video
                    .get("originalFileName")
                    .and_then(|v| v.as_str())
                    .unwrap_or(video_file_name);
                Some(IphoneVideoRef {
                    video_file_name: video_file_name.to_string(),
                    original_file_name: original_file_name.to_string(),
                })
            })
            .collect();
    }

    item.get("videoFileName")
        .and_then(|v| v.as_str())
        .filter(|name| name.starts_with("fusen_video_"))
        .map(|name| {
            let original_file_name = item
                .get("originalFileName")
                .and_then(|v| v.as_str())
                .unwrap_or(name);
            vec![IphoneVideoRef {
                video_file_name: name.to_string(),
                original_file_name: original_file_name.to_string(),
            }]
        })
        .unwrap_or_default()
}

fn collect_iphone_video_names(item: &serde_json::Value) -> Vec<String> {
    collect_iphone_videos(item)
        .into_iter()
        .map(|video| video.video_file_name)
        .collect()
}

fn iphone_item_targets_this_pc(item: &serde_json::Value, pc_id: &str) -> bool {
    match item
        .get("targetPcId")
        .and_then(|v| v.as_str())
        .map(str::trim)
    {
        Some(target_id) if !target_id.is_empty() => target_id == pc_id,
        _ => true,
    }
}

#[cfg(test)]
mod iphone_receive_routing_tests {
    use super::*;

    #[test]
    fn r14_only_the_target_pc_accepts_a_targeted_iphone_note() {
        let targeted = serde_json::json!({ "id": "for-pc-b", "targetPcId": "pc-b" });
        let unaddressed = serde_json::json!({ "id": "for-any-pc" });

        assert!(!iphone_item_targets_this_pc(&targeted, "pc-a"));
        assert!(iphone_item_targets_this_pc(&targeted, "pc-b"));
        assert!(iphone_item_targets_this_pc(&unaddressed, "pc-a"));
    }

    #[test]
    fn r15_same_iphone_id_has_a_stable_source_hash_and_different_ids_do_not_share_it() {
        let first = iphone_source_hash("iphone-note-1");

        assert_eq!(first, iphone_source_hash("iphone-note-1"));
        assert_ne!(first, iphone_source_hash("iphone-note-2"));
    }
}

fn sanitize_video_file_name(name: &str) -> String {
    let file_name = std::path::Path::new(name)
        .file_name()
        .and_then(|v| v.to_str())
        .unwrap_or("video.mp4");
    let mut safe = String::with_capacity(file_name.len());
    for ch in file_name.chars() {
        if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-') {
            safe.push(ch);
        } else {
            safe.push('_');
        }
    }
    if safe.is_empty() {
        "video.mp4".to_string()
    } else {
        safe
    }
}

/// `original_file_name`（PWA から渡る元のファイル名）が空でなければ
/// `{元の名前(拡張子なし)}_{YYYYMMDD_HHMMSS}.{拡張子}` 形式の名前を作る。
/// 危険な文字 (\ / : * ? " < > |) と制御文字は `_` に置換するが、半角空白は保持する。
/// 元ファイル名が空のときは Drive 名から sanitize した名前にフォールバックする。
fn build_local_video_file_name(video_file_name: &str, original_file_name: &str) -> String {
    let original = original_file_name.trim();
    if original.is_empty() {
        return sanitize_video_file_name(video_file_name);
    }

    // 拡張子を Drive 上の名前から決める（PWA が一致を保証している前提）。
    let drive_ext = std::path::Path::new(video_file_name)
        .extension()
        .and_then(|v| v.to_str())
        .map(|s| s.to_ascii_lowercase());
    let orig_ext = std::path::Path::new(original)
        .extension()
        .and_then(|v| v.to_str())
        .map(|s| s.to_ascii_lowercase());
    let ext = drive_ext.or(orig_ext).unwrap_or_else(|| "mp4".to_string());

    let stem = std::path::Path::new(original)
        .file_stem()
        .and_then(|v| v.to_str())
        .unwrap_or("video");

    let mut safe_stem = String::with_capacity(stem.len());
    for ch in stem.chars() {
        let is_dangerous =
            matches!(ch, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|') || ch.is_control();
        safe_stem.push(if is_dangerous { '_' } else { ch });
    }
    let safe_stem = safe_stem.trim().trim_end_matches('.').to_string();
    let safe_stem = if safe_stem.is_empty() {
        "video".to_string()
    } else {
        safe_stem
    };

    let now = chrono::Local::now();
    let stamp = now.format("%Y%m%d_%H%M%S");
    format!("{}_{}.{}", safe_stem, stamp, ext)
}

/// `base_name`（拡張子付き）が既に存在する場合、`name_2.ext`, `name_3.ext`, ... と
/// 連番を付けて空きを探す。最初の空きパスを返す。
fn resolve_video_path_with_suffix(
    video_dir: &std::path::Path,
    base_name: &str,
) -> std::path::PathBuf {
    let initial = video_dir.join(base_name);
    if !initial.exists() {
        return initial;
    }
    let path = std::path::Path::new(base_name);
    let stem = path.file_stem().and_then(|v| v.to_str()).unwrap_or("video");
    let ext = path.extension().and_then(|v| v.to_str()).unwrap_or("mp4");
    let mut n: u32 = 2;
    loop {
        let candidate = video_dir.join(format!("{}_{}.{}", stem, n, ext));
        if !candidate.exists() {
            return candidate;
        }
        n = n.saturating_add(1);
        if n > 9999 {
            // 念のため上限。万一に備え timestamp を末尾に足す。
            let stamp = chrono::Local::now().format("%Y%m%d_%H%M%S_%3f");
            return video_dir.join(format!("{}_{}.{}", stem, stamp, ext));
        }
    }
}

async fn download_iphone_video_to_assets(
    client: &reqwest::Client,
    token: &str,
    folder_path: &str,
    video_file_name: &str,
    original_file_name: &str,
) -> Result<(String, String), String> {
    let video_dir = std::path::Path::new(folder_path)
        .join("assets")
        .join("video");
    std::fs::create_dir_all(&video_dir).map_err(|e| e.to_string())?;

    let desired_name = build_local_video_file_name(video_file_name, original_file_name);
    let local_path = resolve_video_path_with_suffix(&video_dir, &desired_name);
    let local_name = local_path
        .file_name()
        .and_then(|v| v.to_str())
        .unwrap_or(&desired_name)
        .to_string();

    if !local_path.exists() {
        let bytes = gdrive::download_binary(client, token, video_file_name).await?;
        std::fs::write(&local_path, &bytes)
            .map_err(|e| format!("動画保存失敗 {}: {}", local_name, e))?;
    }
    Ok((
        format!("assets/video/{}", local_name),
        local_path.to_string_lossy().to_string(),
    ))
}

#[tauri::command]
async fn fusen_ack_iphone_note(note_id: String) -> Result<(), String> {
    let client = reqwest::Client::new();
    let token = gdrive::get_access_token(&client).await?;
    let data = match gdrive::download_json_with_migration(
        &client,
        &token,
        "notes_from_iphone.json",
        "fusen_from_iphone.json",
    )
    .await
    {
        Err(e) if e.contains("File not found") => return Ok(()),
        Err(e) => return Err(e),
        Ok(d) => d,
    };

    let items: Vec<serde_json::Value> =
        if let Some(arr) = data.get("items").and_then(|v| v.as_array()) {
            arr.clone()
        } else if data.get("id").and_then(|v| v.as_str()).is_some() {
            vec![data.clone()]
        } else {
            return Ok(());
        };

    let mut image_names = Vec::new();
    let mut video_names = Vec::new();
    let mut remaining = Vec::new();
    let mut found = false;
    for item in items {
        let item_id = item.get("id").and_then(|v| v.as_str()).unwrap_or("");
        if item_id == note_id {
            found = true;
            image_names.extend(collect_iphone_image_names(&item));
            video_names.extend(collect_iphone_video_names(&item));
        } else if item.get("received_at").is_none() {
            remaining.push(item);
        }
    }

    if !found {
        return Ok(());
    }

    if remaining.is_empty() {
        gdrive::delete_file_by_name(&client, &token, "notes_from_iphone.json").await?;
    } else {
        let updated_data = serde_json::json!({ "items": remaining });
        gdrive::upload_json(&client, &token, "notes_from_iphone.json", &updated_data).await?;
    }

    for name in image_names {
        if let Err(e) = gdrive::delete_file_by_name(&client, &token, &name).await {
            logger::log_info(&format!("[iphone ack] image delete error {}: {}", name, e));
        }
    }
    for name in video_names {
        if let Err(e) = gdrive::delete_file_by_name(&client, &token, &name).await {
            logger::log_info(&format!("[iphone ack] video delete error {}: {}", name, e));
        }
    }
    logger::log_info(&format!("[iphone ack] completed id={}", note_id));
    Ok(())
}

async fn poll_iphone_note(client: &reqwest::Client, app: &tauri::AppHandle) {
    let is_english = crate::settings::get_settings(app.clone())
        .map(|settings| settings.language == "en")
        .unwrap_or(false);
    // 1. access_token 取得（失敗 = Drive未接続）
    let token = match gdrive::get_access_token(client).await {
        Ok(t) => {
            let _ = app.emit("fusen:drive_connected", ());
            t
        }
        Err(_) => {
            let _ = app.emit("fusen:drive_disconnected", ());
            return;
        }
    };
    let pc_id = match gdrive::local_pc_id() {
        Ok(id) => id,
        Err(e) => {
            logger::log_info(&format!("[iphone receive] local pc id error: {}", e));
            String::new()
        }
    };

    // 2. notes_from_iphone.json をダウンロード（旧名: fusen_from_iphone.json から自動移行）
    let data = match gdrive::download_json_with_migration(
        client,
        &token,
        "notes_from_iphone.json",
        "fusen_from_iphone.json",
    )
    .await
    {
        Err(e) if e.contains("File not found") => return, // 静かにスキップ
        Err(e) => {
            logger::log_info(&format!("[poll] Drive download error: {}", e));
            return;
        }
        Ok(d) => d,
    };

    // 3. items 配列を取得（旧スキーマは自動変換して後方互換を維持）
    let items: Vec<serde_json::Value> =
        if let Some(arr) = data.get("items").and_then(|v| v.as_array()) {
            // 新スキーマ: { "items": [...] }
            arr.clone()
        } else if data.get("id").and_then(|v| v.as_str()).is_some() {
            // 旧スキーマ: { "id": "...", "title": "...", ... }
            vec![data.clone()]
        } else {
            return; // 不明なフォーマット
        };

    // 4. 未処理アイテム（received_at なし）を抽出
    let unreceived_indices: Vec<usize> = items
        .iter()
        .enumerate()
        .filter(|(_, item)| item.get("received_at").and_then(|v| v.as_str()).is_none())
        .map(|(idx, _)| idx)
        .collect();

    let target_mismatch_ids: Vec<String> = unreceived_indices
        .iter()
        .filter_map(|&idx| {
            let target = items[idx]
                .get("targetPcId")
                .and_then(|v| v.as_str())
                .map(str::trim)?;
            if !target.is_empty() && target != pc_id {
                Some(target.to_string())
            } else {
                None
            }
        })
        .collect();

    if !target_mismatch_ids.is_empty() {
        let sample = target_mismatch_ids
            .iter()
            .take(3)
            .cloned()
            .collect::<Vec<_>>()
            .join(", ");
        logger::log_info(&format!(
            "[iphone receive] 宛先違いでスキップ: skipped={} this_pc_id={} targetPcId={}",
            target_mismatch_ids.len(),
            pc_id,
            sample
        ));
    }

    let pending_indices: Vec<usize> = unreceived_indices
        .into_iter()
        .filter(|&idx| iphone_item_targets_this_pc(&items[idx], &pc_id))
        .collect();

    if pending_indices.is_empty() {
        return;
    }

    // 5. 既処理IDセットで重複をフィルタリング
    let new_indices: Vec<usize> = {
        let known_ids = LAST_IPHONE_NOTE_IDS
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        pending_indices
            .into_iter()
            .filter(|&idx| {
                let note_id = items[idx].get("id").and_then(|v| v.as_str()).unwrap_or("");
                !known_ids.contains(note_id)
            })
            .collect()
    };

    if new_indices.is_empty() {
        return;
    }

    // 6. 各アイテムを処理（emit + 通知）。Drive側の削除はJS保存成功後のackで行う。
    for &idx in &new_indices {
        let item = &items[idx];
        let note_id = item
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let title = item.get("title").and_then(|v| v.as_str()).unwrap_or("");
        let body = item.get("body").and_then(|v| v.as_str()).unwrap_or("");
        let item_type = item.get("type").and_then(|v| v.as_str()).unwrap_or("note");
        let video_refs = collect_iphone_videos(item);
        let first_original_file_name = video_refs
            .first()
            .map(|v| v.original_file_name.as_str())
            .unwrap_or_else(|| {
                item.get("originalFileName")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
            });
        let mut pc_body = if title.is_empty() {
            body.to_string()
        } else if body.is_empty() {
            title.to_string()
        } else {
            format!("{}\n{}", title, body)
        };
        let context = if item_type == "video" {
            if first_original_file_name.is_empty() {
                build_context(title, body)
            } else {
                first_original_file_name.to_string()
            }
        } else {
            build_context(title, body)
        };
        let tags: Vec<String> = item
            .get("tags")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|t| t.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();

        if item_type == "video" && !video_refs.is_empty() {
            let folder_path = {
                let state = app.state::<Mutex<AppState>>();
                let guard = state.lock().unwrap_or_else(|p| p.into_inner());
                guard.base_path.clone().or(guard.folder_path.clone())
            };
            let mut video_lines = Vec::new();
            for video_ref in &video_refs {
                let display_name = if video_ref.original_file_name.is_empty() {
                    video_ref.video_file_name.as_str()
                } else {
                    video_ref.original_file_name.as_str()
                };
                if let Some(folder_path) = folder_path.as_deref() {
                    match download_iphone_video_to_assets(
                        client,
                        &token,
                        folder_path,
                        &video_ref.video_file_name,
                        &video_ref.original_file_name,
                    )
                    .await
                    {
                        Ok((_local_rel_path, local_abs_path)) => {
                            video_lines
                                .push(format!("🎬 {}\n保存先:\n{}", display_name, local_abs_path));
                        }
                        Err(e) => {
                            logger::log_info(&format!(
                                "[iphone video] download failed {}: {}",
                                video_ref.video_file_name, e
                            ));
                            video_lines.push(if is_english {
                                format!(
                                    "🎬 Could not save video:\nOriginal file: {}\nDrive file: {}",
                                    display_name, video_ref.video_file_name
                                )
                            } else {
                                format!(
                                    "🎬 動画保存失敗:\n元ファイル名: {}\nDrive名: {}",
                                    display_name, video_ref.video_file_name
                                )
                            });
                        }
                    }
                } else {
                    logger::log_info("[iphone video] folder path is not set");
                    video_lines.push(if is_english {
                        format!(
                            "🎬 Could not save video:\nOriginal file: {}\nDrive file: {}",
                            display_name, video_ref.video_file_name
                        )
                    } else {
                        format!(
                            "🎬 動画保存失敗:\n元ファイル名: {}\nDrive名: {}",
                            display_name, video_ref.video_file_name
                        )
                    });
                }
            }
            if !video_lines.is_empty() {
                let base = pc_body.trim_end();
                let attachment_text = video_lines.join("\n\n");
                pc_body = if base.is_empty() {
                    attachment_text
                } else {
                    format!("{}\n\n{}", base, attachment_text)
                };
            }
        }

        // Windows トースト通知
        #[cfg(desktop)]
        {
            use tauri_plugin_notification::NotificationExt;
            let _ = app
                .notification()
                .builder()
                .title(if is_english {
                    "Note from iPhone"
                } else {
                    "iPhoneから付箋"
                })
                .body(&context)
                .show();
        }

        if app
            .emit(
                "fusen:note_from_iphone",
                IphoneNotePayload {
                    id: note_id.clone(),
                    title: title.to_string(),
                    body: pc_body,
                    context,
                    tags,
                },
            )
            .is_ok()
        {
            LAST_IPHONE_NOTE_IDS
                .lock()
                .unwrap_or_else(|p| p.into_inner())
                .insert(note_id);
        } else {
            logger::log_info(&format!("[poll] emit failed id={}", note_id));
        }
    }
}

// --- Entry Point ---

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 注入DLL由来の不正命令例外を最初期に捕捉するため、何より先に登録する。
    crash_guard::install();

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
        .plugin(tauri_plugin_oauth::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            member_identity::member_get,
            member_identity::member_set_consent,
            member_identity::member_record_batch,
            member_identity::member_flush,
            member_identity::member_closed_summaries,
            member_identity::member_mark_summary_sent,
            member_identity::member_needs_sync,
            member_identity::member_sync,
            member_identity::member_link_conversation,
            fusen_debug_log, // [NEW] Frontend Logging Bridge
            fusen_get_distribution_info,
            fusen_open_startup_settings,
            desktop_shortcut::fusen_get_desktop_shortcut_state,
            desktop_shortcut::fusen_create_desktop_shortcut,
            desktop_shortcut::fusen_remove_desktop_shortcut,
            desktop_shortcut::fusen_should_prompt_desktop_shortcut,
            desktop_shortcut::fusen_mark_desktop_shortcut_prompted,
            fusen_get_startup_state,
            fusen_set_startup_enabled,
            fusen_set_always_on_top,
            fusen_set_opacity,
            fusen_select_folder,
            fusen_list_notes,
            fusen_register_open_note_window,
            fusen_resolve_open_note_window,
            fusen_unregister_open_note_window,
            fusen_register_crystal_arrange_window,
            fusen_read_note,
            fusen_create_note,
            fusen_has_iphone_note,
            fusen_create_iphone_note,
            fusen_create_note_lazy,
            fusen_get_recipe_candidates,
            fusen_create_recipe_note,
            fusen_create_qa_note,
            fusen_create_term_note,
            fusen_return_recipe,
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
            fusen_list_archived_notes,
            fusen_restore_archived_notes,
            fusen_open_containing_folder,
            fusen_open_file,
            fusen_open_tag_folder,
            fusen_open_settings_folder,
            fusen_open_log_folder,
            fusen_get_drive_folder_id,
            fusen_get_drive_queue_counts,
            fusen_read_drive_json,
            fusen_delete_drive_queue_json,
            show_context_menu,
            get_base_path,
            fusen_path_exists,
            fusen_check_storage_health,
            setup_first_launch,
            settings::get_settings,  // ← 「settings箱の中の」と指定！
            settings::save_settings,  // ← 「settings箱の中の」と指定！
            capture::fusen_capture_screen, // [NEW] 画面キャプチャ
            sound::fusen_play_sound, // [NEW] サウンド再生
            fusen_search_notes, // [NEW] 全文検索
            clipboard::fusen_get_image_from_clipboard, // [NEW] クリップボード画像取得
            clipboard::fusen_save_dropped_image_data,
            clipboard::fusen_remove_dropped_images,
            clipboard::fusen_save_annotated_image,
            clipboard::fusen_read_local_image_data_url,
            fusen_is_sticky_note_focused,
            fusen_arrange_by_tag,
            fusen_arrange_undo,
            fusen_make_tool_window, // [NEW] Alt+Tab/タスクビューから除外
            fusen_set_as_alt_tab_window, // [NEW] 直前に使用した付箋のみAlt+Tabに表示
            hotkey_manager::hotkey_get_bindings,
            hotkey_manager::hotkey_get_register_failures,
            hotkey_manager::hotkey_check,
            hotkey_manager::hotkey_apply,
            launcher::fusen_quick_open_notes,
            launcher::fusen_open_quick_note,
            launcher::fusen_rename_quick_note,
            launcher::fusen_reorder_quick_note,
            launcher::fusen_remove_from_shelf,
            launcher::fusen_get_launcher_state,
            launcher::fusen_set_launcher_last_tab,
            launcher::fusen_set_launcher_tag_filter,
            launcher::fusen_get_crystal_formats,
            launcher::fusen_save_crystal_formats,
            launcher::fusen_toggle_quick_launcher,
            fusen_create_pool_window, // [NEW] プールウィンドウ生成
            fusen_replenish_pool,     // [NEW] Pool 補充オーケストレーション（T2_READY+5s トリガ）
            fusen_show_at_position, // [NEW] プールウィンドウをShow+リサイズ+移動を原子的に実行
            fusen_perf_note_ready,
            fusen_pick_folder,
            fusen_import_from_folder,
            fusen_backup,
            fusen_monthly_backup_due,
            fusen_snooze_monthly_backup,
            fusen_run_monthly_backup,
            fusen_restore_backup,
            fusen_oauth_connect,
            fusen_check_pro_setup,
            fusen_list_push_devices,
            fusen_diagnose_iphone_connection,
            fusen_get_google_account,
            fusen_register_pc_device,
            fusen_list_pc_devices,
            fusen_delete_pc_device,
            fusen_ensure_push_keys,
            fusen_delete_push_device,
            fusen_delete_all_push_devices,
            fusen_list_drive_temp_files,
            fusen_cleanup_drive_temp_files,
            fusen_cleanup_selected_drive_temp_files,
            fusen_send_to_iphone,
            fusen_download_iphone_images,
            fusen_ack_iphone_note,
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
                } else if label == "quick_launcher" || label == "recipe-create" || label == "qa-create" || label == "term-create" {
                    // Transient utility windows; closing them must not exit the app.
                } else {
                    // 付箋ウィンドウをタスクバーから「ウィンドウを閉じる」→ アプリ終了
                    // ※JSからの削除・アーカイブ時は destroy() を使うためここには来ない
                    // ※pool-window- ラベルの昇格済み付箋も含めて終了する
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
            log_startup_distribution_diagnostics();
            
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
                    logger::log_warn(&format!("設定ファイルを読み込めません: {}", e));
                    match storage::recover_corrupt_settings_to_safe_default() {
                        Ok(settings) => {
                            if let Some(base_path) = settings.base_path.clone() {
                                let state: State<Mutex<AppState>> = app.state();
                                {
                                    let mut app_state =
                                        state.lock().unwrap_or_else(|p| p.into_inner());
                                    app_state.base_path = Some(base_path.clone());
                                    app_state.folder_path = Some(base_path.clone());
                                }
                                match create_settings_recovery_notice(&state, &base_path) {
                                    Ok(note) => logger::log_warn(&format!(
                                        "設定を安全な初期状態へ復旧し、案内付箋を作成しました: {}",
                                        logger::sanitize_path(&note.meta.path)
                                    )),
                                    Err(notice_error) => logger::log_error(&format!(
                                        "設定の自動復旧後に案内付箋を作成できませんでした: {}",
                                        notice_error
                                    )),
                                }
                            } else {
                                logger::log_error("設定の自動復旧後も保存先がありません");
                            }
                        }
                        Err(recovery_error) => {
                            logger::log_error(&format!(
                                "設定の自動復旧を実行できませんでした: {}",
                                recovery_error
                            ));
                            logger::log_info("設定ファイルが存在しない場合は初回セットアップへ進みます");
                        }
                    }
                }
            }
            
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .timezone_strategy(tauri_plugin_log::TimezoneStrategy::UseLocal)
                        .level(log::LevelFilter::Warn)
                        .level_for("reqwest", log::LevelFilter::Warn)
                        .level_for("hyper", log::LevelFilter::Warn)
                        .build()
                )?;
            }
            
            app.handle().plugin(tauri_plugin_shell::init())?;
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
            app.handle().plugin(tauri_plugin_process::init())?;
            app.handle().plugin(tauri_plugin_notification::init())?;
            
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

            // Autostart plugin. MSIX移行時にも旧デスクトップ版の登録を解除するため初期化する。
            #[cfg(desktop)]
            {
                app.handle().plugin(tauri_plugin_autostart::init(
                    tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                    None,
                ))?;

                use tauri_plugin_autostart::ManagerExt;
                if distribution::is_msix_packaged() {
                    match storage::load_settings() {
                        Ok(mut settings) => {
                            if distribution::migrate_legacy_autostart_setting(&mut settings.auto_start) {
                                match storage::save_settings(&settings) {
                                    Ok(()) => logger::log_info(
                                        "MSIX: legacy desktop autostart setting disabled (StartupTask 使用)",
                                    ),
                                    Err(error) => logger::log_warn(&format!(
                                        "MSIX: legacy desktop autostart setting migration failed: {error}"
                                    )),
                                }
                            } else {
                                logger::log_info(
                                    "MSIX: legacy desktop autostart setting was already disabled (StartupTask 使用)",
                                );
                            }
                        }
                        Err(error) => logger::log_warn(&format!(
                            "MSIX: legacy desktop autostart setting could not be loaded: {error}"
                        )),
                    }
                } else {
                    // 設定に従って自動起動をOSに登録/解除
                    let auto_start = storage::load_settings()
                        .unwrap_or_default()
                        .auto_start;
                    if auto_start {
                        let _ = app.handle().autolaunch().enable();
                    } else {
                        let _ = app.handle().autolaunch().disable();
                    }
                }
            }

            tray::create_tray(app.handle())?;

            hotkey_manager::register_global_shortcuts(app);
            // クイックランチャー窓を隠したまま作り置き（Ctrl+P の初回表示を速くする）
            launcher::preload_quick_launcher(app.handle());
            {
                let app_handle = app.handle().clone();
                app.listen("fusen:toggle_quick_launcher", move |_| {
                    launcher::handle_toggle_event(app_handle.clone());
                });
            }

            // iPhone受信: バックグラウンドポーリングループ（30秒間隔）
            {
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    let client = reqwest::Client::new();
                    let mut interval =
                        tokio::time::interval(std::time::Duration::from_secs(30));
                    interval.tick().await; // 起動直後の即時tickを捨てる
                    loop {
                        interval.tick().await;
                        poll_iphone_note(&client, &app_handle).await;
                    }
                });
            }

            logger::log_info("アプリの初期化が完了しました");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod image_embed_tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn test_embed_local_images_no_images() {
        let body = "画像なしのテキスト\nただのメモ";
        let dir = std::path::Path::new(".");
        assert_eq!(embed_local_images(body, dir), body);
    }

    #[test]
    fn test_embed_local_images_nonexistent_path_skipped() {
        let body = "![photo](C:\\nonexistent\\path\\image.png)";
        let dir = std::path::Path::new(".");
        // 存在しないファイルはそのまま残る
        assert_eq!(embed_local_images(body, dir), body);
    }

    #[test]
    fn test_embed_local_images_converts_png() {
        let dir = tempdir().unwrap();
        let img_path = dir.path().join("test.png");
        let dummy_bytes = b"\x89PNG\r\nfake_png_data";
        fs::write(&img_path, dummy_bytes).unwrap();

        let path_str = img_path.to_str().unwrap();
        let body = format!("テキスト\n![my image]({})\n続き", path_str);
        let result = embed_local_images(&body, dir.path());

        assert!(result.contains("data:image/png;base64,"));
        assert!(result.contains("![my image](data:image/png;base64,"));
        assert!(result.contains("\n続き"));
    }

    #[test]
    fn test_embed_local_images_relative_path() {
        let dir = tempdir().unwrap();
        let assets_dir = dir.path().join("assets");
        fs::create_dir(&assets_dir).unwrap();
        let img_path = assets_dir.join("photo.png");
        fs::write(&img_path, b"\x89PNG\r\nfake").unwrap();

        let body = "![img](assets/photo.png)".to_string();
        let result = embed_local_images(&body, dir.path());
        assert!(result.contains("data:image/png;base64,"));
    }

    #[test]
    fn test_embed_local_images_jpeg_mime() {
        let dir = tempdir().unwrap();
        let img_path = dir.path().join("photo.jpg");
        fs::write(&img_path, b"fake_jpeg").unwrap();

        let path_str = img_path.to_str().unwrap();
        let body = format!("![alt]({})", path_str);
        let result = embed_local_images(&body, dir.path());

        assert!(result.contains("data:image/jpeg;base64,"));
    }

    #[test]
    fn test_strip_local_images_replaces_with_placeholder() {
        let body = "テキスト\n![photo](C:\\Users\\test\\image.png)\n続き";
        let result = strip_local_images(body);
        assert_eq!(result, "テキスト\n[画像]\n続き");
    }

    #[test]
    fn test_strip_local_images_no_images_unchanged() {
        let body = "画像なしのテキスト";
        assert_eq!(strip_local_images(body), body);
    }

    #[test]
    fn test_strip_local_images_multiple() {
        let body = "![a](C:\\img1.png) and ![b](C:\\img2.jpg)";
        let result = strip_local_images(body);
        assert_eq!(result, "[画像] and [画像]");
    }

    #[test]
    fn test_strip_does_not_affect_data_uris() {
        // data: URI はローカルパスではないので変換しない
        let body = "![img](data:image/png;base64,abc123)";
        assert_eq!(strip_local_images(body), body);
    }

    #[test]
    fn iphone_send_keeps_leading_image_in_body() {
        let body = "![image|0.5](assets/pasted.png)\nメモ";
        let (title, content) = split_iphone_title_body(body);

        assert_eq!(title, "");
        assert_eq!(content, body);
    }

    #[test]
    fn iphone_send_moves_first_line_inline_image_from_title_to_body() {
        let body = "8/2 MSIXの一本化![image](assets/pasted.png)\n続き";

        assert_eq!(
            split_iphone_title_body(body),
            (
                "8/2 MSIXの一本化".to_string(),
                "![image](assets/pasted.png)\n続き".to_string(),
            )
        );
    }

    #[test]
    fn iphone_send_places_body_image_markdown_on_its_own_line() {
        assert_eq!(
            put_iphone_images_on_separate_lines(
                "8/2 MSIXの一本化![image](assets/pasted.png)"
            ),
            "8/2 MSIXの一本化\n![image](assets/pasted.png)"
        );
    }

    #[test]
    fn iphone_send_keeps_existing_title_rules() {
        assert_eq!(
            split_iphone_title_body("# 見出し\n本文"),
            ("見出し".to_string(), "本文".to_string())
        );
        assert_eq!(
            split_iphone_title_body("タイトル\n本文"),
            ("タイトル".to_string(), "本文".to_string())
        );
    }
}

#[cfg(test)]
mod search_tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

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

    #[test]
    fn search_marks_existing_and_new_crystal_names_by_parent_folder() {
        let dir = tempdir().unwrap();
        let qa_dir = dir.path().join("QA");
        fs::create_dir(&qa_dir).unwrap();
        fs::write(qa_dir.join("0001_2026-07-18_旧形式.md"), "検索対象").unwrap();
        fs::write(qa_dir.join("QA0002_2026-07-18_新形式.md"), "検索対象").unwrap();

        let hits = search_notes_logic(dir.path().to_str().unwrap(), "検索対象");

        assert_eq!(hits.len(), 2);
        assert!(hits.iter().all(|hit| hit.kind.as_deref() == Some("QA")));
    }
}

#[cfg(test)]
mod recipe_candidate_tests {
    use super::*;

    #[test]
    fn source_tags_for_recipe_candidates_come_from_meta_not_body() {
        let source = Note {
            body: "本文だけでfrontmatterは含まれない".to_string(),
            frontmatter: String::new(),
            meta: NoteMeta {
                tags: vec!["work".to_string()],
                ..Default::default()
            },
        };
        let candidates = vec![logic::RecipeCandidateInput {
            path: "yellow.md".to_string(),
            title: "yellow".to_string(),
            body: "candidate".to_string(),
            background_color: Some("#f7e9b0".to_string()),
            tags: vec!["work".to_string()],
        }];

        let result = logic::filter_recipe_candidates(&recipe_source_tags(&source), candidates);

        assert_eq!(result.yellows.len(), 1);
        assert_eq!(result.yellows[0].path, "yellow.md");
    }
}

#[cfg(test)]
mod qa_note_tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn create_qa_note_file_writes_qa_note_with_recipe_meta_fields() {
        let dir = tempdir().unwrap();
        let path = create_qa_note_file(
            dir.path(),
            CreateRecipeNoteRequest {
                title: "質問".to_string(),
                body: "# 問い\n\n質問".to_string(),
                tags: vec!["work".to_string(), "recipe".to_string(), "qa".to_string()],
            },
        ).unwrap();

        let path = std::path::PathBuf::from(path);
        let content = fs::read_to_string(&path).unwrap();

        assert!(path.starts_with(dir.path().join("QA")));
        assert!(path.file_name().unwrap().to_string_lossy().starts_with("QA0001_"));
        assert!(content.contains("seq: 1"));
        assert!(content.contains("title: 質問"));
        assert!(content.contains("backgroundColor: \"#cfd8dc\""));
        assert!(content.contains("tags: [work, qa]"));
        assert!(content.contains("launches: 0"));
        assert!(content.contains("recipeImprovements: 0"));
        assert!(content.contains("recipeLastUsed:"));
        assert!(content.ends_with("# 問い\n\n質問"));
    }
}

#[cfg(test)]
mod term_note_tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn create_term_note_file_writes_term_note_with_recipe_meta_fields() {
        let dir = tempdir().unwrap();
        let path = create_term_note_file(
            dir.path(),
            CreateRecipeNoteRequest {
                title: "用語".to_string(),
                body: "# 意味\n\n説明".to_string(),
                tags: vec!["work".to_string(), "recipe".to_string(), "qa".to_string(), "term".to_string()],
            },
        ).unwrap();

        let path = std::path::PathBuf::from(path);
        let content = fs::read_to_string(&path).unwrap();

        assert!(path.starts_with(dir.path().join("Terms")));
        assert!(path.file_name().unwrap().to_string_lossy().starts_with("Term0001_"));
        assert!(content.contains("seq: 1"));
        assert!(content.contains("title: 用語"));
        assert!(content.contains("backgroundColor: \"#cfd8dc\""));
        assert!(content.contains("tags: [work, term]"));
        assert!(content.contains("launches: 0"));
        assert!(content.contains("recipeImprovements: 0"));
        assert!(content.contains("recipeLastUsed:"));
        assert!(content.ends_with("# 意味\n\n説明"));
    }

    #[test]
    fn create_term_note_file_uses_term_default_for_empty_title() {
        let dir = tempdir().unwrap();
        let path = create_term_note_file(
            dir.path(),
            CreateRecipeNoteRequest {
                title: "   ".to_string(),
                body: "# 意味\n\n説明".to_string(),
                tags: vec![],
            },
        ).unwrap();

        let path = std::path::PathBuf::from(path);
        let content = fs::read_to_string(&path).unwrap();

        assert!(path.starts_with(dir.path().join("Terms")));
        assert!(path.file_name().unwrap().to_string_lossy().contains("_term.md"));
        assert!(content.contains("title: term"));
        assert!(content.contains("tags: [term]"));
    }
}

/// Pool 窓 Win32 テスト
/// pool_window_layered / fusen_show_at_position_atomic は実 HWND を要するため
/// Windows runner でのみ実行可能。CI Linux では #[ignore] で skip される。
/// pool_lazy_create は tempfile を使うためすべての OS で動作する。
#[cfg(test)]
mod pool_tests {
    #[allow(unused_imports)]
    use super::*;
    #[allow(unused_imports)]
    use tempfile::tempdir;

    /// Task 4 (Plan 04): count_missing_pool 純粋関数のユニットテスト
    #[test]
    fn replenish_count_missing() {
        assert_eq!(count_missing_pool(0, 3), 3, "pool が空なら 3 個不足");
        assert_eq!(count_missing_pool(2, 3), 1, "2 個あれば 1 個不足");
        assert_eq!(count_missing_pool(3, 3), 0, "pool が満杯なら不足なし");
        assert_eq!(count_missing_pool(5, 3), 0, "超過時は 0（saturating_sub）");
    }

    /// Task 3: do_create_note を 2 回連続呼び出して連番が衝突しないことを確認
    /// (Mutex 排他で pool 窓間レースが起きないことの確認)
    #[test]
    fn pool_lazy_create() {
        use tempfile::tempdir;
        let tmp = tempdir().unwrap();
        let folder_path = tmp.path().to_str().unwrap();
        let state = Mutex::new(AppState::default());
        let n1 = do_create_note(&state, folder_path, "first").unwrap();
        let n2 = do_create_note(&state, folder_path, "second").unwrap();
        assert_ne!(
            n1.meta.path, n2.meta.path,
            "連番が衝突してはいけない（Mutex 排他の効果）"
        );
    }

    #[test]
    fn settings_recovery_notice_is_a_yellow_note_with_recovery_guidance() {
        let tmp = tempdir().unwrap();
        let state = Mutex::new(AppState::default());

        let note =
            create_settings_recovery_notice(&state, tmp.path().to_str().unwrap()).unwrap();

        let saved = std::fs::read_to_string(&note.meta.path).unwrap();
        assert!(
            saved.contains("backgroundColor: '#f7e9b0'")
                || saved.contains("backgroundColor: #f7e9b0")
        );
        assert!(saved.contains("設定ファイルを読み込めなかったため"));
        assert!(saved.contains("付箋ファイルは削除していません"));
        assert!(saved.contains("データ管理"));
    }

    /// Task 1: Pool 窓の WS_EX_LAYERED + α=0 + 画面外配置を確認
    /// 実 HWND が必要なため Windows runner でのみ実行可能
    #[cfg(target_os = "windows")]
    #[test]
    #[ignore] // Windows runner でのみ実行: cargo test -- --ignored pool_window_layered
    fn pool_window_layered() {
        // tauri::test::mock_app() でアプリを起動し create_pool_window_internal を呼ぶ
        // 直後に GetWindowLongPtrW で WS_EX_LAYERED.0 ビットが立っていることを assert
        // GetWindowRect で x/y が -10000 以下であることを assert
        // このテストは実 Win32 HWND を要するため CI Linux では skip、Windows runner でのみ動作
        todo!("Windows runner 上で実装（実 HWND を取得できる環境でのみ有効）")
    }

    /// Task 2: fusen_show_at_position が α=255 を設定することを確認
    /// 実 HWND が必要なため Windows runner でのみ実行可能
    #[cfg(target_os = "windows")]
    #[test]
    #[ignore] // Windows runner でのみ実行: cargo test -- --ignored fusen_show_at_position_atomic
    fn fusen_show_at_position_atomic() {
        // tauri::test::mock_app() で可視ウィンドウを生成
        // fusen_show_at_position を呼んだ直後に GetLayeredWindowAttributes で alpha 値を読み戻す
        // assert_eq!(alpha, 255, "alpha must be 255 after fusen_show_at_position");
        // 実 HWND を要するため Linux CI では skip
        todo!("Windows runner 上で実装（実 HWND を取得できる環境でのみ有効）")
    }
}
