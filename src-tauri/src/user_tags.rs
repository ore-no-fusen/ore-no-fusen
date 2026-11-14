//! Vault-scoped user tag catalog and resumable metadata-only changes.
use crate::{launcher, logic, state::AppState, storage};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Default, Serialize, Deserialize)]
struct Registry {
    vaults: BTreeMap<String, Catalog>,
}
#[derive(Default, Serialize, Deserialize)]
struct Catalog {
    tags: BTreeSet<String>,
    #[serde(default)]
    created_order: BTreeMap<String, u64>,
    pending: Option<Pending>,
    #[serde(default)]
    interrupted: Vec<Pending>,
}
#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct Pending {
    pub old: String,
    pub new: Option<String>,
    targets: Vec<String>,
    completed: BTreeSet<String>,
}
#[derive(Serialize)]
pub(crate) struct CatalogView {
    pub(crate) tags: Vec<String>,
    pub(crate) counts: BTreeMap<String, usize>,
    pub(crate) created_order: BTreeMap<String, u64>,
    pending: Option<Pending>,
}
#[derive(Serialize)]
pub(crate) struct TagResult {
    pub changed: usize,
    pub failed: Vec<String>,
}

fn lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}
fn registry_path() -> Result<PathBuf, String> {
    Ok(storage::get_settings_path()?.with_file_name("user_tags.json"))
}
pub(crate) fn check_assignment(base: &str, tag: &str) -> Result<(), String> {
    let _guard = lock().lock().unwrap_or_else(|p| p.into_inner());
    let registry = read_registry(&registry_path()?)?;
    if registry.vaults.get(&vault_key(Path::new(base))).and_then(|c| c.pending.as_ref())
        .is_some_and(|p| p.old == tag) {
        return Err("このタグは変更途中です。ランチャーでタグ変更を再試行してください".into());
    }
    Ok(())
}
fn vault_key(base: &Path) -> String {
    crate::normalize_path_for_label(&base.to_string_lossy())
}
fn read_registry(file: &Path) -> Result<Registry, String> {
    match std::fs::read_to_string(file) {
        Ok(raw) => serde_json::from_str(&raw).map_err(|e| format!("タグ台帳を読み取れません: {e}")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Registry::default()),
        Err(e) => Err(e.to_string()),
    }
}
fn write_registry(file: &Path, registry: &Registry) -> Result<(), String> {
    storage::write_note(
        &file.to_string_lossy(),
        &serde_json::to_string_pretty(registry).map_err(|e| e.to_string())?,
    )
}
fn validate(tag: &str) -> Result<String, String> {
    if tag.chars().any(|c|c.is_control()) { return Err("タグ名に改行は使えません".into()); }
    let tag = tag.trim();
    if tag.is_empty()
        || tag.chars().count() > 80
        || logic::is_reserved_tag(tag)
        || ["すべて", "未分類", "__all__", "__unclassified__"].contains(&tag)
        || tag.chars().any(|c| c.is_control() || ",[]\"'".contains(c))
    {
        return Err(
            "タグ名を確認してください（空白・予約語・改行・カンマ・括弧・引用符は使えません）"
                .into(),
        );
    }
    Ok(tag.to_string())
}
pub(crate) fn tags_in(content: &str) -> Vec<String> {
    logic::extract_meta_from_content(logic::split_frontmatter(content).0).6
}
pub(crate) fn preserve_saved_tags(current: &str, incoming: &str) -> String {
    let tags = tags_in(current);
    if tags == tags_in(incoming) {
        return incoming.to_string();
    }
    logic::update_frontmatter_value(incoming, "tags", serde_json::to_string(&tags).unwrap())
}

