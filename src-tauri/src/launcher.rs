use crate::{logic, logger, storage};
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl};

const LAUNCHER_ORDER_FILE: &str = "launcher_order.json";
const CRYSTAL_FORMATS_FILE: &str = "crystal_formats.json";
const QUICK_LAUNCHER_LABEL: &str = "quick_launcher";
pub(crate) const LAUNCHER_SHELF_CHANGED_EVENT: &str = "fusen:launcher_shelf_changed";
const TABS: [&str; 4] = ["recipe", "shortcut", "qa", "term"];

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct LauncherOrder {
    pub last_tab: String,
    pub orders: HashMap<String, Vec<String>>,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct QuickOpenItem {
    pub path: String,
    pub title: String,
    pub tags: Vec<String>,
    pub launches: i32,
    pub is_recipe: bool,
}

impl Default for LauncherOrder {
    fn default() -> Self {
        let mut orders = HashMap::new();
        for tab in TABS {
            orders.insert(tab.to_string(), Vec::new());
        }

        Self {
            last_tab: "recipe".to_string(),
            orders,
        }
    }
}

fn validate_tab(tab: &str) -> Result<&str, String> {
    let normalized = tab.trim();
    if TABS.contains(&normalized) {
        Ok(normalized)
    } else {
        Err(format!("unsupported launcher tab: {}", tab))
    }
}

fn normalize_order(mut order: LauncherOrder) -> LauncherOrder {
    if !TABS.contains(&order.last_tab.as_str()) {
        order.last_tab = "recipe".to_string();
    }
    for tab in TABS {
        order.orders.entry(tab.to_string()).or_default();
    }
    order.orders.retain(|tab, _| TABS.contains(&tab.as_str()));
    order
}

fn launcher_order_path() -> Result<PathBuf, String> {
    let settings_path = storage::get_settings_path()?;
    let dir = settings_path
        .parent()
        .ok_or_else(|| "settings directory not found".to_string())?;
    Ok(dir.join(LAUNCHER_ORDER_FILE))
}

fn load_launcher_order() -> Result<LauncherOrder, String> {
    load_launcher_order_from_path(&launcher_order_path()?)
}

fn save_launcher_order(order: &LauncherOrder) -> Result<(), String> {
    save_launcher_order_to_path(&launcher_order_path()?, order)
}

fn load_launcher_order_from_path(path: &Path) -> Result<LauncherOrder, String> {
    if !path.exists() {
        return Ok(LauncherOrder::default());
    }

    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let order: LauncherOrder = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(normalize_order(order))
}

fn save_launcher_order_to_path(path: &Path, order: &LauncherOrder) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(&normalize_order(order.clone()))
        .map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())
}

fn crystal_formats_path() -> Result<PathBuf, String> {
    let settings_path = storage::get_settings_path()?;
    let dir = settings_path
        .parent()
        .ok_or_else(|| "settings directory not found".to_string())?;
    Ok(dir.join(CRYSTAL_FORMATS_FILE))
}

fn load_crystal_formats_from_path(path: &Path) -> Result<Option<String>, String> {
    if !path.exists() {
        return Ok(None);
    }

    fs::read_to_string(path).map(Some).map_err(|e| e.to_string())
}

fn save_crystal_formats_to_path(path: &Path, json: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, json).map_err(|e| e.to_string())
}

fn base_path_from_state(state: &State<'_, Mutex<AppState>>) -> Result<String, String> {
    let app_state = state.lock().unwrap_or_else(|p| p.into_inner());
    app_state
        .base_path
        .clone()
        .or_else(|| app_state.folder_path.clone())
        .ok_or_else(|| "base path is not configured".to_string())
}

fn note_has_tag(tags: &[String], tag: &str) -> bool {
    tags.iter()
        .any(|value| logic::normalize_reserved_tag(value) == tag)
}

fn read_quick_item(path: &Path, tag: &str) -> Option<QuickOpenItem> {
    let path_str = path.to_string_lossy().to_string();
    let note = storage::read_note(&path_str).ok()?;

    if !note_has_tag(&note.meta.tags, tag) {
        return None;
    }

    let usage = logic::extract_recipe_usage_meta(&note.body);
    Some(QuickOpenItem {
        path: path_str,
        title: note.meta.context,
        tags: note.meta.tags.clone(),
        launches: usage.launches,
        is_recipe: note_has_tag(&note.meta.tags, "recipe"),
    })
}

