/*
 * データ定義層 (State & Types)
 *
 * 責務:
 * - アプリケーション全体の状態定義 (`AppState`)
 * - ノート、メタデータ、設定の型定義 (`Note`, `NoteMeta`, `Settings`)
 * - データのシリアライズ/デシリアライズ構造
 */



#[derive(serde::Serialize, serde::Deserialize, Default, Clone)]
pub struct NoteMeta {
    pub path: String,
    pub seq: i32,
    pub context: String,
    pub updated: String,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub background_color: Option<String>,
    pub always_on_top: Option<bool>,
    pub folded: Option<bool>,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct Note {
    pub body: String,
    pub frontmatter: String,
    pub meta: NoteMeta,
}

#[derive(serde::Serialize, serde::Deserialize, Default, Clone)]
pub struct AppState {
    pub base_path: Option<String>,
    pub folder_path: Option<String>,
    pub notes: Vec<NoteMeta>,
    pub selected_path: Option<String>,
    pub active_context_menu_path: Option<String>,
    pub active_world: Option<String>,
    pub active_tags: Vec<String>,
    /// Alt+Tabに表示する付箋ウィンドウのラベル（最後にフォーカスされたもの）
    pub last_alt_tab_window: Option<String>,
    /// Pro機能の設定（Web Push サブスクリプション情報・マルチデバイス対応）
    pub pro_configs: Vec<ProConfig>,
}

// Phase 4: Pro機能設定構造体
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ProConfig {
    pub push_endpoint: String,
    pub p256dh: String,
    pub auth: String,
}

// NEW: UC-01 - 設定ファイル用の構造体
#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct Settings {
    #[serde(alias = "basePath")]
    pub base_path: Option<String>,
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(alias = "autoStart")]
    #[serde(default = "default_auto_start")]
    pub auto_start: bool,
    #[serde(alias = "fontSize")]
    #[serde(default = "default_font_size")]
    pub font_size: f64,
    #[serde(alias = "soundEnabled")]
    #[serde(default = "default_sound_enabled")]
    pub sound_enabled: bool,
    #[serde(alias = "iphoneSendEnabled")]
    #[serde(default)]
    pub iphone_send_enabled: bool,
    /// グローバルショートカットのカスタマイズ（例: "ctrl+shift+m"）。None の場合は "ctrl+n" をデフォルトとして使用。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shortcut_new_note: Option<String>,
    /// この PC を一意に識別する UUID。Drive 上の PC 登録と紐づく。
    /// 旧バージョンでは別ファイル %LOCALAPPDATA%\ore-no-fusen\pc_device.json に保存していたが、
    /// アンインストール時に失われると Drive 上にゴミの登録が残るため、settings.json に移管した。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pc_id: Option<String>,
}

fn default_language() -> String { 
    // ロケールを取得（デフォルトフォールバックとして "ja"）
    let locale = sys_locale::get_locale().unwrap_or_else(|| "ja".to_string());
    // "ja", "ja-JP" など日本語であれば "ja"、それ以外（英語、中国語、欧州言語など）は全て "en"
    if locale.to_lowercase().starts_with("ja") {
        "ja".to_string()
    } else {
        "en".to_string()
    }
}
fn default_font_size() -> f64 { 16.0 }
fn default_sound_enabled() -> bool { true }
fn default_auto_start() -> bool { true }

impl Default for Settings {
    fn default() -> Self {
        Self {
            base_path: None,
            language: default_language(),
            auto_start: default_auto_start(),
            font_size: default_font_size(),
            sound_enabled: default_sound_enabled(),
            iphone_send_enabled: false,
            shortcut_new_note: None,
            pc_id: None,
        }
    }
}
