
// データ層: 純粋なデータ構造のみ

#[derive(serde::Serialize, serde::Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
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
    #[serde(rename = "alwaysOnTop")]
    pub always_on_top: Option<bool>,
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
    pub base_path: Option<String>,  // NEW: UC-01 - サンドボックスベースフォルダ
    pub folder_path: Option<String>,
    pub notes: Vec<NoteMeta>,
    pub selected_path: Option<String>,
    pub active_context_menu_path: Option<String>,
    pub active_world: Option<String>, // NEW: 世界切替（集中モード）
    pub active_tags: Vec<String>,     // NEW: 選択中のタグ（複数選択用）
}

// NEW: UC-01 - 設定ファイル用の構造体
#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(alias = "base_path")]
    pub base_path: Option<String>,
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default)]
    pub auto_start: bool,
    #[serde(default = "default_font_size")]
    pub font_size: f64,
    #[serde(default = "default_sound_enabled")]
    pub sound_enabled: bool,
}

fn default_language() -> String { "ja".to_string() }
fn default_font_size() -> f64 { 16.0 }
fn default_sound_enabled() -> bool { true }

impl Default for Settings {
    fn default() -> Self {
        Self {
            base_path: None,
            language: default_language(),
            auto_start: false,
            font_size: default_font_size(),
            sound_enabled: default_sound_enabled(),
        }
    }
}