fn recipe_note_paths(base_path: &Path) -> Vec<PathBuf> {
    let recipes_dir = base_path.join(storage::RECIPES_DIR_NAME);
    let mut paths = Vec::new();
    if let Ok(entries) = fs::read_dir(recipes_dir) {
        for entry in entries.filter_map(|entry| entry.ok()) {
            let path = entry.path();
            if path.is_file() && path.extension().map_or(false, |ext| ext == "md") {
                paths.push(path);
            }
        }
    }
    paths.sort();
    paths
}

fn qa_note_paths(base_path: &Path) -> Vec<PathBuf> {
    let qa_dir = base_path.join(storage::QA_DIR_NAME);
    let mut paths = Vec::new();
    if let Ok(entries) = fs::read_dir(qa_dir) {
        for entry in entries.filter_map(|entry| entry.ok()) {
            let path = entry.path();
            if path.is_file() && path.extension().map_or(false, |ext| ext == "md") {
                paths.push(path);
            }
        }
    }
    paths.sort();
    paths
}

fn term_note_paths(base_path: &Path) -> Vec<PathBuf> {
    let terms_dir = base_path.join(storage::TERMS_DIR_NAME);
    let mut paths = Vec::new();
    if let Ok(entries) = fs::read_dir(terms_dir) {
        for entry in entries.filter_map(|entry| entry.ok()) {
            let path = entry.path();
            if path.is_file() && path.extension().map_or(false, |ext| ext == "md") {
                paths.push(path);
            }
        }
    }
    paths.sort();
    paths
}

fn quick_note_paths(base_path: &Path, tab: &str) -> Vec<PathBuf> {
    if tab == "recipe" {
        recipe_note_paths(base_path)
    } else if tab == "qa" {
        qa_note_paths(base_path)
    } else if tab == "term" {
        term_note_paths(base_path)
    } else {
        storage::list_recipe_material_note_paths(base_path)
    }
}

fn query_matches(item: &QuickOpenItem, query: &str) -> bool {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return true;
    }

    let needle = trimmed.to_lowercase();
    item.title.to_lowercase().contains(&needle)
        || item.tags.iter().any(|tag| tag.to_lowercase().contains(&needle))
}

fn apply_query_filter(items: Vec<QuickOpenItem>, query: &str) -> Vec<QuickOpenItem> {
    items
        .into_iter()
        .filter(|item| query_matches(item, query))
        .collect()
}

fn merge_ordered_items(order_paths: &[String], items: Vec<QuickOpenItem>) -> Vec<QuickOpenItem> {
    let mut by_path: HashMap<String, QuickOpenItem> = items
        .iter()
        .cloned()
        .map(|item| (item.path.clone(), item))
        .collect();
    let mut ordered = Vec::new();
    let mut seen = HashSet::new();

    for path in order_paths {
        if let Some(item) = by_path.remove(path) {
            seen.insert(path.clone());
            ordered.push(item);
        }
    }

    for item in items {
        if !seen.contains(&item.path) {
            ordered.push(item);
        }
    }

    ordered
}

fn list_quick_open_notes(base_path: &Path, tab: &str, query: &str) -> Result<Vec<QuickOpenItem>, String> {
    let tab = validate_tab(tab)?;
    let order = load_launcher_order()?;
    let items: Vec<QuickOpenItem> = quick_note_paths(base_path, tab)
        .into_iter()
        .filter_map(|path| read_quick_item(&path, tab))
        .collect();
    let ordered = merge_ordered_items(order.orders.get(tab).map(Vec::as_slice).unwrap_or(&[]), items);
    Ok(apply_query_filter(ordered, query))
}

fn move_path_in_order(paths: Vec<String>, path: &str, direction: &str) -> Result<Vec<String>, String> {
    let mut next = paths;
    let index = next
        .iter()
        .position(|candidate| candidate == path)
        .ok_or_else(|| "path is not in launcher list".to_string())?;

    match direction {
        "up" => {
            if index > 0 {
                next.swap(index, index - 1);
            }
        }
        "down" => {
            if index + 1 < next.len() {
                next.swap(index, index + 1);
            }
        }
        _ => return Err(format!("unsupported reorder direction: {}", direction)),
    }

    Ok(next)
}

