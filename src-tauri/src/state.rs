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
    pub opacity: Option<f64>,
    pub font_size: Option<f64>,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct Note {
    pub body: String,
    pub frontmatter: String,
    pub meta: NoteMeta,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct RecipeUsageMeta {
    pub launches: i32,
    pub recipe_improvements: i32,
    pub recipe_last_used: Option<String>,
}

#[derive(serde::Serialize, Clone, Debug, PartialEq, Eq)]
pub struct RecipeCandidate {
    pub path: String,
    pub title: String,
    pub preview: String,
    pub tags: Vec<String>,
}

#[derive(serde::Serialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct RecipeCandidates {
    pub yellows: Vec<RecipeCandidate>,
    pub pinks: Vec<RecipeCandidate>,
}

#[derive(serde::Deserialize, Clone, Debug)]
pub struct CreateRecipeNoteRequest {
    pub title: String,
    pub body: String,
    #[serde(default)]
    pub tags: Vec<String>,
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
    pub arrange_undo: Option<Vec<(String, f64, f64)>>,
    /// 開いている結晶を整列へ含めるための、ウィンドウラベル→ファイルパス対応。
    /// 通常付箋一覧とは分離し、起動復元の対象にはしない。
    #[serde(default)]
    pub arrange_crystal_windows: std::collections::HashMap<String, String>,
    /// 開いている付箋の正規化パス→実ウィンドウラベル対応。
    /// Pool昇格窓を検索・クイックランチャーから再利用するための起動中だけの状態。
    #[serde(default)]
    pub open_note_windows: std::collections::HashMap<String, String>,
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
    #[serde(default)]
    pub device_id: Option<String>,
    #[serde(default)]
    pub device_name: Option<String>,
    #[serde(default)]
    pub google_account_email: Option<String>,
}

// NEW: UC-01 - 設定ファイル用の構造体
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct BackupRecord {
    pub path: String,
    pub created_at: String,
    pub file_count: usize,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct Settings {
    #[serde(alias = "basePath")]
    pub base_path: Option<String>,
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(alias = "autoStart")]
    #[serde(default = "default_auto_start")]
    pub auto_start: bool,
    /// MSIX版でデスクトップショートカットの初回確認を表示済みか。
    #[serde(default)]
    pub desktop_shortcut_prompted: bool,
    /// 匿名利用状況の送信同意。未選択は None、同意は granted、拒否は denied。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub analytics_consent: Option<String>,
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
    /// 新規付箋のトリガー方式。None の場合は "shortcut" として扱う。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub new_note_trigger: Option<String>,
    /// 表示/非表示切替ショートカット。None の場合は "ctrl+shift+h" をデフォルトとして使用。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shortcut_toggle_visibility: Option<String>,
    /// 整列ショートカット。None の場合は "ctrl+shift+l" をデフォルトとして使用。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shortcut_arrange: Option<String>,
    /// クイックランチャーショートカット。None の場合は "ctrl+p" をデフォルトとして使用。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shortcut_quick_launcher: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub shortcut_bold: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub shortcut_heading: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub shortcut_bullet_list: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub shortcut_checkbox: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub quick_launcher_triple_right_click: Option<bool>,
    /// この PC を一意に識別する UUID。Drive 上の PC 登録と紐づく。
    /// 旧バージョンでは別ファイル %LOCALAPPDATA%\ore-no-fusen\pc_device.json に保存していたが、
    /// アンインストール時に失われると Drive 上にゴミの登録が残るため、settings.json に移管した。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pc_id: Option<String>,
    #[serde(default)]
    pub backup_history: Vec<BackupRecord>,
    #[serde(default = "default_monthly_backup_enabled")]
    pub monthly_backup_enabled: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub monthly_backup_next_prompt: Option<String>,
    #[serde(default)]
    pub monthly_backup_skip_count: u8,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub monthly_backup_record: Option<BackupRecord>,
    #[serde(default = "default_monthly_backup_interval_days")]
    pub monthly_backup_interval_days: i64,
    #[serde(default)]
    pub backup_include_trash: bool,
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
fn default_monthly_backup_enabled() -> bool { true }
fn default_monthly_backup_interval_days() -> i64 { 30 }

impl Default for Settings {
    fn default() -> Self {
        Self {
            base_path: None,
            language: default_language(),
            auto_start: default_auto_start(),
            desktop_shortcut_prompted: false,
            analytics_consent: None,
            font_size: default_font_size(),
            sound_enabled: default_sound_enabled(),
            iphone_send_enabled: false,
            shortcut_new_note: None,
            new_note_trigger: None,
            shortcut_toggle_visibility: None,
            shortcut_arrange: None,
            shortcut_quick_launcher: None,
            shortcut_bold: None, shortcut_heading: None, shortcut_bullet_list: None, shortcut_checkbox: None,
            quick_launcher_triple_right_click: None,
            pc_id: None,
            backup_history: Vec::new(),
            monthly_backup_enabled: default_monthly_backup_enabled(),
            monthly_backup_next_prompt: None,
            monthly_backup_skip_count: 0,
            monthly_backup_record: None,
            monthly_backup_interval_days: default_monthly_backup_interval_days(),
            backup_include_trash: false,
        }
    }
}
