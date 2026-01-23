use crate::storage;
use crate::state::Settings as AppSettings;
use tauri::{AppHandle, Runtime};

// --- コマンド実装 ---

// 設定を読み込むコマンド
#[tauri::command]
pub fn get_settings<R: Runtime>(_app: AppHandle<R>) -> Result<AppSettings, String> {
    // storage.rs のロジックを使用して読み込む（場所を統一）
    storage::load_settings()
}

// 設定を保存するコマンド
#[tauri::command]
pub fn save_settings<R: Runtime>(_app: AppHandle<R>, settings: AppSettings) -> Result<(), String> {
    // storage.rs のロジックを使用して保存（場所を統一）
    storage::save_settings(&settings)
}