fn remove_tag_from_content(content: &str, tag: &str) -> String {
    let (_, _, _, _, _, _, mut tags, _) = logic::extract_meta_from_content(content);
    tags.retain(|value| logic::normalize_reserved_tag(value) != tag);
    logic::update_frontmatter_value(content, "tags", format!("[{}]", tags.join(", ")))
}

fn collision_free_root_path(base_path: &Path, file_name: &std::ffi::OsStr) -> PathBuf {
    let candidate = base_path.join(file_name);
    if !candidate.exists() {
        return candidate;
    }

    let source = Path::new(file_name);
    let stem = source
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("note");
    let extension = source.extension().and_then(|value| value.to_str()).unwrap_or("md");

    for index in 1.. {
        let filename = format!("{}-{}.{}", stem, index, extension);
        let candidate = base_path.join(filename);
        if !candidate.exists() {
            return candidate;
        }
    }

    unreachable!()
}

fn remove_path_from_orders(order: &mut LauncherOrder, path: &str) {
    for paths in order.orders.values_mut() {
        paths.retain(|candidate| candidate != path);
    }
}

pub(crate) fn emit_launcher_shelf_changed(app: &AppHandle) {
    if let Err(e) = app.emit(LAUNCHER_SHELF_CHANGED_EVENT, ()) {
        logger::log_warn(&format!("[Launcher] shelf changed emit failed: {}", e));
    }
}

fn remove_from_shelf_at_base(base_path: &Path, path: &Path) -> Result<Option<PathBuf>, String> {
    let path_str = path.to_string_lossy().to_string();
    let note = storage::read_note(&path_str)?;
    let is_recipe = note_has_tag(&note.meta.tags, "recipe");
    let is_qa = note_has_tag(&note.meta.tags, "qa");
    let is_term = note_has_tag(&note.meta.tags, "term");
    let is_shortcut = note_has_tag(&note.meta.tags, "shortcut");

    if is_recipe {
        let updated_content = remove_tag_from_content(&note.body, "recipe");
        let file_name = path
            .file_name()
            .ok_or_else(|| "invalid note path".to_string())?;
        let new_path = collision_free_root_path(base_path, file_name);
        let new_path_str = new_path.to_string_lossy().to_string();
        storage::write_note(&new_path_str, &updated_content)?;
        if new_path != path {
            fs::remove_file(path).map_err(|e| e.to_string())?;
        }
        return Ok(Some(new_path));
    }

    if is_qa {
        let updated_content = remove_tag_from_content(&note.body, "qa");
        let file_name = path
            .file_name()
            .ok_or_else(|| "invalid note path".to_string())?;
        let new_path = collision_free_root_path(base_path, file_name);
        let new_path_str = new_path.to_string_lossy().to_string();
        storage::write_note(&new_path_str, &updated_content)?;
        if new_path != path {
            fs::remove_file(path).map_err(|e| e.to_string())?;
        }
        return Ok(Some(new_path));
    }

    if is_term {
        let updated_content = remove_tag_from_content(&note.body, "term");
        let file_name = path
            .file_name()
            .ok_or_else(|| "invalid note path".to_string())?;
        let new_path = collision_free_root_path(base_path, file_name);
        let new_path_str = new_path.to_string_lossy().to_string();
        storage::write_note(&new_path_str, &updated_content)?;
        if new_path != path {
            fs::remove_file(path).map_err(|e| e.to_string())?;
        }
        return Ok(Some(new_path));
    }

    if is_shortcut {
        let updated_content = remove_tag_from_content(&note.body, "shortcut");
        storage::write_note(&path_str, &updated_content)?;
        return Ok(None);
    }

    Err("note is not on a launcher shelf".to_string())
}

fn build_quick_launcher_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    tauri::WebviewWindowBuilder::new(
        app,
        QUICK_LAUNCHER_LABEL,
        WebviewUrl::App("/launcher".into()),
    )
    .title("Quick Launcher")
    .inner_size(420.0, 520.0)
    .resizable(true)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .center()
    .visible(false)
    .build()
    .map_err(|e| e.to_string())
}

