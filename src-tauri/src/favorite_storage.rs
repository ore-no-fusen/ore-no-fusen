//! PC-local shelf state. Note contents and paths remain unchanged; this file is never Drive-synced.
use crate::{launcher, logic, state::AppState, storage};
use std::{
    collections::BTreeSet,
    path::Path,
    sync::{Mutex, OnceLock},
};
use tauri::{AppHandle, Emitter, Manager};

fn state_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}
fn state_path() -> Result<std::path::PathBuf, String> {
    Ok(storage::get_settings_path()?.with_file_name("favorite_storage.json"))
}
fn key(path: &str) -> String {
    crate::normalize_path_for_label(path)
}
fn read_at(file: &Path) -> Result<BTreeSet<String>, String> {
    match std::fs::read_to_string(file) {
        Ok(content) => serde_json::from_str(&content).map_err(|e| format!("Desktop storage: {e}")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(BTreeSet::new()),
        Err(e) => Err(e.to_string()),
    }
}
fn set_at(file: &Path, path: &str, stored: bool) -> Result<bool, String> {
    let mut entries = read_at(file)?;
    let changed = if stored {
        entries.insert(key(path))
    } else {
        entries.remove(&key(path))
    };
    if changed {
        let content = serde_json::to_string_pretty(&entries).map_err(|e| e.to_string())?;
        storage::write_note(&file.to_string_lossy(), &content)?;
    }
    Ok(changed)
}
pub(crate) fn set_stored(path: &str, stored: bool) -> Result<bool, String> {
    let _guard = state_lock().lock().unwrap_or_else(|p| p.into_inner());
    set_at(&state_path()?, path, stored)
}
pub(crate) fn stored_paths() -> Result<BTreeSet<String>, String> {
    let _guard = state_lock().lock().unwrap_or_else(|p| p.into_inner());
    read_at(&state_path()?)
}
fn retain_visible(notes: &mut Vec<crate::state::NoteMeta>, paths: &BTreeSet<String>) {
    notes.retain(|note| !paths.contains(&key(&note.path)));
}
#[cfg(test)]
pub(crate) fn stored_notes_in_vault(
    base: &str,
    paths: &BTreeSet<String>,
) -> Vec<crate::state::NoteMeta> {
    storage::list_notes(base)
        .into_iter()
        .filter(|note| paths.contains(&key(&note.path)))
        .collect()
}
pub(crate) fn exclude_stored(notes: &mut Vec<crate::state::NoteMeta>) {
    match stored_paths() {
        Ok(paths) => retain_visible(notes, &paths),
        // A corrupt local shelf file must never make notes inaccessible.
        Err(e) => crate::logger::log_warn(&format!("[Favorites] {e}; showing notes for recovery")),
    }
}
fn has_stored_notes_in_vault(base: &str, paths: &BTreeSet<String>) -> bool {
    let prefix = format!("{}/", key(base).trim_end_matches('/'));
    paths
        .iter()
        .any(|path| path.starts_with(&prefix) && Path::new(path).is_file())
}
#[tauri::command]
pub(crate) fn fusen_has_stored_favorites(app: AppHandle) -> Result<bool, String> {
    let base = {
        let state = app.state::<Mutex<AppState>>();
        let state = state.lock().unwrap_or_else(|p| p.into_inner());
        state
            .base_path
            .clone()
            .or_else(|| state.folder_path.clone())
            .unwrap_or_default()
    };
    Ok(has_stored_notes_in_vault(&base, &stored_paths()?))
}
#[tauri::command]
pub(crate) fn fusen_take_out_favorite(app: AppHandle, path: String) -> Result<(), String> {
    if set_stored(&path, false)? {
        if let Ok(note) = storage::read_note(&path) {
            let state = app.state::<Mutex<AppState>>();
            let mut state = state.lock().unwrap_or_else(|p| p.into_inner());
            if !state.notes.iter().any(|n| key(&n.path) == key(&path)) {
                state.notes.push(note.meta);
            }
        }
        let _ = app.emit("fusen:storage_changed", &path);
    }
    Ok(())
}
#[tauri::command]
pub(crate) async fn fusen_store_favorite(
    app: AppHandle,
    path: String,
    window_label: String,
    request_id: String,
) -> Result<String, String> {
    let register = pending()
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .get(&request_id)
        .map(|request| request.register)
        .ok_or("収納要求は期限切れです")?;
    validate_path(&app, &path)?;
    let state = app.state::<Mutex<AppState>>();
    if state
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .open_note_windows
        .get(&key(&path))
        .map(String::as_str)
        != Some(window_label.as_str())
    {
        return Err("window/path mismatch".into());
    }
    let window = app
        .get_webview_window(&window_label)
        .ok_or("window not found")?;
    let note = storage::read_note(&path)?;
    if note.meta.tags.iter().any(|tag| {
        matches!(
            logic::normalize_reserved_tag(tag).as_str(),
            "recipe" | "qa" | "term"
        )
    }) {
        return Err("Use the crystal return operation".into());
    }
    // Read the saved snapshot; never replace the body with stale frontend content.
    let mut content = launcher_storage_content(&note.body, register)?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let pos = window
        .outer_position()
        .map_err(|e| e.to_string())?
        .to_logical::<f64>(scale);
    let size = window
        .inner_size()
        .map_err(|e| e.to_string())?
        .to_logical::<f64>(scale);
    let height = if note.meta.folded == Some(true) {
        note.meta.height.unwrap_or(size.height)
    } else {
        size.height
    };
    content = logic::update_frontmatter_value(
        &content,
        "window",
        format!(
            "{{ x: {}, y: {}, width: {}, height: {} }}",
            pos.x, pos.y, size.width, height
        ),
    );
    storage::write_note_if_unchanged(&path, &note.body, &content)?;
    if register {
        // Registration remains valid even if the local storage-state write fails.
        launcher::emit_launcher_shelf_changed_for_tag(&app, "shortcut");
    }
    let saved = storage::read_note(&path)?.meta;
    // Persistence must succeed before the frontend animates or destroys its window.
    let changed = set_stored(&path, true)?;
    if let Some(request) = pending()
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .get_mut(&request_id)
    {
        request.changed |= changed;
    }
    launcher::invalidate_quick_open_content(&path);
    launcher::emit_launcher_shelf_changed_for_tag(&app, "shortcut");
    let state = app.state::<Mutex<AppState>>();
    let mut state = state.lock().unwrap_or_else(|p| p.into_inner());
    if let Some(existing) = state.notes.iter_mut().find(|n| key(&n.path) == key(&path)) {
        *existing = saved;
    } else {
        state.notes.push(saved);
    }
    drop(state);
    let _ = app.emit("fusen:storage_changed", &path);
    Ok(content)
}

// Registration is applied to the latest saved body, never a pre-save snapshot.
fn launcher_storage_content(content: &str, register: bool) -> Result<String, String> {
    let mut tags = logic::extract_meta_from_content(logic::split_frontmatter(content).0).6;
    if !register
        || tags
            .iter()
            .any(|tag| logic::normalize_reserved_tag(tag) == "shortcut")
    {
        return Ok(content.to_string());
    }
    tags.push("shortcut".into());
    tags.sort();
    Ok(logic::update_frontmatter_value(
        content,
        "tags",
        format!("[{}]", tags.join(", ")),
    ))
}

// Body/geometry saves cannot undo an explicit registration or removal made
// since that window's metadata snapshot was loaded.
pub(crate) fn preserve_launcher_registration(
    current: &str,
    incoming: &str,
) -> Result<String, String> {
    let (current_front, _) = logic::split_frontmatter(current);
    let registered = logic::extract_meta_from_content(current_front)
        .6
        .iter()
        .any(|tag| logic::normalize_reserved_tag(tag) == "shortcut");
    let incoming_registered = logic::extract_meta_from_content(incoming)
        .6
        .iter()
        .any(|tag| logic::normalize_reserved_tag(tag) == "shortcut");
    if registered == incoming_registered {
        return Ok(incoming.to_string());
    }
    let mut tags = logic::extract_meta_from_content(incoming).6;
    tags.retain(|tag| logic::normalize_reserved_tag(tag) != "shortcut");
    if registered {
        tags.push("shortcut".into());
    }
    Ok(logic::update_frontmatter_value(
        incoming,
        "tags",
        format!("[{}]", tags.join(", ")),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn store_completion_counts_changes_only_when_the_operation_succeeds() {
        for (changed, error, expected) in [
            (true, None, Ok(true)),
            (false, None, Ok(false)),
            (
                true,
                Some("save failed".to_string()),
                Err("save failed".to_string()),
            ),
        ] {
            let id = uuid::Uuid::new_v4().to_string();
            let (sender, mut receiver) = tokio::sync::oneshot::channel();
            pending().lock().unwrap().insert(
                id.clone(),
                StoreReply {
                    sender,
                    changed,
                    register: false,
                },
            );
            fusen_complete_store(id.clone(), error);
            assert_eq!(receiver.try_recv().unwrap(), expected);
            assert!(!pending().lock().unwrap().contains_key(&id));
            // A duplicate completion cannot add a second operation.
            fusen_complete_store(id, None);
        }
    }
    #[test]
    fn storing_and_taking_out_survive_reload_without_touching_note() {
        let dir = tempfile::tempdir().unwrap();
        let note = dir.path().join("note.md");
        let registry = dir.path().join("favorite_storage.json");
        std::fs::write(
            &note,
            "---\ntags: [work, shortcut]\n---\n![image](assets/a.png)\n",
        )
        .unwrap();
        let before = std::fs::read(&note).unwrap();
        let path = note.to_string_lossy();
        assert!(set_at(&registry, &path, true).unwrap());
        assert!(read_at(&registry).unwrap().contains(&key(&path)));
        assert!(!set_at(&registry, &path, true).unwrap());
        assert!(set_at(&registry, &path, false).unwrap());
        assert!(read_at(&registry).unwrap().is_empty());
        assert_eq!(std::fs::read(&note).unwrap(), before);
    }
    #[test]
    fn only_stored_notes_are_excluded_and_taking_out_restores_them() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("state.json");
        let stored = crate::state::NoteMeta {
            path: "D:/vault/stored.md".into(),
            tags: vec!["shortcut".into(), "saved-only".into()],
            ..Default::default()
        };
        let visible = crate::state::NoteMeta {
            path: "D:/vault/visible.md".into(),
            tags: vec!["shortcut".into()],
            ..Default::default()
        };
        let ordinary = crate::state::NoteMeta {
            path: "D:/vault/plain.md".into(),
            ..Default::default()
        };
        let all = vec![stored.clone(), visible, ordinary];
        set_at(&file, &stored.path, true).unwrap();
        let state = AppState {
            notes: all.clone(),
            ..Default::default()
        };
        let mut desktop = all.clone();
        retain_visible(&mut desktop, &read_at(&file).unwrap());
        assert_eq!(desktop.len(), 2);
        assert!(logic::get_all_unique_tags(&state).contains(&"saved-only".into()));
        assert!(!desktop.iter().any(|n| n.path == stored.path));
        set_at(&file, &stored.path, false).unwrap();
        let mut restored = all;
        retain_visible(&mut restored, &read_at(&file).unwrap());
        assert_eq!(restored.len(), 3);
        assert!(restored[0].tags.contains(&"shortcut".into()));
    }
    #[test]
    fn storage_is_independent_of_favorite_tags_and_scoped_to_vault() {
        let dir = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        let plain = dir.path().join("plain.md");
        let favorite = dir.path().join("favorite.md");
        let foreign = other.path().join("foreign.md");
        std::fs::write(&plain, "---\ntags: [work]\n---\nplain").unwrap();
        std::fs::write(&favorite, "---\ntags: [shortcut]\n---\nfavorite").unwrap();
        std::fs::write(&foreign, "foreign").unwrap();
        let paths = [plain.clone(), favorite.clone(), foreign]
            .iter()
            .map(|p| key(&p.to_string_lossy()))
            .collect();
        let listed = stored_notes_in_vault(&dir.path().to_string_lossy(), &paths);
        assert_eq!(listed.len(), 2);
        assert!(listed.iter().any(|n| n.tags.contains(&"shortcut".into())));
        assert!(listed.iter().any(|n| !n.tags.contains(&"shortcut".into())));
        std::fs::write(&favorite, "---\ntags: []\n---\nfavorite").unwrap();
        assert_eq!(
            stored_notes_in_vault(&dir.path().to_string_lossy(), &paths).len(),
            2
        );
    }
    #[test]
    fn all_stored_is_distinct_from_an_empty_or_different_vault() {
        let dir = tempfile::tempdir().unwrap();
        let note = dir.path().join("note.md");
        std::fs::write(&note, "favorite").unwrap();
        let mut paths = BTreeSet::new();
        paths.insert(key(&note.to_string_lossy()));
        assert!(has_stored_notes_in_vault(
            &dir.path().to_string_lossy(),
            &paths
        ));
        assert!(!has_stored_notes_in_vault(
            &dir.path().join("other").to_string_lossy(),
            &paths
        ));
        paths.insert(key(&dir.path().join("missing.md").to_string_lossy()));
        paths.remove(&key(&note.to_string_lossy()));
        assert!(!has_stored_notes_in_vault(
            &dir.path().to_string_lossy(),
            &paths
        ));
    }
    #[test]
    fn equivalent_windows_paths_share_one_storage_entry() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("state.json");
        set_at(&file, "D:\\Vault\\NOTE.md", true).unwrap();
        assert!(set_at(&file, "d:/vault/note.md", false).unwrap());
        assert!(read_at(&file).unwrap().is_empty());
    }
    #[test]
    fn missing_registry_keeps_existing_favorites_visible() {
        let dir = tempfile::tempdir().unwrap();
        assert!(read_at(&dir.path().join("missing.json"))
            .unwrap()
            .is_empty());
    }
    #[test]
    fn corrupt_registry_is_not_overwritten() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("state.json");
        std::fs::write(&file, "{broken").unwrap();
        assert!(set_at(&file, "note.md", true).is_err());
        assert_eq!(std::fs::read_to_string(file).unwrap(), "{broken");
    }
    #[test]
    fn persistence_failure_does_not_claim_success() {
        let dir = tempfile::tempdir().unwrap();
        assert!(set_at(&dir.path().join("absent/state.json"), "note.md", true).is_err());
    }
}
use serde::Serialize;
use std::collections::HashMap;
struct StoreReply {
    sender: tokio::sync::oneshot::Sender<Result<bool, String>>,
    changed: bool,
    register: bool,
}
fn pending() -> &'static Mutex<HashMap<String, StoreReply>> {
    static PENDING: OnceLock<Mutex<HashMap<String, StoreReply>>> = OnceLock::new();
    PENDING.get_or_init(|| Mutex::new(HashMap::new()))
}
fn base(app: &AppHandle) -> String {
    let state = app.state::<Mutex<AppState>>();
    let state = state.lock().unwrap_or_else(|p| p.into_inner());
    state
        .base_path
        .clone()
        .or_else(|| state.folder_path.clone())
        .unwrap_or_default()
}
fn eligible(note: &crate::state::NoteMeta) -> bool {
    !note.tags.iter().any(|t| {
        matches!(
            logic::normalize_reserved_tag(t).as_str(),
            "recipe" | "qa" | "term"
        )
    })
}
pub(crate) fn desktop_note_paths(base: &Path) -> Vec<std::path::PathBuf> {
    std::fs::read_dir(base)
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_file() && path.extension().is_some_and(|ext| ext == "md"))
        .collect()
}
fn accessible_notes(base: &str) -> Vec<crate::state::NoteMeta> {
    desktop_note_paths(Path::new(base))
        .into_iter()
        .filter_map(|path| {
            storage::read_note(&path.to_string_lossy())
                .ok()
                .map(|n| n.meta)
        })
        .collect()
}
fn tag_targets(notes: Vec<crate::state::NoteMeta>, tag: &str) -> Vec<crate::state::NoteMeta> {
    notes
        .into_iter()
        .filter(|n| eligible(n) && n.tags.iter().any(|t| t == tag))
        .collect()
}
fn validate_target(base: &str, path: &str) -> Result<crate::state::NoteMeta, String> {
    // Preserve the existing folder/exclusion rules without reading every other body.
    let target = desktop_note_paths(Path::new(base))
        .into_iter()
        .find(|candidate| key(&candidate.to_string_lossy()) == key(path))
        .ok_or("付箋が現在のフォルダーにありません")?;
    storage::read_note(&target.to_string_lossy()).map(|n| n.meta)
}
fn validate_path(app: &AppHandle, path: &str) -> Result<(), String> {
    let note = validate_target(&base(app), path)?;
    if !eligible(&note) {
        return Err("QA・用語・手順は既存の返却操作を使ってください".into());
    }
    Ok(())
}
#[derive(Serialize)]
pub(crate) struct StorageSnapshot {
    paths: Vec<String>,
    items: Vec<launcher::QuickOpenItem>,
    tags: Vec<String>,
}
#[tauri::command]
pub(crate) async fn fusen_storage_snapshot(app: AppHandle) -> Result<StorageSnapshot, String> {
    tokio::task::spawn_blocking(move || storage_snapshot(&app))
        .await
        .map_err(|e| e.to_string())?
}
fn storage_snapshot(app: &AppHandle) -> Result<StorageSnapshot, String> {
    let stored = stored_paths()?;
    let notes = accessible_notes(&base(app));
    let mut tags = BTreeSet::new();
    let mut items = Vec::new();
    let mut paths = Vec::new();
    for n in notes.into_iter().filter(eligible) {
        for tag in &n.tags {
            if !matches!(
                logic::normalize_reserved_tag(tag).as_str(),
                "shortcut" | "recipe" | "qa" | "term"
            ) {
                tags.insert(tag.clone());
            }
        }
        if stored.contains(&key(&n.path)) {
            paths.push(n.path.clone());

            items.push(launcher::QuickOpenItem {
                path: n.path,
                title: n.context,
                tags: n.tags,
                launches: 0,
                is_recipe: false,
            });
        }
    }
    Ok(StorageSnapshot {
        paths,
        items,
        tags: tags.into_iter().collect(),
    })
}
#[tauri::command]
pub(crate) fn fusen_complete_store(request_id: String, error: Option<String>) {
    if let Some(reply) = pending()
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .remove(&request_id)
    {
        let _ = reply.sender.send(error.map_or(Ok(reply.changed), Err));
    }
}
pub(crate) fn log_visibility_latency(action: &str, requested_at: Option<u64>) {
    if cfg!(debug_assertions) {
        if let Some(start) = requested_at {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64;
            let message = format!(
                "[LauncherVisibility] click_to_{}_ms={}",
                action,
                now.saturating_sub(start)
            );
            crate::logger::log_info(&message);
            println!("{}", message);
        }
    }
}
#[tauri::command]
pub(crate) async fn fusen_request_store(
    app: AppHandle,
    path: String,
    requested_at: Option<u64>,
) -> Result<(), String> {
    request_store(app, path, requested_at, false).await
}

