use crate::storage;
use crate::state::Settings as AppSettings;
use crate::state::AppState;
use std::sync::Mutex;
use tauri::{AppHandle, Runtime, State, Emitter};

// --- コマンド実装 ---

// 設定を読み込むコマンド
#[tauri::command]
pub fn get_settings<R: Runtime>(_app: AppHandle<R>) -> Result<AppSettings, String> {
    storage::load_settings()
}

// 設定を保存するコマンド
#[tauri::command]
pub fn save_settings<R: Runtime>(
    app: AppHandle<R>, 
    state: State<'_, Mutex<AppState>>,
    settings: AppSettings
) -> Result<(), String> {
    // 1. ファイルに保存
    storage::save_settings(&settings)?;

    // 2. メモリ上の AppState を同期
    {
        let mut app_state = state.lock().unwrap();
        app_state.base_path = settings.base_path.clone();
        app_state.folder_path = settings.base_path.clone();

        // ベースパスが変わったらノート一覧も再読み込み
        if let Some(path) = &settings.base_path {
            app_state.notes = storage::list_notes(path);
        }
    }

    // 3. 全ウィンドウに通知を飛ばす（全体更新イベント）
    let _ = app.emit("settings_updated", &settings);

    // [Fix] トレイメニュー更新はメインスレッドで行う（Windowsでのクラッシュ防止）
    let app_handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Err(e) = crate::tray::refresh_tray_menu(&app_handle) {
            eprintln!("[SETTINGS] Failed to refresh tray menu: {}", e);
        }
    });
    
    println!("[SETTINGS] Save successful. AppState updated, event emitted, and Tray refreshed.");

    Ok(())
}