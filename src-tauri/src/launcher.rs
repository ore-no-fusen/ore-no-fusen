use crate::{logic, logger, storage};
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl};

const LAUNCHER_ORDER_FILE: &str = "launcher_order.json";
const CRYSTAL_FORMATS_FILE: &str = "crystal_formats.json";
const QUICK_LAUNCHER_LABEL: &str = "quick_launcher";
pub(crate) const LAUNCHER_SHELF_CHANGED_EVENT: &str = "fusen:launcher_shelf_changed";
static TOGGLE_IN_PROGRESS: AtomicBool = AtomicBool::new(false);
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

#[derive(Default, Serialize)]
struct LauncherToggleTimings {
    #[serde(skip_serializing_if = "Option::is_none")]
    visibility_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    center_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    show_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    focus_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    hide_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    build_ms: Option<u64>,
}

fn launcher_toggle_metadata(timings: &LauncherToggleTimings, success: bool) -> serde_json::Value {
    let mut value = serde_json::to_value(timings).unwrap_or_else(|_| serde_json::json!({}));
    if let Some(object) = value.as_object_mut() {
        object.insert(
            "status".to_string(),
            serde_json::Value::String(if success { "success" } else { "failed" }.to_string()),
        );
    }
    value
}

static SHORTCUT_CACHE: OnceLock<Mutex<HashMap<PathBuf, Vec<QuickOpenItem>>>> = OnceLock::new();
static QUICK_OPEN_CONTENT_CACHE: OnceLock<Mutex<HashMap<PathBuf, String>>> = OnceLock::new();

fn shortcut_cache() -> &'static Mutex<HashMap<PathBuf, Vec<QuickOpenItem>>> {
    SHORTCUT_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn quick_open_content_cache() -> &'static Mutex<HashMap<PathBuf, String>> {
    QUICK_OPEN_CONTENT_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn cache_quick_open_content(path: &Path, content: &str) {
    quick_open_content_cache()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .insert(path.to_path_buf(), content.to_string());
}

