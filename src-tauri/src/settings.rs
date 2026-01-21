use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, Runtime};

// 設定データの構造体（TypeScript側の AppSettings と合わせる）
// rename_all = "camelCase" で、Rustの auto_start を TSの autoStart に自動変換します
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub base_path: String,
    
    #[serde(default = "default_language")]
    pub language: String,
    
    #[serde(default = "default_auto_start")]
    pub auto_start: bool,
    
    #[serde(default = "default_font_size")]
    pub font_size: f64,
    
    #[serde(default = "default_sound_enabled")]
    pub sound_enabled: bool,
}

// デフォルト値の定義
fn default_language() -> String { "ja".to_string() }
fn default_auto_start() -> bool { false }
fn default_font_size() -> f64 { 16.0 }
fn default_sound_enabled() -> bool { true }

// デフォルト設定全体
impl Default for AppSettings {
    fn default() -> Self {
        Self {
            base_path: default_base_path(), // 後でOSごとのパス解決を入れるが、一旦固定
            language: default_language(),
            auto_start: default_auto_start(),
            font_size: default_font_size(),
            sound_enabled: default_sound_enabled(),
        }
    }
}

// ドキュメントフォルダなどのパス取得用（暫定）
fn default_base_path() -> String {
    // Windowsのドキュメントパスなどが取れない場合のフォールバック
    "C:\\Users\\Default\\Documents\\OreNoFusen".to_string()
}

// --- コマンド実装 ---

// 設定を読み込むコマンド
#[tauri::command]
pub fn get_settings<R: Runtime>(app: AppHandle<R>) -> Result<AppSettings, String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let settings_path = config_dir.join("settings.json");

    if !settings_path.exists() {
        // ファイルがなければデフォルトを返す（保存はしない）
        return Ok(AppSettings::default());
    }

    let content = fs::read_to_string(&settings_path).map_err(|e| e.to_string())?;
    
    // JSONをパース（足りない項目はデフォルト値で埋める）
    let settings: AppSettings = serde_json::from_str(&content).unwrap_or_else(|_| {
        // パース失敗時はデフォルトを返す（安全策）
        AppSettings::default()
    });

    Ok(settings)
}

// 設定を保存するコマンド
#[tauri::command]
pub fn save_settings<R: Runtime>(app: AppHandle<R>, settings: AppSettings) -> Result<(), String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    
    // フォルダがなければ作る
    if !config_dir.exists() {
        fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    }

    let settings_path = config_dir.join("settings.json");
    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;

    fs::write(settings_path, json).map_err(|e| e.to_string())?;

    Ok(())
}