async fn request_store(
    app: AppHandle,
    path: String,
    requested_at: Option<u64>,
    register: bool,
) -> Result<(), String> {
    validate_path(&app, &path)?;
    let already_stored = stored_paths()?.contains(&key(&path));
    if already_stored && !register {
        return Ok(());
    }
    let label = {
        let state = app.state::<Mutex<AppState>>();
        let state = state.lock().unwrap_or_else(|p| p.into_inner());
        state
            .open_note_windows
            .get(&key(&path))
            .cloned()
            .unwrap_or_else(|| crate::get_window_label(&path))
    };
    let window = app.get_webview_window(&label);
    if window.is_none() {
        if register {
            let note = storage::read_note(&path)?;
            let content = launcher_storage_content(&note.body, true)?;
            storage::write_note_if_unchanged(&path, &note.body, &content)?;
            launcher::emit_launcher_shelf_changed_for_tag(&app, "shortcut");
        }
        let changed = set_stored(&path, true)?;
        app.emit("fusen:storage_changed", &path)
            .map_err(|e| e.to_string())?;
        count_successful_store(&app, changed);
        return Ok(());
    }
    let window = window.unwrap();
    // Switch visibility directly; frontend saving and reconciliation follow afterwards.
    window.hide().map_err(|e| e.to_string())?;
    log_visibility_latency("hide", requested_at);
    let id = uuid::Uuid::new_v4().to_string();
    let (sender, receiver) = tokio::sync::oneshot::channel();
    pending().lock().unwrap_or_else(|p| p.into_inner()).insert(
        id.clone(),
        StoreReply {
            sender,
            changed: false,
            register,
        },
    );
    if let Err(e) = app.emit_to(
        &label,
        "fusen:store_favorite",
        serde_json::json!({"path":path,"requestId":id,"wasStored":already_stored}),
    ) {
        pending()
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .remove(&id);
        if !already_stored {
            let _ = window.show();
        }
        return Err(e.to_string());
    }
    let result = tokio::time::timeout(std::time::Duration::from_secs(15), receiver).await;
    pending()
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .remove(&id);
    let outcome = result
        .map_err(|_| {
            "付箋の保存応答を待てませんでした。状態を確認して再試行してください".to_string()
        })
        .and_then(|reply| reply.map_err(|e| e.to_string()))
        .and_then(|reply| reply);
    if outcome.is_err() {
        let _ = set_stored(&path, already_stored);
        if already_stored {
            let _ = window.hide();
        } else {
            let _ = window.show();
        }
    }
    if let Ok(changed) = &outcome {
        count_successful_store(&app, *changed);
    }
    outcome.map(|_| ())
}
fn count_successful_store(app: &AppHandle, changed: bool) {
    if !changed {
        return;
    }
    let state = app.state::<Mutex<AppState>>();
    if let Ok(mut state) = state.lock() {
        crate::member_identity::record_launcher_store(&mut state);
    };
}
#[derive(Serialize)]
pub(crate) struct TagStoreResult {
    stored: usize,
    failed: Vec<String>,
}
#[tauri::command]
pub(crate) async fn fusen_store_tag(app: AppHandle, tag: String) -> Result<TagStoreResult, String> {
    if tag.trim().is_empty()
        || matches!(
            logic::normalize_reserved_tag(&tag).as_str(),
            "shortcut" | "qa" | "term" | "recipe"
        )
    {
        return Err("ユーザーのタグを選んでください".into());
    }
    let notes = accessible_notes(&base(&app));
    let mut result = TagStoreResult {
        stored: 0,
        failed: Vec::new(),
    };
    for note in tag_targets(notes, &tag) {
        match request_store(app.clone(), note.path.clone(), None, true).await {
            Ok(()) => result.stored += 1,
            Err(e) => result.failed.push(format!("{}: {}", note.context, e)),
        }
    }
    Ok(result)
}
#[tauri::command]
pub(crate) fn fusen_stored_window_labels(app: AppHandle) -> Result<Vec<String>, String> {
    let paths = stored_paths()?;
    let state = app.state::<Mutex<AppState>>();
    let state = state.lock().unwrap_or_else(|p| p.into_inner());
    let mut labels = Vec::new();
    for path in paths {
        labels.push(
            state
                .open_note_windows
                .get(&path)
                .cloned()
                .unwrap_or_else(|| crate::get_window_label(&path)),
        );
    }
    Ok(labels)
}
#[cfg(test)]
mod tag_storage_tests {
    use super::*;
    #[test]
    fn bulk_registration_preserves_body_and_tags_and_is_repeatable() {
        let original =
            "---\ntags: [仕事]\nwindow: { x: 10, y: 20 }\n---\n最新本文 ![画像](assets/a.png)";
        let registered = launcher_storage_content(original, true).unwrap();
        assert_eq!(
            logic::split_frontmatter(&registered).1,
            logic::split_frontmatter(original).1
        );
        let tags = logic::extract_meta_from_content(&registered).6;
        assert!(tags.contains(&"仕事".to_string()));
        assert!(tags.contains(&"shortcut".to_string()));
        assert_eq!(
            launcher_storage_content(&registered, true).unwrap(),
            registered
        );
        assert_eq!(launcher_storage_content(original, false).unwrap(), original);
    }
    #[test]
    fn stale_saves_cannot_undo_registration_or_explicit_removal() {
        let plain = "---\ntags: [仕事]\n---";
        let registered = launcher_storage_content(plain, true).unwrap();
        let kept = preserve_launcher_registration(&registered, plain).unwrap();
        assert!(logic::extract_meta_from_content(&kept)
            .6
            .contains(&"shortcut".into()));
        let removed = preserve_launcher_registration(plain, &registered).unwrap();
        assert!(!logic::extract_meta_from_content(&removed)
            .6
            .contains(&"shortcut".into()));
        let body_only = format!("{plain}\n本文\ntags: [shortcut]");
        assert_eq!(
            preserve_launcher_registration(&body_only, plain).unwrap(),
            plain
        );
        let uppercase = "---\ntags: [仕事, Shortcut]\n---";
        assert!(logic::extract_meta_from_content(
            &preserve_launcher_registration(uppercase, plain).unwrap()
        )
        .6
        .iter()
        .any(|tag| logic::normalize_reserved_tag(tag) == "shortcut"));
        assert!(!logic::extract_meta_from_content(
            &preserve_launcher_registration(plain, uppercase).unwrap()
        )
        .6
        .iter()
        .any(|tag| logic::normalize_reserved_tag(tag) == "shortcut"));
        assert_eq!(
            launcher_storage_content(uppercase, true).unwrap(),
            uppercase
        );
    }
    fn note(path: &str, tags: &[&str]) -> crate::state::NoteMeta {
        crate::state::NoteMeta {
            path: path.into(),
            tags: tags.iter().map(|t| t.to_string()).collect(),
            ..Default::default()
        }
    }
    #[test]
    fn entire_tag_includes_non_favorites_and_excludes_other_tags_and_crystals() {
        let notes = vec![
            note("favorite", &["shortcut", "仕事"]),
            note("plain", &["仕事"]),
            note("other", &["生活"]),
            note("qa", &["qa", "仕事"]),
            note("recipe", &["recipe", "仕事"]),
            note("term", &["term", "仕事"]),
        ];
        let paths: Vec<_> = tag_targets(notes, "仕事")
            .into_iter()
            .map(|n| n.path)
            .collect();
        assert_eq!(paths, vec!["favorite", "plain"]);
    }
    #[test]
    fn archived_and_deleted_notes_are_not_reintroduced_into_the_launcher() {
        let dir = tempfile::tempdir().unwrap();
        for relative in [
            "normal.md",
            "tags/work/saved.md",
            "Archive/old.md",
            "Trash/deleted.md",
            "tags/work/Trash/deleted.md",
        ] {
            let path = dir.path().join(relative);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, "---\ntags: [仕事]\n---\n本文 ![画像](assets/a.png)").unwrap();
        }
        let notes = accessible_notes(&dir.path().to_string_lossy());
        assert_eq!(notes.len(), 1);
        assert!(notes
            .iter()
            .all(|n| !n.path.contains("Trash") && !n.path.contains("Archive")));
    }
    #[test]
    fn single_target_validation_keeps_folder_boundaries() {
        let dir = tempfile::tempdir().unwrap();
        for relative in [
            "normal.md",
            "tags/work/saved.md",
            "Archive/old.md",
            "Trash/deleted.md",
            "tags/work/Trash/deleted.md",
        ] {
            let path = dir.path().join(relative);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, "---\ntags: [shortcut]\n---\nbody").unwrap();
        }
        let base = dir.path().to_string_lossy();
        for relative in ["normal.md"] {
            assert!(validate_target(&base, &dir.path().join(relative).to_string_lossy()).is_ok());
        }
        for relative in [
            "tags/work/saved.md",
            "Archive/old.md",
            "Trash/deleted.md",
            "tags/work/Trash/deleted.md",
            "missing.md",
        ] {
            assert!(validate_target(&base, &dir.path().join(relative).to_string_lossy()).is_err());
        }
        let foreign = tempfile::NamedTempFile::new().unwrap();
        assert!(validate_target(&base, &foreign.path().to_string_lossy()).is_err());
    }
}