fn cached_quick_open_content(path: &Path) -> Result<String, String> {
    if let Some(content) = quick_open_content_cache()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .get(path)
        .cloned()
    {
        return Ok(content);
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    cache_quick_open_content(path, &content);
    Ok(content)
}

fn get_or_load_shortcut_items<F>(
    cache: &Mutex<HashMap<PathBuf, Vec<QuickOpenItem>>>,
    base_path: &Path,
    loader: F,
) -> Result<Vec<QuickOpenItem>, String>
where
    F: FnOnce() -> Result<Vec<QuickOpenItem>, String>,
{
    let mut guard = cache.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(items) = guard.get(base_path) {
        return Ok(items.clone());
    }
    let items = loader()?;
    guard.insert(base_path.to_path_buf(), items.clone());
    Ok(items)
}

fn invalidate_shortcut_cache(cache: &Mutex<HashMap<PathBuf, Vec<QuickOpenItem>>>) {
    cache
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clear();
}

fn invalidate_quick_open_content_cache() {
    quick_open_content_cache()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clear();
}

fn invalidate_shortcut_cache_for_tag(
    cache: &Mutex<HashMap<PathBuf, Vec<QuickOpenItem>>>,
    tag: &str,
) -> bool {
    if !tag.trim().eq_ignore_ascii_case("shortcut") {
        return false;
    }
    invalidate_shortcut_cache(cache);
    true
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
    cache_quick_open_content(path, &note.body);

    let usage = logic::extract_recipe_usage_meta(&note.body);
    Some(QuickOpenItem {
        path: path_str,
        title: note.meta.context,
        tags: note.meta.tags.clone(),
        launches: usage.launches,
        is_recipe: note_has_tag(&note.meta.tags, "recipe"),
    })
}

fn parse_launcher_tags(content: &str) -> Vec<String> {
    let value = content
        .lines()
        .find_map(|line| line.trim().strip_prefix("tags:"))
        .map(str::trim)
        .unwrap_or_default();
    let value = value
        .strip_prefix('[')
        .and_then(|value| value.strip_suffix(']'))
        .unwrap_or(value);
    value
        .split(',')
        .map(|tag| tag.trim().trim_matches('"').trim_matches('\''))
        .filter(|tag| !tag.is_empty())
        .map(str::to_string)
        .collect()
}

fn parse_launcher_launches(content: &str) -> i32 {
    content
        .lines()
        .find_map(|line| line.trim().strip_prefix("launches:"))
        .and_then(|value| value.trim().parse().ok())
        .unwrap_or(0)
}

fn read_shortcut_item(path: &Path) -> Option<QuickOpenItem> {
    let content = fs::read_to_string(path).ok()?;
    let tags = parse_launcher_tags(&content);
    if !note_has_tag(&tags, "shortcut") {
        return None;
    }
    let path_str = path.to_string_lossy().to_string();
    let filename = path.file_name()?.to_string_lossy();
    let (_, _, context) = logic::parse_filename(&filename);
    Some(QuickOpenItem {
        path: path_str,
        title: context,
        launches: parse_launcher_launches(&content),
        is_recipe: note_has_tag(&tags, "recipe"),
        tags,
    })
}

fn load_shortcut_items(base_path: &Path) -> Result<Vec<QuickOpenItem>, String> {
    let order = load_launcher_order()?;
    let items = storage::list_recipe_material_note_paths(base_path)
        .into_iter()
        .filter_map(|path| read_shortcut_item(&path))
        .collect();
    Ok(merge_ordered_items(
        order
            .orders
            .get("shortcut")
            .map(Vec::as_slice)
            .unwrap_or(&[]),
        items,
    ))
}

fn cached_shortcut_items(base_path: &Path) -> Result<Vec<QuickOpenItem>, String> {
    get_or_load_shortcut_items(shortcut_cache(), base_path, || {
        load_shortcut_items(base_path)
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
    if tab == "shortcut" {
        return cached_shortcut_items(base_path).map(|items| apply_query_filter(items, query));
    }
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
    invalidate_shortcut_cache(shortcut_cache());
    invalidate_quick_open_content_cache();
    if let Err(e) = app.emit(LAUNCHER_SHELF_CHANGED_EVENT, ()) {
        logger::log_warn(&format!("[Launcher] shelf changed emit failed: {}", e));
    }
}

pub(crate) fn emit_launcher_shelf_changed_for_tag(app: &AppHandle, tag: &str) {
    if invalidate_shortcut_cache_for_tag(shortcut_cache(), tag) {
        invalidate_quick_open_content_cache();
        if let Err(e) = app.emit(LAUNCHER_SHELF_CHANGED_EVENT, ()) {
            logger::log_warn(&format!("[Launcher] shelf changed emit failed: {}", e));
        }
    }
}

pub(crate) fn handle_note_trashed(app: &AppHandle, old_path: &str, new_path: &str) -> Result<(), String> {
    let mut order = load_launcher_order()?;
    remove_path_from_orders(&mut order, old_path);
    remove_path_from_orders(&mut order, new_path);
    save_launcher_order(&order)?;
    emit_launcher_shelf_changed(app);
    Ok(())
}

fn move_crystal_to_local_trash(path: &Path, content: &str) -> Result<PathBuf, String> {
    let parent = path.parent().ok_or_else(|| "invalid note parent".to_string())?;
    let trash_dir = storage::ensure_trash_dir(parent)?;
    let file_name = path
        .file_name()
        .ok_or_else(|| "invalid note path".to_string())?;
    let new_path = collision_free_root_path(&trash_dir, file_name);
    let new_path_str = new_path.to_string_lossy().to_string();

    storage::copy_associated_assets(path, &trash_dir)?;
    storage::write_note(&new_path_str, content)?;
    if let Err(e) = storage::delete_associated_assets(path) {
        logger::log_warn(&format!("[Launcher] crystal asset cleanup skipped: {}", e));
    }
    fs::remove_file(path).map_err(|e| {
        let _ = fs::remove_file(&new_path);
        e.to_string()
    })?;

    if let Err(e) = storage::append_trash_operation(path, &new_path, "quick_launcher") {
        logger::log_warn(&format!("[Launcher] trash operation log failed: {}", e));
    }

    Ok(new_path)
}

fn remove_from_shelf_at_base(_base_path: &Path, path: &Path) -> Result<Option<PathBuf>, String> {
    let path_str = path.to_string_lossy().to_string();
    let note = storage::read_note(&path_str)?;
    let is_recipe = note_has_tag(&note.meta.tags, "recipe");
    let is_qa = note_has_tag(&note.meta.tags, "qa");
    let is_term = note_has_tag(&note.meta.tags, "term");
    let is_shortcut = note_has_tag(&note.meta.tags, "shortcut");

    if is_recipe {
        return move_crystal_to_local_trash(path, &note.body).map(Some);
    }

    if is_qa {
        return move_crystal_to_local_trash(path, &note.body).map(Some);
    }

    if is_term {
        return move_crystal_to_local_trash(path, &note.body).map(Some);
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
    let app = app.clone();
    std::thread::spawn(move || {
        let state = app.state::<Mutex<AppState>>();
        let base_path = {
            let app_state = state.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
            app_state
                .base_path
                .clone()
                .or_else(|| app_state.folder_path.clone())
        }
        .or_else(|| storage::load_settings().ok().and_then(|settings| settings.base_path));
        if let Some(base_path) = base_path {
            let base_path = Path::new(&base_path);
            let _ = cached_shortcut_items(base_path);
            for tab in ["recipe", "qa", "term"] {
                let _ = list_quick_open_notes(base_path, tab, "");
            }
        }
    });
}

pub(crate) fn toggle_quick_launcher(app: AppHandle) -> Result<(), String> {
    let measurement = crate::perflog::enabled().then(std::time::Instant::now);
    let mut timings = LauncherToggleTimings::default();
    let mut action = "show_cold";
    let result = (|| {
        if let Some(window) = app.get_webview_window(QUICK_LAUNCHER_LABEL) {
            let step = measurement.map(|_| std::time::Instant::now());
            let visible = window.is_visible().map_err(|e| e.to_string())?;
            if let Some(started) = step {
                timings.visibility_ms = Some(started.elapsed().as_millis() as u64);
            }
            if visible {
                action = "hide";
                let step = measurement.map(|_| std::time::Instant::now());
                let result = window.hide().map_err(|e| e.to_string());
                if let Some(started) = step {
                    timings.hide_ms = Some(started.elapsed().as_millis() as u64);
                }
                return result;
            }
            action = "show_preloaded";
            let step = measurement.map(|_| std::time::Instant::now());
            window.center().map_err(|e| e.to_string())?;
            if let Some(started) = step {
                timings.center_ms = Some(started.elapsed().as_millis() as u64);
            }
            let step = measurement.map(|_| std::time::Instant::now());
            window.show().map_err(|e| e.to_string())?;
            if let Some(started) = step {
                timings.show_ms = Some(started.elapsed().as_millis() as u64);
            }
            let step = measurement.map(|_| std::time::Instant::now());
            window.set_focus().map_err(|e| e.to_string())?;
            if let Some(started) = step {
                timings.focus_ms = Some(started.elapsed().as_millis() as u64);
            }
            let _ = window.emit("fusen:launcher_shown", ());
            return Ok(());
        }

        let step = measurement.map(|_| std::time::Instant::now());
        let window = build_quick_launcher_window(&app)?;
        if let Some(started) = step {
            timings.build_ms = Some(started.elapsed().as_millis() as u64);
        }
        let step = measurement.map(|_| std::time::Instant::now());
        window.show().map_err(|e| e.to_string())?;
        if let Some(started) = step {
            timings.show_ms = Some(started.elapsed().as_millis() as u64);
        }
        let step = measurement.map(|_| std::time::Instant::now());
        window.set_focus().map_err(|e| e.to_string())?;
        if let Some(started) = step {
            timings.focus_ms = Some(started.elapsed().as_millis() as u64);
        }
        Ok(())
    })();

    if let Some(started) = measurement {
        let run_id = format!("launcher-{}", uuid::Uuid::new_v4());
        crate::perf_event!(
            &run_id,
            "LAUNCHER_TOGGLE_DONE",
            Some(action),
            Some(started.elapsed().as_millis() as u64),
            launcher_toggle_metadata(&timings, result.is_ok())
        );
    }
    result
}

#[tauri::command]
pub(crate) fn fusen_quick_open_notes(
    state: State<'_, Mutex<AppState>>,
    tab: String,
    query: String,
) -> Result<Vec<QuickOpenItem>, String> {
    let measurement = crate::perflog::enabled().then(std::time::Instant::now);
    let result = base_path_from_state(&state)
        .and_then(|base_path| list_quick_open_notes(Path::new(&base_path), &tab, &query));
    if let Some(started) = measurement {
        let run_id = format!("launcher-search-{}", uuid::Uuid::new_v4());
        crate::perf_event!(
            &run_id,
            "LAUNCHER_SEARCH_DONE",
            Some(&tab),
            Some(started.elapsed().as_millis() as u64),
            serde_json::json!({
                "status": if result.is_ok() { "success" } else { "failed" },
                "result_count": result.as_ref().map_or(0, Vec::len)
            })
        );
    }
    result
}

/// ファイル全文（frontmatter を含む）を読み込み、launches を +1 して書き戻す。
/// note.body（frontmatter を除いた本文）ではなく全文を対象にすることで、
/// frontmatter（recipe タグ・backgroundColor 等）を破壊しないことを保証する。
#[cfg(test)]
fn increment_launches_in_file(path: &str) -> Result<(), String> {
    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let usage = logic::extract_recipe_usage_meta(&content);
    let updated_content =
        logic::update_frontmatter_value(&content, "launches", (usage.launches + 1).to_string());
    std::fs::write(path, &updated_content).map_err(|e| e.to_string())
}

fn launcher_background_color(content: &str) -> Option<String> {
    let mut in_frontmatter = false;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed == "---" {
            if in_frontmatter {
                break;
            }
            in_frontmatter = true;
            continue;
        }
        if !in_frontmatter {
            continue;
        }
        let Some(value) = trimmed.strip_prefix("backgroundColor:") else {
            continue;
        };
        let value = value.trim().trim_matches(['\"', '\'']);
        if value.len() == 7
            && value.starts_with('#')
            && value[1..].bytes().all(|byte| byte.is_ascii_hexdigit())
        {
            return Some(value.to_string());
        }
        return None;
    }
    None
}

fn run_quick_open_after_read<Emit, Persist>(
    content: &str,
    emit_open: Emit,
    persist_launches: Persist,
) -> Result<(), String>
where
    Emit: FnOnce(Option<String>) -> Result<(), String>,
    Persist: FnOnce(&str) -> Result<(), String>,
{
    let background_color = launcher_background_color(content);
    let usage = logic::extract_recipe_usage_meta(content);
    let updated_content =
        logic::update_frontmatter_value(content, "launches", (usage.launches + 1).to_string());
    emit_open(background_color)?;
    persist_launches(&updated_content)
}

#[tauri::command]
pub(crate) fn fusen_open_quick_note(app: AppHandle, path: String) -> Result<(), String> {
    let content = cached_quick_open_content(Path::new(&path))?;
    let tags = parse_launcher_tags(&content);
    let is_crystal = tags.iter().any(|tag| {
        matches!(logic::normalize_reserved_tag(tag).as_str(), "recipe" | "qa" | "term")
    });
    let emit_path = path.clone();
    run_quick_open_after_read(
        &content,
        |background_color| {
            app.emit(
                "fusen:open_note",
                serde_json::json!({
                    "path": emit_path,
                    "backgroundColor": background_color,
                    "content": content,
                    "isCrystal": is_crystal
                }),
            )
            .map_err(|e| e.to_string())
        },
        |updated_content| {
            std::fs::write(&path, updated_content).map_err(|e| e.to_string())?;
            cache_quick_open_content(Path::new(&path), updated_content);
            Ok(())
        },
    )?;
    invalidate_shortcut_cache(shortcut_cache());
    Ok(())
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

    let note = storage::read_note(&path)?;
    let is_crystal = note_has_tag(&note.meta.tags, "recipe")
        || note_has_tag(&note.meta.tags, "qa")
        || note_has_tag(&note.meta.tags, "term");
    if is_crystal {
        let label = crate::get_window_label(&path);
        if app.get_webview_window(&label).is_some() {
            app
                .emit_to(
                    &label,
                    "fusen:move_to_crystal_trash",
                    serde_json::json!({ "path": path }),
                )
                .map_err(|e| e.to_string())?;
            return Ok(());
        }
    }

    let moved_to = remove_from_shelf_at_base(Path::new(&base_path), &path_buf)?;
    let crystal_was_moved = moved_to.is_some();

    let mut order = load_launcher_order()?;
    remove_path_from_orders(&mut order, &path);
    if let Some(new_path) = moved_to {
        remove_path_from_orders(&mut order, &new_path.to_string_lossy());
    }
    save_launcher_order(&order)?;
    emit_launcher_shelf_changed(&app);

    if crystal_was_moved {
        let label = crate::get_window_label(&path);
        let app_for_close = app.clone();
        if let Err(e) = app.run_on_main_thread(move || {
            if let Some(window) = app_for_close.get_webview_window(&label) {
                let _ = window.hide();
                let _ = window.destroy();
            }
        }) {
            logger::log_warn(&format!("[Launcher] failed to schedule crystal window close: {}", e));
        }
    }
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
    if TOGGLE_IN_PROGRESS
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        logger::log_debug("[Launcher] toggle ignored while another toggle is in progress");
        return;
    }

    let app_for_toggle = app.clone();
    if let Err(e) = app.run_on_main_thread(move || {
        if let Err(e) = toggle_quick_launcher(app_for_toggle) {
            logger::log_warn(&format!("[Launcher] toggle failed: {}", e));
        }
        TOGGLE_IN_PROGRESS.store(false, Ordering::Release);
    }) {
        TOGGLE_IN_PROGRESS.store(false, Ordering::Release);
        logger::log_warn(&format!("[Launcher] toggle scheduling failed: {}", e));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering as AtomicOrdering};
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

    #[test]
    fn launcher_toggle_metadata_contains_only_status_and_numeric_step_times() {
        let timings = LauncherToggleTimings {
            visibility_ms: Some(2),
            center_ms: Some(11),
            show_ms: Some(7),
            focus_ms: Some(3),
            ..Default::default()
        };
        let metadata = launcher_toggle_metadata(&timings, true);
        assert_eq!(metadata["status"], "success");
        assert_eq!(metadata["visibility_ms"], 2);
        assert_eq!(metadata["center_ms"], 11);
        assert_eq!(metadata["show_ms"], 7);
        assert_eq!(metadata["focus_ms"], 3);
        assert!(metadata.get("hide_ms").is_none());
        assert!(metadata.get("build_ms").is_none());
    }

    #[test]
    fn shortcut_cache_loads_once_for_repeated_queries() {
        let cache = Mutex::new(HashMap::new());
        let loads = AtomicUsize::new(0);
        let base = Path::new("vault-a");
        let first = get_or_load_shortcut_items(&cache, base, || {
            loads.fetch_add(1, AtomicOrdering::Relaxed);
            Ok(vec![item("a.md", "alpha", &["shortcut"])])
        })
        .unwrap();
        let second = get_or_load_shortcut_items(&cache, base, || {
            loads.fetch_add(1, AtomicOrdering::Relaxed);
            Ok(Vec::new())
        })
        .unwrap();
        assert_eq!(loads.load(AtomicOrdering::Relaxed), 1);
        assert_eq!(first, second);
    }

    #[test]
    fn shortcut_cache_is_separate_per_base_path() {
        let cache = Mutex::new(HashMap::new());
        let loads = AtomicUsize::new(0);
        for base in [Path::new("vault-a"), Path::new("vault-b")] {
            get_or_load_shortcut_items(&cache, base, || {
                loads.fetch_add(1, AtomicOrdering::Relaxed);
                Ok(Vec::new())
            })
            .unwrap();
        }
        assert_eq!(loads.load(AtomicOrdering::Relaxed), 2);
    }

    #[test]
    fn shortcut_cache_invalidation_forces_one_reload() {
        let cache = Mutex::new(HashMap::new());
        let loads = AtomicUsize::new(0);
        let base = Path::new("vault-a");
        get_or_load_shortcut_items(&cache, base, || {
            loads.fetch_add(1, AtomicOrdering::Relaxed);
            Ok(Vec::new())
        })
        .unwrap();
        invalidate_shortcut_cache(&cache);
        get_or_load_shortcut_items(&cache, base, || {
            loads.fetch_add(1, AtomicOrdering::Relaxed);
            Ok(Vec::new())
        })
        .unwrap();
        assert_eq!(loads.load(AtomicOrdering::Relaxed), 2);
    }

    #[test]
    fn shortcut_tag_change_invalidates_cache_but_normal_tag_change_does_not() {
        let cache = Mutex::new(HashMap::new());
        let base = Path::new("vault-a");
        get_or_load_shortcut_items(&cache, base, || Ok(Vec::new())).unwrap();

        assert!(!invalidate_shortcut_cache_for_tag(&cache, "work"));
        assert!(cache.lock().unwrap().contains_key(base));

        assert!(invalidate_shortcut_cache_for_tag(&cache, "shortcut"));
        assert!(!cache.lock().unwrap().contains_key(base));
    }

    #[test]
    fn lightweight_shortcut_parser_reads_only_launcher_fields() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("001_2026-07-15_MyNote.md");
        fs::write(
            &path,
            "---\ntags: [work, shortcut, recipe]\nlaunches: 7\nwindow: { x: 1, y: 2, width: 3, height: 4 }\n---\nbody",
        )
        .unwrap();
        let parsed = read_shortcut_item(&path).unwrap();
        assert_eq!(parsed.title, "MyNote");
        assert_eq!(parsed.launches, 7);
        assert!(parsed.is_recipe);
        assert_eq!(parsed.tags, vec!["work", "shortcut", "recipe"]);
    }

    #[test]
    fn lightweight_shortcut_parser_rejects_non_favorites() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("001_2026-07-15_Normal.md");
        fs::write(&path, "---\ntags: [work]\n---\nbody").unwrap();
        assert!(read_shortcut_item(&path).is_none());
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
    fn quick_open_emits_before_persisting_and_reuses_the_loaded_content() {
        use std::cell::RefCell;
        use std::rc::Rc;

        let content = "---\nbackgroundColor: \"#cfd8dc\"\nlaunches: 2\n---\n\nbody";
        let calls = Rc::new(RefCell::new(Vec::new()));
        let emit_calls = Rc::clone(&calls);
        let write_calls = Rc::clone(&calls);

        run_quick_open_after_read(
            content,
            move |color| {
                emit_calls.borrow_mut().push(format!("emit:{}", color.unwrap_or_default()));
                Ok(())
            },
            move |updated| {
                assert!(updated.contains("launches: 3"));
                assert!(updated.ends_with("body"));
                write_calls.borrow_mut().push("write".to_string());
                Ok(())
            },
        )
        .unwrap();

        assert_eq!(&*calls.borrow(), &["emit:#cfd8dc", "write"]);
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
    fn remove_from_shelf_moves_recipe_to_its_trash_and_keeps_recipe_tag() {
        let dir = tempdir().unwrap();
        let recipes = dir.path().join("Recipes");
        fs::create_dir(&recipes).unwrap();
        let source = recipes.join("recipe-note.md");
        fs::write(&source, note_content("work, recipe")).unwrap();

        let moved = remove_from_shelf_at_base(dir.path(), &source).unwrap().unwrap();

        assert_eq!(moved, recipes.join("Trash").join("recipe-note.md"));
        assert!(!source.exists());
        let content = fs::read_to_string(moved).unwrap();
        assert!(content.contains("tags: [work, recipe]"));
    }

    #[test]
    fn remove_from_shelf_moves_qa_to_its_trash_and_keeps_qa_tag() {
        let dir = tempdir().unwrap();
        let qa_dir = dir.path().join(storage::QA_DIR_NAME);
        fs::create_dir(&qa_dir).unwrap();
        let source = qa_dir.join("qa-note.md");
        fs::write(&source, note_content("work, qa")).unwrap();

        let moved = remove_from_shelf_at_base(dir.path(), &source).unwrap().unwrap();

        assert_eq!(moved, qa_dir.join("Trash").join("qa-note.md"));
        assert!(!source.exists());
        let content = fs::read_to_string(moved).unwrap();
        assert!(content.contains("tags: [work, qa]"));
    }

    #[test]
    fn remove_from_shelf_moves_term_to_its_trash_and_keeps_term_tag() {
        let dir = tempdir().unwrap();
        let terms_dir = dir.path().join(storage::TERMS_DIR_NAME);
        fs::create_dir(&terms_dir).unwrap();
        let source = terms_dir.join("term-note.md");
        fs::write(&source, note_content("work, term")).unwrap();

        let moved = remove_from_shelf_at_base(dir.path(), &source).unwrap().unwrap();

        assert_eq!(moved, terms_dir.join("Trash").join("term-note.md"));
        assert!(!source.exists());
        let content = fs::read_to_string(moved).unwrap();
        assert!(content.contains("tags: [work, term]"));
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
