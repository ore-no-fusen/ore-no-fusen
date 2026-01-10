
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
}

// NEW: UC-01 - 設定ファイル用の構造体
#[derive(serde::Serialize, serde::Deserialize, Default)]
pub struct Settings {
    pub base_path: Option<String>,
}