/// 起動時に隠し窓を作り置きして初回表示を速くする（Pool 窓と同じ思想）。
/// 失敗しても起動は続行する（次回トグル時に生成される）。
pub(crate) fn preload_quick_launcher(app: &AppHandle) {
    if app.get_webview_window(QUICK_LAUNCHER_LABEL).is_none() {
        if let Err(e) = build_quick_launcher_window(app) {
            logger::log_warn(&format!("[Launcher] preload failed: {}", e));
        }
    }
}

pub(crate) fn toggle_quick_launcher(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(QUICK_LAUNCHER_LABEL) {
        let visible = window.is_visible().map_err(|e| e.to_string())?;
        if visible {
            // 閉じずに隠す（次回を速くする）
            return window.hide().map_err(|e| e.to_string());
        }
        window.center().map_err(|e| e.to_string())?;
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        // フロントに再取得・検索フォーカスを促す
        let _ = window.emit("fusen:launcher_shown", ());
        return Ok(());
    }

    let window = build_quick_launcher_window(&app)?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub(crate) fn fusen_quick_open_notes(
    state: State<'_, Mutex<AppState>>,
    tab: String,
    query: String,
) -> Result<Vec<QuickOpenItem>, String> {
    let base_path = base_path_from_state(&state)?;
    list_quick_open_notes(Path::new(&base_path), &tab, &query)
}

/// ファイル全文（frontmatter を含む）を読み込み、launches を +1 して書き戻す。
/// note.body（frontmatter を除いた本文）ではなく全文を対象にすることで、
/// frontmatter（recipe タグ・backgroundColor 等）を破壊しないことを保証する。
fn increment_launches_in_file(path: &str) -> Result<(), String> {
    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let usage = logic::extract_recipe_usage_meta(&content);
    let updated_content =
        logic::update_frontmatter_value(&content, "launches", (usage.launches + 1).to_string());
    std::fs::write(path, &updated_content).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn fusen_open_quick_note(app: AppHandle, path: String) -> Result<(), String> {
    increment_launches_in_file(&path)?;
    // 開く側に色を伝え、窓の初期描画から正しい色にする（黄色フラッシュ防止）
    let background_color = std::fs::read_to_string(&path)
        .ok()
        .and_then(|content| logic::extract_meta_from_content(&content).4);
    app.emit(
        "fusen:open_note",
        serde_json::json!({ "path": path, "backgroundColor": background_color }),
    )
    .map_err(|e| e.to_string())
}

/// frontmatter の title だけを書き換える（全文を対象にし、他のフィールド・本文は保持）。
fn rename_note_title_in_file(path: &str, title: &str) -> Result<(), String> {
    let trimmed = title.trim();
    if trimmed.is_empty() {
        return Err("title is empty".to_string());
    }
    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let updated = logic::update_frontmatter_value(&content, "title", trimmed.to_string());
    std::fs::write(path, &updated).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn fusen_rename_quick_note(
    app: AppHandle,
    path: String,
    title: String,
) -> Result<(), String> {
    rename_note_title_in_file(&path, &title)?;
    emit_launcher_shelf_changed(&app);
    Ok(())
}

#[tauri::command]
pub(crate) fn fusen_reorder_quick_note(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    tab: String,
    path: String,
    direction: String,
) -> Result<(), String> {
    let tab = validate_tab(&tab)?.to_string();
    let base_path = base_path_from_state(&state)?;
    let current_paths: Vec<String> = list_quick_open_notes(Path::new(&base_path), &tab, "")?
        .into_iter()
        .map(|item| item.path)
        .collect();
    let next_paths = move_path_in_order(current_paths, &path, &direction)?;
    let mut order = load_launcher_order()?;
    order.orders.insert(tab, next_paths);
    save_launcher_order(&order)?;
    emit_launcher_shelf_changed(&app);
    Ok(())
}

#[tauri::command]
pub(crate) fn fusen_remove_from_shelf(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    path: String,
) -> Result<(), String> {
    let base_path = base_path_from_state(&state)?;
    let path_buf = PathBuf::from(&path);
    let moved_to = remove_from_shelf_at_base(Path::new(&base_path), &path_buf)?;

    let mut order = load_launcher_order()?;
    remove_path_from_orders(&mut order, &path);
    if let Some(new_path) = moved_to {
        remove_path_from_orders(&mut order, &new_path.to_string_lossy());
    }
    save_launcher_order(&order)?;
    emit_launcher_shelf_changed(&app);
    Ok(())
}

#[tauri::command]
pub(crate) fn fusen_get_launcher_state() -> Result<LauncherOrder, String> {
    load_launcher_order()
}

#[tauri::command]
pub(crate) fn fusen_set_launcher_last_tab(tab: String) -> Result<(), String> {
    let tab = validate_tab(&tab)?.to_string();
    let mut order = load_launcher_order()?;
    order.last_tab = tab;
    save_launcher_order(&order)
}

#[tauri::command]
pub(crate) fn fusen_get_crystal_formats() -> Result<Option<String>, String> {
    load_crystal_formats_from_path(&crystal_formats_path()?)
}

#[tauri::command]
pub(crate) fn fusen_save_crystal_formats(app: AppHandle, json: String) -> Result<(), String> {
    save_crystal_formats_to_path(&crystal_formats_path()?, &json)?;
    app.emit("fusen:crystal_formats_updated", ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn fusen_toggle_quick_launcher(app: AppHandle) -> Result<(), String> {
    toggle_quick_launcher(app)
}

pub(crate) fn handle_toggle_event(app: AppHandle) {
    if let Err(e) = toggle_quick_launcher(app) {
        logger::log_warn(&format!("[Launcher] toggle failed: {}", e));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn item(path: &str, title: &str, tags: &[&str]) -> QuickOpenItem {
        QuickOpenItem {
            path: path.to_string(),
            title: title.to_string(),
            tags: tags.iter().map(|tag| tag.to_string()).collect(),
            launches: 0,
            is_recipe: tags.iter().any(|tag| *tag == "recipe"),
        }
    }

    fn note_content(tags: &str) -> String {
        format!(
            "---\ntype: sticky\nseq: 1\nupdated: 2026-07-05\ntags: [{}]\nlaunches: 2\n---\n\nbody",
            tags
        )
    }

    #[test]
    fn increment_launches_preserves_frontmatter_and_body() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("0005_2026-07-06_aaa.md");
        let original = "---\ntype: sticky\nseq: 5\ntitle: aaa\nbackgroundColor: \"#cfd8dc\"\ntags: [OreNoFusen, recipe]\nlaunches: 0\nrecipeImprovements: 0\nrecipeLastUsed:\n---\n\n# こんなとき\n\nやったこと\n\n# どうする\n\n1. あれ\n";
        std::fs::write(&path, original).unwrap();

        increment_launches_in_file(&path.to_string_lossy()).unwrap();
        let after = std::fs::read_to_string(&path).unwrap();

        // frontmatter が壊れていないこと（これが黄色い空付箋バグの再発防止の核心）
        assert!(after.contains("backgroundColor: \"#cfd8dc\""));
        assert!(after.contains("tags: [OreNoFusen, recipe]"));
        assert!(after.contains("title: aaa"));
        // 本文が残っていること
        assert!(after.contains("# こんなとき"));
        assert!(after.contains("1. あれ"));
        // launches が frontmatter 内で +1 されていること
        assert!(after.contains("launches: 1"));
    }

    #[test]
    fn rename_note_title_updates_only_title_and_preserves_rest() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("0006_2026-07-06_old.md");
        let original = "---\ntype: sticky\nseq: 6\ntitle: old\nbackgroundColor: \"#cfd8dc\"\ntags: [OreNoFusen, recipe]\nlaunches: 3\n---\n\n# こんなとき\n\nbody\n";
        std::fs::write(&path, original).unwrap();

        rename_note_title_in_file(&path.to_string_lossy(), " 新しい名前 ").unwrap();
        let after = std::fs::read_to_string(&path).unwrap();

        assert!(after.contains("title: 新しい名前"));
        assert!(after.contains("backgroundColor: \"#cfd8dc\""));
        assert!(after.contains("tags: [OreNoFusen, recipe]"));
        assert!(after.contains("launches: 3"));
        assert!(after.contains("# こんなとき"));
        // 空文字はエラー
        assert!(rename_note_title_in_file(&path.to_string_lossy(), "   ").is_err());
    }

    #[test]
    fn launcher_order_round_trips_json_file() {
        let dir = tempdir().unwrap();
        let path = dir.path().join(LAUNCHER_ORDER_FILE);
        let mut order = LauncherOrder::default();
        order.last_tab = "qa".to_string();
        order.orders.insert("qa".to_string(), vec!["a.md".to_string()]);

        save_launcher_order_to_path(&path, &order).unwrap();
        let loaded = load_launcher_order_from_path(&path).unwrap();

        assert_eq!(loaded.last_tab, "qa");
        assert_eq!(loaded.orders["qa"], vec!["a.md"]);
        assert!(loaded.orders.contains_key("recipe"));
    }

    #[test]
    fn crystal_formats_missing_file_returns_none() {
        let dir = tempdir().unwrap();
        let path = dir.path().join(CRYSTAL_FORMATS_FILE);

        let loaded = load_crystal_formats_from_path(&path).unwrap();

        assert_eq!(loaded, None);
    }

    #[test]
    fn crystal_formats_round_trips_raw_json_file() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("nested").join(CRYSTAL_FORMATS_FILE);
        let json = r#"{"version":1,"recipe":{"sections":[]}}"#;

        save_crystal_formats_to_path(&path, json).unwrap();
        let loaded = load_crystal_formats_from_path(&path).unwrap();

        assert_eq!(loaded, Some(json.to_string()));
    }

    #[test]
    fn merge_ordered_items_ignores_missing_paths_and_appends_new_items() {
        let items = vec![
            item("b.md", "B", &["recipe"]),
            item("a.md", "A", &["recipe"]),
            item("c.md", "C", &["recipe"]),
        ];
        let order_paths = vec!["missing.md".to_string(), "a.md".to_string()];

        let result = merge_ordered_items(&order_paths, items);
        let paths: Vec<String> = result.into_iter().map(|item| item.path).collect();

        assert_eq!(paths, vec!["a.md", "b.md", "c.md"]);
    }

    #[test]
    fn query_filter_matches_title_and_tags_case_insensitively() {
        let items = vec![
            item("a.md", "Release Checklist", &["work"]),
            item("b.md", "Other", &["QA"]),
            item("c.md", "Other", &["term"]),
        ];

        let by_title = apply_query_filter(items.clone(), "release");
        let by_tag = apply_query_filter(items, "qa");

        assert_eq!(by_title.len(), 1);
        assert_eq!(by_title[0].path, "a.md");
        assert_eq!(by_tag.len(), 1);
        assert_eq!(by_tag[0].path, "b.md");
    }

    #[test]
    fn qa_tab_reads_qa_dir_only_and_requires_qa_tag() {
        let dir = tempdir().unwrap();
        let qa_dir = dir.path().join(storage::QA_DIR_NAME);
        fs::create_dir(&qa_dir).unwrap();
        let root_qa = dir.path().join("0001_2026-07-05_root.md");
        let qa_note = qa_dir.join("0002_2026-07-05_qa.md");
        let qa_without_tag = qa_dir.join("0003_2026-07-05_plain.md");

        fs::write(&root_qa, note_content("work, qa")).unwrap();
        fs::write(&qa_note, note_content("work, qa")).unwrap();
        fs::write(&qa_without_tag, note_content("work")).unwrap();

        let items: Vec<QuickOpenItem> = quick_note_paths(dir.path(), "qa")
            .into_iter()
            .filter_map(|path| read_quick_item(&path, "qa"))
            .collect();

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].path, qa_note.to_string_lossy());
    }

    #[test]
    fn term_tab_reads_terms_dir_only_and_requires_term_tag() {
        let dir = tempdir().unwrap();
        let terms_dir = dir.path().join(storage::TERMS_DIR_NAME);
        fs::create_dir(&terms_dir).unwrap();
        let root_term = dir.path().join("0001_2026-07-05_root.md");
        let term_note = terms_dir.join("0002_2026-07-05_term.md");
        let term_without_tag = terms_dir.join("0003_2026-07-05_plain.md");

        fs::write(&root_term, note_content("work, term")).unwrap();
        fs::write(&term_note, note_content("work, term")).unwrap();
        fs::write(&term_without_tag, note_content("work")).unwrap();

        let items: Vec<QuickOpenItem> = quick_note_paths(dir.path(), "term")
            .into_iter()
            .filter_map(|path| read_quick_item(&path, "term"))
            .collect();

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].path, term_note.to_string_lossy());
    }

    #[test]
    fn reorder_uses_current_display_order_before_moving_unpersisted_path() {
        let current = vec!["a.md".to_string(), "b.md".to_string(), "c.md".to_string()];

        let result = move_path_in_order(current, "b.md", "up").unwrap();

        assert_eq!(result, vec!["b.md", "a.md", "c.md"]);
    }

    #[test]
    fn remove_from_shelf_moves_recipe_to_root_and_removes_recipe_tag() {
        let dir = tempdir().unwrap();
        let recipes = dir.path().join("Recipes");
        fs::create_dir(&recipes).unwrap();
        let source = recipes.join("recipe-note.md");
        fs::write(&source, note_content("work, recipe")).unwrap();

        let moved = remove_from_shelf_at_base(dir.path(), &source).unwrap().unwrap();

        assert_eq!(moved, dir.path().join("recipe-note.md"));
        assert!(!source.exists());
        let content = fs::read_to_string(moved).unwrap();
        assert!(!content.contains("recipe"));
        assert!(content.contains("tags: [work]"));
    }

    #[test]
    fn remove_from_shelf_moves_qa_to_root_and_removes_qa_tag() {
        let dir = tempdir().unwrap();
        let qa_dir = dir.path().join(storage::QA_DIR_NAME);
        fs::create_dir(&qa_dir).unwrap();
        let source = qa_dir.join("qa-note.md");
        fs::write(&source, note_content("work, qa")).unwrap();

        let moved = remove_from_shelf_at_base(dir.path(), &source).unwrap().unwrap();

        assert_eq!(moved, dir.path().join("qa-note.md"));
        assert!(!source.exists());
        let content = fs::read_to_string(moved).unwrap();
        assert!(!content.contains("qa"));
        assert!(content.contains("tags: [work]"));
    }

    #[test]
    fn remove_from_shelf_moves_term_to_root_and_removes_term_tag() {
        let dir = tempdir().unwrap();
        let terms_dir = dir.path().join(storage::TERMS_DIR_NAME);
        fs::create_dir(&terms_dir).unwrap();
        let source = terms_dir.join("term-note.md");
        fs::write(&source, note_content("work, term")).unwrap();

        let moved = remove_from_shelf_at_base(dir.path(), &source).unwrap().unwrap();

        assert_eq!(moved, dir.path().join("term-note.md"));
        assert!(!source.exists());
        let content = fs::read_to_string(moved).unwrap();
        assert!(!content.contains("term"));
        assert!(content.contains("tags: [work]"));
    }

    #[test]
    fn remove_from_shelf_removes_shortcut_tag_without_moving() {
        let dir = tempdir().unwrap();
        let source = dir.path().join("shortcut-note.md");
        fs::write(&source, note_content("work, shortcut")).unwrap();

        let moved = remove_from_shelf_at_base(dir.path(), &source).unwrap();

        assert_eq!(moved, None);
        assert!(source.exists());
        let content = fs::read_to_string(source).unwrap();
        assert!(!content.contains("shortcut"));
        assert!(content.contains("tags: [work]"));
    }

    #[test]
    fn remove_from_shelf_rejects_notes_without_launcher_tags() {
        let dir = tempdir().unwrap();
        let source = dir.path().join("plain-note.md");
        fs::write(&source, note_content("work")).unwrap();

        let result = remove_from_shelf_at_base(dir.path(), &source);

        assert!(result.is_err());
    }

    #[test]
    fn remove_path_from_orders_removes_path_from_all_tabs() {
        let mut order = LauncherOrder::default();
        order.orders.insert(
            "recipe".to_string(),
            vec!["a.md".to_string(), "b.md".to_string()],
        );
        order.orders.insert("shortcut".to_string(), vec!["b.md".to_string()]);

        remove_path_from_orders(&mut order, "b.md");

        assert_eq!(order.orders["recipe"], vec!["a.md"]);
        assert!(order.orders["shortcut"].is_empty());
    }
}