// Deliberately do not use list_notes: it migrates files and ignores read errors.
fn scan(base: &Path) -> Result<Vec<(String, Vec<String>)>, String> {
    let mut notes = Vec::new();
    for entry in walkdir::WalkDir::new(base)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            e.depth() == 0
                || (!e.file_type().is_symlink()
                    && !["trash", "assets", "node_modules"]
                        .contains(&e.file_name().to_string_lossy().to_lowercase().as_str())
                    && !e.file_name().to_string_lossy().starts_with('.'))
        })
    {
        let entry = entry.map_err(|e| format!("タグ対象を確認できません: {e}"))?;
        if !entry.file_type().is_file() || entry.path().extension().is_none_or(|s| s != "md") {
            continue;
        }
        let path = entry.path().to_string_lossy().to_string();
        let raw = std::fs::read_to_string(entry.path()).map_err(|e| format!("{path}: {e}"))?;
        notes.push((path, tags_in(&raw)));
    }
    Ok(notes)
}
fn observed(notes: &[(String, Vec<String>)]) -> BTreeSet<String> {
    notes
        .iter()
        .flat_map(|(_, tags)| tags.iter())
        .filter(|t| !logic::is_reserved_tag(t))
        .cloned()
        .collect()
}
pub(crate) fn remember(
    base: &str,
    tags: impl IntoIterator<Item = String>,
) -> Result<Vec<String>, String> {
    let _guard = lock().lock().unwrap_or_else(|p| p.into_inner());
    remember_at(&registry_path()?, Path::new(base), tags)
}
fn remember_at(
    file: &Path,
    base: &Path,
    tags: impl IntoIterator<Item = String>,
) -> Result<Vec<String>, String> {
    let mut registry = read_registry(file)?;
    let catalog = registry.vaults.entry(vault_key(base)).or_default();
    let before = catalog.tags.clone();
    let order = catalog.created_order.values().copied().max().unwrap_or(0).saturating_add(1);
    for tag in tags.into_iter().filter(|t| !logic::is_reserved_tag(t)) {
        if catalog.tags.insert(tag.clone()) { catalog.created_order.insert(tag, order); }
    }
    let result = catalog.tags.iter().cloned().collect();
    if before != catalog.tags {
        write_registry(file, &registry)?;
    }
    Ok(result)
}
fn catalog_at(file: &Path, base: &Path) -> Result<CatalogView, String> {
    let notes = scan(base)?;
    remember_at(file, base, observed(&notes))?;
    let mut registry = read_registry(file)?;
    let catalog = registry.vaults.remove(&vault_key(base)).unwrap_or_default();
    let mut counts = BTreeMap::new();
    for (_, tags) in notes {
        for tag in tags.into_iter().collect::<BTreeSet<_>>() {
            *counts.entry(tag).or_default() += 1;
        }
    }
    Ok(CatalogView {
        tags: catalog.tags.into_iter().collect(),
        counts,
        created_order: catalog.created_order,
        pending: catalog.pending,
    })
}
pub(crate) fn catalog_for_launcher(base: &str) -> Result<CatalogView, String> {
    let _guard = lock().lock().unwrap_or_else(|p| p.into_inner());
    catalog_at(&registry_path()?, Path::new(base))
}
fn create_at(file: &Path, base: &Path, tag: &str) -> Result<(), String> {
    let tag = validate(tag)?;
    let view = catalog_at(file, base)?;
    if view.pending.is_some() {
        return Err("未完了のタグ変更を先に再試行してください".into());
    }
    if view.tags.contains(&tag) {
        return Err("同じ名前のタグがあります".into());
    }
    remember_at(file, base, [tag])?;
    Ok(())
}
fn update_one(base: &Path, path: &str, old: &str, new: Option<&str>) -> Result<(), String> {
    let canonical = dunce::canonicalize(path).map_err(|e| e.to_string())?;
    let root = dunce::canonicalize(base).map_err(|e| e.to_string())?;
    if !canonical.starts_with(&root)
        || canonical
            .strip_prefix(&root)
            .unwrap()
            .components()
            .any(|p| {
                p.as_os_str()
                    .to_string_lossy()
                    .eq_ignore_ascii_case("Trash")
            })
    {
        return Err("対象は現在の保存先の付箋ではありません".into());
    }
    for _ in 0..3 {
        let raw = std::fs::read_to_string(&canonical).map_err(|e| e.to_string())?;
        let mut tags = tags_in(&raw);
        if !tags.iter().any(|t| t == old) {
            return Ok(());
        }
        tags.retain(|t| t != old);
        if let Some(new) = new {
            if !tags.iter().any(|t| t == new) {
                tags.push(new.to_string());
            }
        }
        let updated = logic::update_frontmatter_value(
            &raw,
            "tags",
            serde_json::to_string(&tags).map_err(|e| e.to_string())?,
        );
        if storage::write_note_if_unchanged(&canonical.to_string_lossy(), &raw, &updated).is_ok() {
            return Ok(());
        }
    }
    Err("原本が変更中か保存できません。原本を保ったまま再試行してください".into())
}
fn change_at(file: &Path, base: &Path, old: &str, new: Option<&str>) -> Result<TagResult, String> {
    let old = validate(old)?;
    let new = new.map(validate).transpose()?;
    if new.as_ref() == Some(&old) {
        return Err("別のタグ名を入力してください".into());
    }
    let mut registry = read_registry(file)?;
    let key = vault_key(base);
    let catalog = registry.vaults.entry(key.clone()).or_default();
    if let Some(pending) = &catalog.pending {
        if pending.old != old || pending.new != new {
            return Err("未完了のタグ変更を先に再試行してください".into());
        }
    } else {
        let notes = scan(base)?;
        catalog.tags.extend(observed(&notes));
        if !catalog.tags.contains(&old) {
            return Err("対象タグがありません".into());
        }
        if new.as_ref().is_some_and(|n| catalog.tags.contains(n)) {
            return Err("同じ名前のタグがあります".into());
        }
        catalog.pending = Some(Pending {
            old: old.clone(),
            new: new.clone(),
            targets: notes
                .into_iter()
                .filter(|(_, t)| t.contains(&old))
                .map(|(p, _)| p)
                .collect(),
            completed: BTreeSet::new(),
        });
        write_registry(file, &registry)?;
    }
    let mut pending = registry.vaults[&key].pending.clone().unwrap();
    // Re-read even completed files: another writer may have restored the old tag
    // or created a new matching note between retries.
    for (path, tags) in scan(base)? {
        if tags.contains(&old) {
            pending.completed.remove(&path);
            if !pending.targets.contains(&path) { pending.targets.push(path); }
        }
    }
    registry.vaults.get_mut(&key).unwrap().pending = Some(pending.clone());
    write_registry(file, &registry)?;
    let mut failed = Vec::new();
    for path in pending.targets.clone() {
        if pending.completed.contains(&path) {
            continue;
        }
        match update_one(base, &path, &old, new.as_deref()) {
            Ok(()) => {
                pending.completed.insert(path);
                registry.vaults.get_mut(&key).unwrap().pending = Some(pending.clone());
                write_registry(file, &registry)?;
            }
            Err(error) => failed.push(format!("{path}: {error}")),
        }
    }
    let changed = pending.completed.len();
    if failed.is_empty() {
        for (path, tags) in scan(base)? {
            if tags.contains(&old) {
                failed.push(format!("{path}: 対象タグが再追加されました。再試行してください"));
            }
        }
    }
    if failed.is_empty() {
        let catalog = registry.vaults.get_mut(&key).unwrap();
        catalog.tags.remove(&old);
        let order = catalog.created_order.remove(&old);
        if let Some(new) = new {
            catalog.tags.insert(new.clone());
            catalog.created_order.remove(&new);
            if let Some(order) = order { catalog.created_order.insert(new, order); }
        }
        catalog.pending = None;
        write_registry(file, &registry)?;
    }
    Ok(TagResult { changed, failed })
}
fn base(app: &AppHandle) -> Result<String, String> {
    let state = app.state::<Mutex<AppState>>();
    let state = state.lock().unwrap_or_else(|p| p.into_inner());
    state
        .base_path
        .clone()
        .or_else(|| state.folder_path.clone())
        .ok_or("保存先がありません".into())
}
#[tauri::command]
pub(crate) fn fusen_user_tag_catalog(app: AppHandle) -> Result<CatalogView, String> {
    let base = base(&app)?;
    let _guard = lock().lock().unwrap_or_else(|p| p.into_inner());
    catalog_at(&registry_path()?, Path::new(&base))
}
#[tauri::command]
pub(crate) fn fusen_create_user_tag(app: AppHandle, tag: String) -> Result<(), String> {
    let base = base(&app)?;
    let _guard = lock().lock().unwrap_or_else(|p| p.into_inner());
    create_at(&registry_path()?, Path::new(&base), &tag)?;
    launcher::emit_launcher_shelf_changed(&app);
    Ok(())
}
pub(crate) fn change(app: &AppHandle, old: &str, new: Option<&str>) -> Result<TagResult, String> {
    let state = app.state::<Mutex<AppState>>();
    let mut state = state.lock().unwrap_or_else(|p| p.into_inner());
    let base = state
        .base_path
        .clone()
        .or_else(|| state.folder_path.clone())
        .ok_or("保存先がありません")?;
    let result = {
        let _guard = lock().lock().unwrap_or_else(|p| p.into_inner());
        change_at(&registry_path()?, Path::new(&base), old, new)
    };
    let mut updates = Vec::new();
    // Open QA/term/recipe windows need metadata notifications too; they may
    // not be represented in the desktop note list.
    if let Ok(notes) = scan(Path::new(&base)) { updates.extend(notes); }
    for note in &mut state.notes {
        if let Ok(saved) = storage::read_note(&note.path) {
            note.tags = tags_in(&saved.body);
        }
    }
    drop(state);
    for (path, tags) in updates {
        let _ = app.emit(
            "fusen:note_tags_changed",
            serde_json::json!({"path":path,"tags":tags}),
        );
    }
    launcher::emit_launcher_shelf_changed(app);
    let _ = crate::tray::refresh_tray_menu(app);
    result
}
#[tauri::command]
pub(crate) fn fusen_rename_user_tag(
    app: AppHandle,
    tag: String,
    name: String,
) -> Result<TagResult, String> {
    change(&app, &tag, Some(&name))
}
#[tauri::command]
pub(crate) fn fusen_delete_user_tag(app: AppHandle, tag: String) -> Result<TagResult, String> {
    change(&app, &tag, None)
}

// Unused-tag cleanup only edits the catalog. It must never strip tags from
// notes that started using a selected tag after the management screen opened.
fn delete_unused_at(file: &Path, base: &Path, tags: &[String]) -> Result<TagResult, String> {
    let selected = tags.iter().map(|tag| validate(tag)).collect::<Result<BTreeSet<_>, _>>()?;
    let used = observed(&scan(base)?);
    let mut registry = read_registry(file)?;
    let catalog = registry.vaults.entry(vault_key(base)).or_default();
    if catalog.pending.is_some() {
        return Err("変更途中のタグがあります。タグ変更の再試行を完了してから整理してください".into());
    }
    let mut result = TagResult { changed: 0, failed: Vec::new() };
    for tag in selected {
        if used.contains(&tag) {
            result.failed.push(format!("{tag}: 使用中のため削除しませんでした"));
        } else if catalog.tags.remove(&tag) {
            catalog.created_order.remove(&tag);
            result.changed += 1;
        }
    }
    if result.changed > 0 { write_registry(file, &registry)?; }
    Ok(result)
}

#[tauri::command]
pub(crate) async fn fusen_delete_unused_user_tags(app: AppHandle, tags: Vec<String>) -> Result<TagResult, String> {
    let base = base(&app)?;
    let result = tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock().lock().unwrap_or_else(|p| p.into_inner());
        delete_unused_at(&registry_path()?, Path::new(&base), &tags)
    }).await.map_err(|error| error.to_string())??;
    launcher::emit_launcher_shelf_changed(&app);
    Ok(result)
}
// Keep the unresolved paths and progress in the registry; never pretend that
// missing/moved originals were successfully changed, and never roll back edits.
#[tauri::command]
pub(crate) fn fusen_stop_user_tag_change(app: AppHandle) -> Result<(), String> {
    let base = base(&app)?;
    let _guard = lock().lock().unwrap_or_else(|p| p.into_inner());
    stop_at(&registry_path()?, Path::new(&base))?;
    launcher::emit_launcher_shelf_changed(&app);
    Ok(())
}
fn stop_at(file: &Path, base: &Path) -> Result<(), String> {
    let mut registry = read_registry(file)?;
    let catalog = registry.vaults.entry(vault_key(base)).or_default();
    if let Some(pending) = catalog.pending.take() {
        if let Some(new) = &pending.new { catalog.tags.insert(new.clone()); }
        catalog.tags.insert(pending.old.clone());
        catalog.interrupted.push(pending);
        write_registry(file, &registry)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture(base: &Path, relative: &str) -> PathBuf {
        let path = base.join(relative);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, "---\ntags: [仕事, shortcut]\nwindow: { x: 10, y: 20, width: 300, height: 400 }\n---\n未保存と混同しない本文\n![画像](assets/a.png)\ntags: [本文の行]").unwrap();
        path
    }
    #[test]
    fn unused_tags_survive_reload_and_are_separate_for_each_vault() {
        let dir = tempfile::tempdir().unwrap();
        let a = dir.path().join("a");
        let b = dir.path().join("b");
        std::fs::create_dir_all(&a).unwrap();
        std::fs::create_dir_all(&b).unwrap();
        let registry = dir.path().join("catalog.json");
        create_at(&registry, &a, "旅行").unwrap();
        assert_eq!(catalog_at(&registry, &a).unwrap().tags, vec!["旅行"]);
        assert!(catalog_at(&registry, &b).unwrap().tags.is_empty());
        assert!(create_at(&registry, &a, "旅行").is_err());
        assert!(change_at(&registry, &a, "旅行", None)
            .unwrap()
            .failed
            .is_empty());
        assert!(catalog_at(&registry, &a).unwrap().tags.is_empty());
    }
    #[test]
    fn unused_cleanup_rechecks_archived_usage_without_editing_any_notes() {
        let dir = tempfile::tempdir().unwrap();
        let base = dir.path().join("vault");
        std::fs::create_dir_all(&base).unwrap();
        let registry = dir.path().join("catalog.json");
        create_at(&registry, &base, "未使用").unwrap();
        create_at(&registry, &base, "仕事").unwrap();
        // It became used after the UI displayed it as unused.
        let archived = fixture(&base, "tags/仕事/saved.md");
        let before = std::fs::read(&archived).unwrap();
        let result = delete_unused_at(&registry, &base, &vec!["未使用".into(), "仕事".into()]).unwrap();
        assert_eq!(result.changed, 1);
        assert_eq!(result.failed.len(), 1);
        assert_eq!(std::fs::read(archived).unwrap(), before);
        let view = catalog_at(&registry, &base).unwrap();
        assert_eq!(view.tags, vec!["仕事"]);
        assert_eq!(view.counts["仕事"], 1);
    }
    #[test]
    fn new_tags_keep_creation_order_across_reload_and_rename() {
        let dir = tempfile::tempdir().unwrap();
        let registry = dir.path().join("catalog.json");
        let base = dir.path().join("vault");
        std::fs::create_dir_all(&base).unwrap();
        create_at(&registry, &base, "先").unwrap();
        create_at(&registry, &base, "後").unwrap();
        let before = catalog_at(&registry, &base).unwrap();
        assert!(before.created_order["後"] > before.created_order["先"]);
        change_at(&registry, &base, "先", Some("改名")).unwrap();
        let after = catalog_at(&registry, &base).unwrap();
        assert_eq!(after.created_order["改名"], before.created_order["先"]);
        assert!(!after.created_order.contains_key("先"));
        // Old catalogs do not contain creation metadata; reading must stay compatible.
        let legacy: Catalog = serde_json::from_str(r#"{"tags":["旧"],"pending":null}"#).unwrap();
        assert!(legacy.created_order.is_empty());
    }
    #[test]
    fn rename_updates_all_kinds_without_touching_trash_body_or_registration() {
        let dir = tempfile::tempdir().unwrap();
        let base = dir.path().join("vault");
        let registry = dir.path().join("catalog.json");
        let paths: Vec<_> = [
            "note.md",
            "QA/a.md",
            "Terms/a.md",
            "Recipes/a.md",
            "tags/仕事/a.md",
            "Archive/a.md",
        ]
        .iter()
        .map(|r| fixture(&base, r))
        .collect();
        let trash = fixture(&base, "Trash/a.md");
        let asset = fixture(&base, "assets/attachment.md");
        let before = std::fs::read_to_string(&paths[0]).unwrap();
        let result = change_at(&registry, &base, "仕事", Some("調査")).unwrap();
        assert_eq!(result.changed, 6);
        assert!(result.failed.is_empty());
        for path in paths {
            let after = std::fs::read_to_string(path).unwrap();
            assert_eq!(
                logic::split_frontmatter(&after).1,
                logic::split_frontmatter(&before).1
            );
            assert_eq!(tags_in(&after), vec!["shortcut", "調査"]);
            assert!(after.contains("window: { x: 10, y: 20, width: 300, height: 400 }"));
        }
        assert_eq!(std::fs::read_to_string(trash).unwrap(), before);
        assert_eq!(std::fs::read_to_string(asset).unwrap(), before);
        let view = catalog_at(&registry, &base).unwrap();
        assert!(view.tags.contains(&"調査".into()));
        assert!(!view.tags.contains(&"仕事".into()));
    }
    #[test]
    fn partial_rename_can_resume_after_restart_without_merging_another_tag() {
        let dir = tempfile::tempdir().unwrap();
        let base = dir.path().join("vault");
        let registry = dir.path().join("catalog.json");
        let first = fixture(&base, "first.md").to_string_lossy().to_string();
        let second = base.join("second.md").to_string_lossy().to_string();
        let pending = Pending {
            old: "仕事".into(),
            new: Some("調査".into()),
            targets: vec![first, second],
            completed: BTreeSet::new(),
        };
        let mut state = Registry::default();
        state.vaults.insert(
            vault_key(&base),
            Catalog {
                tags: BTreeSet::from(["仕事".into()]),
                created_order: BTreeMap::new(),
                pending: Some(pending),
                interrupted: Vec::new(),
            },
        );
        write_registry(&registry, &state).unwrap();
        let partial = change_at(&registry, &base, "仕事", Some("調査")).unwrap();
        assert_eq!(partial.changed, 1);
        assert_eq!(partial.failed.len(), 1);
        assert!(read_registry(&registry).unwrap().vaults[&vault_key(&base)]
            .pending
            .is_some());
        assert!(change_at(&registry, &base, "仕事", None).is_err());
        // A completed path can be changed externally, and new matches can
        // appear while this operation is pending.
        fixture(&base, "first.md");
        let third = fixture(&base, "third.md");
        fixture(&base, "second.md");
        let resumed = change_at(&registry, &base, "仕事", Some("調査")).unwrap();
        assert_eq!(resumed.changed, 3);
        assert!(!tags_in(&std::fs::read_to_string(third).unwrap()).contains(&"仕事".into()));
        assert!(resumed.failed.is_empty());
        assert!(read_registry(&registry).unwrap().vaults[&vault_key(&base)]
            .pending
            .is_none());
    }
    #[test]
    fn moved_unresolved_target_can_be_stopped_without_false_success_or_rollback() {
        let dir = tempfile::tempdir().unwrap();
        let base = dir.path().join("vault");
        let registry = dir.path().join("catalog.json");
        let path = fixture(&base, "old.md");
        catalog_at(&registry, &base).unwrap();
        let mut state = read_registry(&registry).unwrap();
        state.vaults.get_mut(&vault_key(&base)).unwrap().pending = Some(Pending {
            old: "仕事".into(), new: Some("調査".into()),
            targets: vec![path.to_string_lossy().into()], completed: BTreeSet::new(),
        });
        write_registry(&registry, &state).unwrap();
        std::fs::rename(path, base.join("moved.md")).unwrap();
        assert!(!change_at(&registry, &base, "仕事", Some("調査")).unwrap().failed.is_empty());
        stop_at(&registry, &base).unwrap();
        let saved = read_registry(&registry).unwrap();
        let catalog = &saved.vaults[&vault_key(&base)];
        assert!(catalog.pending.is_none());
        assert_eq!(catalog.interrupted.len(), 1);
        assert_eq!(catalog.interrupted[0].completed.len(), 1);
        assert!(tags_in(&std::fs::read_to_string(base.join("moved.md")).unwrap()).contains(&"調査".into()));
        create_at(&registry, &base, "別の作業").unwrap();
    }
    #[test]
    fn stale_body_saves_cannot_restore_deleted_or_renamed_tags() {
        let old = "---\ntags: [仕事, shortcut]\n---\n本文";
        let renamed = "---\ntags: [調査, shortcut]\n---\n本文";
        let incoming = logic::split_frontmatter(old).0;
        assert_eq!(
            tags_in(&preserve_saved_tags(renamed, incoming)),
            vec!["調査", "shortcut"]
        );
        let deleted = "---\ntags: []\n---\ntags: [仕事]";
        assert!(tags_in(&preserve_saved_tags(deleted, incoming)).is_empty());
    }
    #[test]
    fn reserved_names_bad_names_collisions_and_corrupt_registry_fail_closed() {
        for tag in [
            "",
            "  ",
            "shortcut",
            "QA",
            "recipe",
            "link",
            "すべて\n",
            "a,b",
            "[a]",
        ] {
            assert!(validate(tag).is_err(), "{tag}");
        }
        let dir = tempfile::tempdir().unwrap();
        let base = dir.path().join("vault");
        let registry = dir.path().join("catalog.json");
        fixture(&base, "note.md");
        create_at(&registry, &base, "調査").unwrap();
        assert!(change_at(&registry, &base, "仕事", Some("調査")).is_err());
        std::fs::write(&registry, "broken").unwrap();
        assert!(create_at(&registry, &base, "旅行").is_err());
        assert_eq!(std::fs::read_to_string(&registry).unwrap(), "broken");
    }
    #[test]
    fn foreign_paths_and_missing_sources_are_not_reported_as_success() {
        let dir = tempfile::tempdir().unwrap();
        let base = dir.path().join("vault");
        fixture(&base, "note.md");
        let other = fixture(dir.path(), "foreign.md");
        assert!(update_one(&base, &other.to_string_lossy(), "仕事", None).is_err());
        assert!(update_one(
            &base,
            &base.join("missing.md").to_string_lossy(),
            "仕事",
            None
        )
        .is_err());
    }
}
