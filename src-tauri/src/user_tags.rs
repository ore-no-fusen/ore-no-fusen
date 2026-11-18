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
    #[serde(default)]
    archive_moved: BTreeSet<String>,
    #[serde(default)]
    archive_moving: Option<ArchiveMove>,
    #[serde(default)]
    folder_expected: bool,
    #[serde(default)]
    folder_moving: Option<ArchiveMove>,
}
#[derive(Clone, Serialize, Deserialize)]
struct ArchiveMove {
    source: String,
    destination_name: String,
    before_hash: String,
    after_hash: String,
    assets: Vec<AssetMove>,
}
#[derive(Clone, Serialize, Deserialize)]
struct AssetMove {
    from: String,
    to: String,
    hash: String,
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
fn optional_metadata(path: &Path) -> Result<Option<std::fs::Metadata>, String> {
    match std::fs::symlink_metadata(path) {
        Ok(meta) => Ok(Some(meta)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("保存先を確認できません: {}: {error}", path.display())),
    }
}
fn is_link_or_reparse(meta: &std::fs::Metadata) -> bool {
    if meta.file_type().is_symlink() { return true; }
    #[cfg(windows)] { use std::os::windows::fs::MetadataExt; if meta.file_attributes() & 0x400 != 0 { return true; } }
    false
}

fn note_hash(path: &Path) -> Result<String, String> {
    use sha2::{Digest, Sha256};
    use std::io::Read;
    let mut file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 65536];
    loop { let len = file.read(&mut buffer).map_err(|e| e.to_string())?; if len == 0 { break; } hasher.update(&buffer[..len]); }
    Ok(format!("{:x}", hasher.finalize()))
}

fn files_equal(first: &Path, second: &Path) -> Result<bool, String> {
    use std::io::Read;
    let mut a = std::fs::File::open(first).map_err(|e| e.to_string())?;
    let mut b = std::fs::File::open(second).map_err(|e| e.to_string())?;
    if a.metadata().map_err(|e| e.to_string())?.len() != b.metadata().map_err(|e| e.to_string())?.len() { return Ok(false); }
    let mut one = [0u8; 65536];
    let mut two = [0u8; 65536];
    loop {
        let len = a.read(&mut one).map_err(|e| e.to_string())?;
        let other = b.read(&mut two).map_err(|e| e.to_string())?;
        if len != other || one[..len] != two[..other] { return Ok(false); }
        if len == 0 { return Ok(true); }
    }
}

// Restrict directory operations to a single literal child under the vault's tags folder.
fn checked_tag_folder(base: &Path, tag: &str) -> Result<PathBuf, String> {
    use std::path::Component;
    let mut components = Path::new(tag).components();
    if !matches!(components.next(), Some(Component::Normal(_))) || components.next().is_some()
        || tag.chars().any(|c| "\\/:*?<>|".contains(c)) || tag.ends_with('.') || tag.ends_with(' ') {
        return Err("このタグ名は保管フォルダーの名前に使えません".into());
    }
    let root = base.join("tags");
    if let Some(meta) = optional_metadata(&root)? {
        if is_link_or_reparse(&meta) || !meta.is_dir() { return Err("保管フォルダーを安全に確認できません".into()); }
    }
    let folder = root.join(tag);
    if let Some(meta) = optional_metadata(&folder)? {
        if is_link_or_reparse(&meta) || !meta.is_dir() { return Err("タグの保管先が通常のフォルダーではありません".into()); }
    }
    Ok(folder)
}

// Detect all path collisions before changing notes. Never follow links or overwrite files.
fn check_merge_tree(source: &Path, destination: &Path, in_assets: bool) -> Result<(), String> {
    let source_meta = std::fs::symlink_metadata(source).map_err(|e| e.to_string())?;
    if is_link_or_reparse(&source_meta) || !source_meta.is_dir() { return Err("保管フォルダーが通常のフォルダーではありません".into()); }
    if let Some(meta) = optional_metadata(destination)? {
        if is_link_or_reparse(&meta) || !meta.is_dir() { return Err(format!("移動先がフォルダーではありません: {}", destination.display())); }
    }
    for entry in std::fs::read_dir(source).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let meta = std::fs::symlink_metadata(entry.path()).map_err(|e| e.to_string())?;
        let target = destination.join(entry.file_name());
        if is_link_or_reparse(&meta) { return Err(format!("リンクを含むため保管フォルダーを変更できません: {}", entry.path().display())); }
        if meta.is_dir() { check_merge_tree(&entry.path(), &target, in_assets || entry.file_name().to_string_lossy().eq_ignore_ascii_case("assets"))?; }
        else if !meta.is_file() { return Err("移動できない項目があります".into()); }
        else if optional_metadata(&target)?.is_some() && !in_assets && !entry.path().extension().is_some_and(|ext| ext.eq_ignore_ascii_case("md")) { return Err(format!("同名の添付があるため上書きせず停止しました: {}", target.display())); }
    }
    Ok(())
}

fn safe_leaf(name: &str) -> bool {
    let mut components = Path::new(name).components();
    matches!(components.next(), Some(std::path::Component::Normal(_))) && components.next().is_none() && !name.chars().any(|c| "\\/:*?<>|".contains(c))
}

fn available_filename(destination: &Path) -> Result<PathBuf, String> {
    if optional_metadata(destination)?.is_none() { return Ok(destination.to_path_buf()); }
    let parent = destination.parent().ok_or("移動先がありません")?;
    let stem = destination.file_stem().and_then(|x| x.to_str()).ok_or("ファイル名を確認できません")?;
    let extension = destination.extension().and_then(|x| x.to_str());
    for index in 2..=10000 {
        let name = match extension { Some(ext) => format!("{stem}（{index}）.{ext}"), None => format!("{stem}（{index}）") };
        let candidate = parent.join(name);
        if optional_metadata(&candidate)?.is_none() { return Ok(candidate); }
    }
    Err("空いているファイル名がありません".into())
}

// On Windows MoveFileW never replaces an existing destination and moves each
// file atomically on the same volume. Non-Windows fails closed if linking fails.
fn move_without_overwriting(source: &Path, destination: &Path) -> Result<(), String> {
    #[cfg(windows)] {
        use std::os::windows::ffi::OsStrExt;
        use windows::{core::PCWSTR, Win32::Storage::FileSystem::MoveFileW};
        let from: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
        let to: Vec<u16> = destination.as_os_str().encode_wide().chain(Some(0)).collect();
        unsafe { MoveFileW(PCWSTR(from.as_ptr()), PCWSTR(to.as_ptr())) }.map_err(|e| format!("上書きせず移動を中断しました: {e}"))
    }
    #[cfg(not(windows))] {
        std::fs::hard_link(source, destination).map_err(|e| format!("上書きせず移動を中断しました: {e}"))?;
        std::fs::remove_file(source).map_err(|e| format!("元ファイルを保ったまま中断しました: {e}"))
    }
}

// Only special-case note movement when same-named assets actually collide.
fn has_asset_collisions(source: &Path, destination: &Path, in_assets: bool) -> Result<bool, String> {
    for entry in std::fs::read_dir(source).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let meta = std::fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
        if is_link_or_reparse(&meta) { return Err("保管フォルダーにリンクがあります".into()); }
        let target = destination.join(entry.file_name());
        if meta.is_dir() {
            if has_asset_collisions(&path, &target, in_assets || entry.file_name().to_string_lossy().eq_ignore_ascii_case("assets"))? { return Ok(true); }
        } else if in_assets {
            if let Some(target_meta) = optional_metadata(&target)? {
                if is_link_or_reparse(&target_meta) || !target_meta.is_file() { return Err("同名の添付が通常のファイルではありません".into()); }
                return Ok(true);
            }
        }
    }
    Ok(false)
}
fn folder_notes_for_asset_merge(source: &Path) -> Result<Vec<PathBuf>, String> {
    let mut notes = Vec::new();
    for entry in std::fs::read_dir(source).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let meta = std::fs::symlink_metadata(entry.path()).map_err(|e| e.to_string())?;
        if is_link_or_reparse(&meta) { return Err("保管フォルダーにリンクがあります".into()); }
        if meta.is_dir() && entry.file_name().to_string_lossy().eq_ignore_ascii_case("assets") { continue; }
        if meta.is_file() && entry.path().extension().is_some_and(|ext| ext.eq_ignore_ascii_case("md")) {
            archive_assets(&entry.path())?;
            notes.push(entry.path());
        } else { return Err("画像の衝突時に扱えない項目があるため、保管先を変更しません".into()); }
    }
    notes.sort();
    Ok(notes)
}

fn merge_archive_tree(source: &Path, destination: &Path, in_assets: bool) -> Result<(), String> {
    check_merge_tree(source, destination, in_assets)?;
    if !destination.exists() { std::fs::create_dir(destination).map_err(|e| e.to_string())?; }
    for entry in std::fs::read_dir(source).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let target = destination.join(entry.file_name());
        let meta = std::fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
        if is_link_or_reparse(&meta) { return Err("保管フォルダーにリンクがあります".into()); }
        if meta.is_dir() { merge_archive_tree(&path, &target, in_assets || entry.file_name().to_string_lossy().eq_ignore_ascii_case("assets"))?; }
        else if meta.is_file() {
            let target = available_filename(&target)?;
            move_without_overwriting(&path, &target)?;
        } else { return Err("移動できない項目があります".into()); }
    }
    std::fs::remove_dir(source).map_err(|e| e.to_string())
}

// Only notes directly in the removed tag's own folder move to Archive.
// Unrelated notes and shared assets are left in their original location.
fn archive_assets(note: &Path) -> Result<Vec<PathBuf>, String> {
    let content = std::fs::read_to_string(note).map_err(|e| e.to_string())?;
    let lower = content.to_ascii_lowercase();
    if content.contains("[[") || ["<img", "<video", "<audio", "<source", "<a "].iter().any(|part| lower.contains(part)) {
        return Err("付箋に対応未確認のリンクがあります。保管場所は変更しません".into());
    }
    let reference = regex::Regex::new(r"(?m)^\s*\[[^\]]+\]:\s*\S|!?\[[^\]]+\]\[[^\]]*\]").unwrap();
    if reference.is_match(&content) { return Err("付箋に対応未確認の参照形式があります。保管場所は変更しません".into()); }
    let re = regex::Regex::new(r"!?\[[^\]]*\]\(([^)]+)\)").unwrap();
    let spans: Vec<_> = re.find_iter(&content).map(|m| (m.start(), m.end())).collect();
    if content.match_indices("assets/").any(|(i, _)| !spans.iter().any(|(start, end)| *start <= i && i < *end)) {
        return Err("付箋に対応未確認の添付参照があります。保管場所は変更しません".into());
    }
    let mut paths = BTreeSet::new();
    for capture in re.captures_iter(&content) {
        let raw = &capture[1];
        if raw.starts_with("https://") || raw.starts_with("http://") || raw.starts_with("mailto:") || raw.starts_with('#') { continue; }
        if !raw.starts_with("assets/") || raw.contains('\\') || raw.contains(':') { return Err("付箋に対応未確認の相対リンクがあります。保管場所は変更しません".into()); }
        let relative = PathBuf::from(raw);
        if relative.components().any(|c| !matches!(c, std::path::Component::Normal(_))) { return Err("画像の保存先を安全に確認できません".into()); }
        let mut source = note.parent().ok_or("保管元がありません")?.to_path_buf();
        for component in relative.components() {
            source.push(component);
            let meta = optional_metadata(&source)?.ok_or_else(|| format!("添付ファイルが見つかりません: {}", source.display()))?;
            if is_link_or_reparse(&meta) { return Err("添付ファイルにリンクがあるため移動できません".into()); }
        }
        if !std::fs::metadata(&source).map_err(|e| e.to_string())?.is_file() { return Err("添付ファイルが通常のファイルではありません".into()); }
        paths.insert(relative);
    }
    Ok(paths.into_iter().collect())
}

fn ensure_safe_child_dirs(root: &Path, relative: &Path) -> Result<(), String> {
    if optional_metadata(root)?.is_none() { std::fs::create_dir(root).map_err(|e| e.to_string())?; }
    let root_meta = optional_metadata(root)?.ok_or("保存先がありません")?;
    if is_link_or_reparse(&root_meta) || !root_meta.is_dir() { return Err("保存先が通常のフォルダーではありません".into()); }
    let mut current = root.to_path_buf();
    for part in relative.components() {
        if !matches!(part, std::path::Component::Normal(_)) { return Err("添付の保存先が不正です".into()); }
        current.push(part);
        match optional_metadata(&current)? {
            Some(meta) if is_link_or_reparse(&meta) || !meta.is_dir() => return Err("添付の保存先が通常のフォルダーではありません".into()),
            Some(_) => (),
            None => std::fs::create_dir(&current).map_err(|e| e.to_string())?,
        }
    }
    Ok(())
}

fn is_safe_asset_path(path: &Path) -> bool {
    let mut parts = path.components();
    matches!(parts.next(), Some(std::path::Component::Normal(x)) if x == "assets")
        && parts.all(|part| matches!(part, std::path::Component::Normal(_)))
}

fn checked_source_asset(root: &Path, relative: &Path) -> Result<PathBuf, String> {
    if !is_safe_asset_path(relative) { return Err("元の添付パスが不正です".into()); }
    let mut current = root.to_path_buf();
    for part in relative.components() {
        current.push(part);
        let meta = optional_metadata(&current)?.ok_or("元の添付がありません")?;
        if is_link_or_reparse(&meta) { return Err("元の添付にリンクがあるため移動できません".into()); }
    }
    Ok(current)
}

fn copy_asset_without_overwrite(source: &Path, root: &Path, relative: &Path, hash: &str) -> Result<(), String> {
    use std::io::Write;
    if !is_safe_asset_path(relative) { return Err("添付の保存先が不正です".into()); }
    ensure_safe_child_dirs(root, relative.parent().ok_or("添付の親フォルダーがありません")?)?;
    let target = root.join(relative);
    if let Some(meta) = optional_metadata(&target)? {
        if is_link_or_reparse(&meta) || !meta.is_file() || note_hash(&target)? != hash { return Err(format!("添付の保存先が変わりました: {}", target.display())); }
        return Ok(());
    }
    let meta = optional_metadata(source)?.ok_or("元の添付がありません")?;
    if is_link_or_reparse(&meta) || !meta.is_file() || note_hash(source)? != hash { return Err("元の添付が変更されました".into()); }
    let mut out = std::fs::OpenOptions::new().write(true).create_new(true).open(&target).map_err(|e| e.to_string())?;
    let result = (|| -> Result<(), String> { let mut input = std::fs::File::open(source).map_err(|e| e.to_string())?; std::io::copy(&mut input, &mut out).map_err(|e| e.to_string())?; out.flush().map_err(|e| e.to_string())?; out.sync_all().map_err(|e| e.to_string())?; Ok(()) })();
    if let Err(error) = result { drop(out); let _ = std::fs::remove_file(&target); return Err(error); }
    if note_hash(&target)? != hash || note_hash(source)? != hash { return Err("添付のコピー中に内容が変わりました".into()); }
    Ok(())
}

fn rewrite_asset_links(content: &str, assets: &[AssetMove]) -> String {
    let re = regex::Regex::new(r"!?\[[^\]]*\]\(([^)]+)\)").unwrap();
    let mut result = String::with_capacity(content.len());
    let mut previous = 0;
    for capture in re.captures_iter(content) {
        let target = capture.get(1).unwrap();
        if let Some(asset) = assets.iter().find(|asset| asset.from == target.as_str() && asset.from != asset.to) {
            result.push_str(&content[previous..target.start()]);
            result.push_str(&asset.to);
            previous = target.end();
        }
    }
    result.push_str(&content[previous..]);
    result
}

fn hash_text(content: &str) -> String {
    use sha2::{Digest, Sha256};
    format!("{:x}", Sha256::digest(content.as_bytes()))
}

fn check_note_destination(destination_dir: &Path, source: &Path) -> Result<(), String> {
    let meta = optional_metadata(source)?.ok_or("移動する付箋が見つかりません")?;
    if is_link_or_reparse(&meta) || !meta.is_file() { return Err("保管した付箋が通常のファイルではありません".into()); }
    if let Some(meta) = optional_metadata(destination_dir)? {
        if is_link_or_reparse(&meta) || !meta.is_dir() { return Err("移動先が通常のフォルダーではありません".into()); }
    }
    for relative in archive_assets(source)? {
        let mut parent = destination_dir.to_path_buf();
        for part in relative.parent().ok_or("添付の親がありません")?.components() {
            parent.push(part);
            if let Some(meta) = optional_metadata(&parent)? {
                if is_link_or_reparse(&meta) || !meta.is_dir() { return Err("移動先の添付保存先を安全に確認できません".into()); }
            }
        }
    }
    Ok(())
}

fn prepare_note_move(destination_dir: &Path, source: &Path) -> Result<ArchiveMove, String> {
    check_note_destination(destination_dir, source)?;
    let archive = destination_dir.to_path_buf();
    let source_dir = source.parent().ok_or("保管元がありません")?;
    let destination = available_filename(&archive.join(source.file_name().ok_or("付箋名がありません")?))?;
    let content = std::fs::read_to_string(source).map_err(|e| e.to_string())?;
    let mut assets = Vec::new();
    for relative in archive_assets(source)? {
        let original = source_dir.join(&relative);
        let hash = note_hash(&original)?;
        let mut target = archive.join(&relative);
        if let Some(meta) = optional_metadata(&target)? {
            if is_link_or_reparse(&meta) || !meta.is_file() { return Err("同名の添付が通常のファイルではありません".into()); }
            if !files_equal(&original, &target)? {
                let parent = relative.parent().ok_or("添付の親がありません")?;
                let stem = relative.file_stem().and_then(|x| x.to_str()).ok_or("添付名が不正です")?;
                let extension = relative.extension().and_then(|x| x.to_str());
                let mut chosen = None;
                for n in 2..=10000 {
                    let name = match extension { Some(ext) => format!("{stem}（{n}）.{ext}"), None => format!("{stem}（{n}）") };
                    let rel = parent.join(name);
                    if optional_metadata(&archive.join(&rel))?.is_none() && optional_metadata(&source_dir.join(&rel))?.is_none() && !assets.iter().any(|a: &AssetMove| Path::new(&a.to) == rel) { chosen = Some(rel); break; }
                }
                target = archive.join(chosen.ok_or("空いている添付名がありません")?);
            }
        }
        let to = target.strip_prefix(&archive).map_err(|e| e.to_string())?.to_string_lossy().replace('\\', "/");
        let from = relative.to_string_lossy().replace('\\', "/");
        assets.push(AssetMove { from, to, hash });
    }
    let rewritten = rewrite_asset_links(&content, &assets);
    Ok(ArchiveMove { source: source.to_string_lossy().into_owned(), destination_name: destination.file_name().ok_or("付箋名がありません")?.to_string_lossy().into_owned(), before_hash: hash_text(&content), after_hash: hash_text(&rewritten), assets })
}

fn move_note_to_folder(destination_dir: &Path, source: &Path, plan: &ArchiveMove) -> Result<(), String> {
    if !safe_leaf(&plan.destination_name) || plan.source != source.to_string_lossy() { return Err("未完了の移動記録が不正です".into()); }
    let archive = destination_dir.to_path_buf();
    let source_dir = source.parent().ok_or("保管元がありません")?;
    let target = archive.join(&plan.destination_name);
    if optional_metadata(source)?.is_none() {
        let meta = optional_metadata(&target)?.ok_or("移動途中の付箋が見つかりません")?;
        if is_link_or_reparse(&meta) || !meta.is_file() || note_hash(&target)? != plan.after_hash { return Err("移動途中の付箋を確認できません".into()); }
        for asset in &plan.assets {
            let rel = Path::new(&asset.to);
            let path = archive.join(rel);
            let asset_meta = optional_metadata(&path)?.ok_or("移動途中の添付がありません")?;
            if !is_safe_asset_path(rel) || is_link_or_reparse(&asset_meta) || !asset_meta.is_file() || note_hash(&path)? != asset.hash { return Err("移動途中の添付を確認できません".into()); }
        }
        return Ok(());
    }
    check_note_destination(&archive, source)?;
    ensure_safe_child_dirs(&archive, Path::new(""))?;
    let current = std::fs::read_to_string(source).map_err(|e| e.to_string())?;
    let current_hash = hash_text(&current);
    if current_hash != plan.before_hash && current_hash != plan.after_hash { return Err("移動途中に付箋が変更されました".into()); }
    for asset in &plan.assets {
        let old = Path::new(&asset.from);
        let new = Path::new(&asset.to);
        if !is_safe_asset_path(old) || !is_safe_asset_path(new) { return Err("添付の移動記録が不正です".into()); }
        let original = checked_source_asset(source_dir, old)?;
        copy_asset_without_overwrite(&original, &archive, new, &asset.hash)?;
        if old != new { copy_asset_without_overwrite(&original, source_dir, new, &asset.hash)?; }
    }
    if current_hash == plan.before_hash {
        let rewritten = rewrite_asset_links(&current, &plan.assets);
        if hash_text(&rewritten) != plan.after_hash { return Err("付箋の移動計画が一致しません".into()); }
        if rewritten != current { storage::write_note_if_unchanged(&source.to_string_lossy(), &current, &rewritten)?; }
    }
    move_without_overwriting(source, &target)?;
    Ok(())
}

fn change_at_with_merge(file: &Path, base: &Path, old: &str, new: Option<&str>, allow_merge: bool) -> Result<TagResult, String> {
    let old = validate(old)?;
    let new = new.map(validate).transpose()?;
    if new.as_ref() == Some(&old) {
        return Err("別のタグ名を入力してください".into());
    }
    let folder_pair = if let Some(new_tag) = new.as_deref() {
        let source = checked_tag_folder(base, &old)?;
        let destination = checked_tag_folder(base, new_tag)?;
        if optional_metadata(&source)?.is_some() {
            check_merge_tree(&source, &destination, false)?;
            if has_asset_collisions(&source, &destination, false)? { folder_notes_for_asset_merge(&source)?; }
        }
        Some((source, destination))
    } else { None };
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
        if !allow_merge && new.as_ref().is_some_and(|n| catalog.tags.contains(n)) {
            return Err("同じ名前のタグがあります。統合する場合は確認してください".into());
        }
        if new.is_none() {
            let folder = checked_tag_folder(base, &old)?;
            for (path, tags) in &notes {
                let path = Path::new(path);
                if path.parent() == Some(folder.as_path()) && tags.contains(&old) { check_note_destination(&base.join("Archive"), path)?; }
            }
        }
        catalog.pending = Some(Pending {
            old: old.clone(),
            new: new.clone(),
            targets: notes
                .into_iter()
                .filter(|(_, t)| t.contains(&old))
                .map(|(p, _)| p)
                .collect(),
            completed: BTreeSet::new(), archive_moved: BTreeSet::new(), archive_moving: None,
            folder_expected: folder_pair.as_ref().is_some_and(|(source, _)| source.exists()), folder_moving: None,
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
    if failed.is_empty() && new.is_none() {
        let folder = checked_tag_folder(base, &old)?;
        for path in pending.targets.clone() {
            if Path::new(&path).parent() != Some(folder.as_path()) || pending.archive_moved.contains(&path) { continue; }
            if !failed.is_empty() { break; }
            let moving = if let Some(moving) = pending.archive_moving.clone() {
                if moving.source != path { failed.push("未完了の移動対象が一致しません".into()); break; }
                moving
            } else {
                let moving = prepare_note_move(&base.join("Archive"), Path::new(&path))?;
                pending.archive_moving = Some(moving.clone());
                registry.vaults.get_mut(&key).unwrap().pending = Some(pending.clone());
                write_registry(file, &registry)?;
                moving
            };
            if !safe_leaf(&moving.destination_name) { failed.push("未完了のArchive移動先が不正です".into()); break; }
            match move_note_to_folder(&base.join("Archive"), Path::new(&path), &moving) {
                Ok(()) => {
                    pending.archive_moved.insert(path);
                    pending.archive_moving = None;
                    registry.vaults.get_mut(&key).unwrap().pending = Some(pending.clone());
                    write_registry(file, &registry)?;
                }
                Err(error) => { failed.push(format!("Archive移動: {error}")); break; }
            }
        }
    }
    if failed.is_empty() {
        if let Some((source, destination)) = &folder_pair {
            if optional_metadata(source)?.is_some() {
                if pending.folder_moving.is_some() || has_asset_collisions(source, destination, false)? {
                    if let Some(moving) = pending.folder_moving.clone() {
                        let path = Path::new(&moving.source);
                        if path.parent() != Some(source.as_path()) { failed.push("未完了の保管付箋の場所が不正です".into()); }
                        else if let Err(error) = move_note_to_folder(destination, path, &moving) { failed.push(format!("保管付箋: {error}")); }
                        else { pending.folder_moving = None; registry.vaults.get_mut(&key).unwrap().pending = Some(pending.clone()); write_registry(file, &registry)?; }
                    }
                    if failed.is_empty() {
                        for path in folder_notes_for_asset_merge(source)? {
                            let moving = prepare_note_move(destination, &path)?;
                            pending.folder_moving = Some(moving.clone());
                            registry.vaults.get_mut(&key).unwrap().pending = Some(pending.clone());
                            write_registry(file, &registry)?;
                            if let Err(error) = move_note_to_folder(destination, &path, &moving) { failed.push(format!("保管付箋: {error}")); break; }
                            pending.folder_moving = None;
                            registry.vaults.get_mut(&key).unwrap().pending = Some(pending.clone());
                            write_registry(file, &registry)?;
                        }
                    }
                }
                if failed.is_empty() {
                    if let Err(error) = merge_archive_tree(source, destination, false) { failed.push(format!("保管フォルダー: {error}")); }
                    else { pending.folder_expected = false; registry.vaults.get_mut(&key).unwrap().pending = Some(pending.clone()); write_registry(file, &registry)?; }
                }
            } else if pending.folder_expected {
                failed.push("変更途中の保管フォルダーを確認できません。移動先と未完了記録を確認してください".into());
            }
        }
    }
    // Recheck after moving files as well: a concurrent writer may have restored
    // the old tag while the archive changes were running.
    if failed.is_empty() {
        for (path, tags) in scan(base)? {
            if tags.contains(&old) { failed.push(format!("{path}: 対象タグが再追加されました。再試行してください")); }
        }
    }
    if failed.is_empty() {
        let catalog = registry.vaults.get_mut(&key).unwrap();
        catalog.tags.remove(&old);
        let order = catalog.created_order.remove(&old);
        if let Some(new) = new {
            let already_exists = catalog.tags.contains(&new);
            catalog.tags.insert(new.clone());
            if !already_exists { if let Some(order) = order { catalog.created_order.insert(new, order); } }
        }
        catalog.pending = None;
        write_registry(file, &registry)?;
    }
    Ok(TagResult { changed, failed })
}
#[cfg(test)]
fn change_at(file: &Path, base: &Path, old: &str, new: Option<&str>) -> Result<TagResult, String> {
    change_at_with_merge(file, base, old, new, false)
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
    change_with_merge(app, old, new, false)
}
fn change_with_merge(app: &AppHandle, old: &str, new: Option<&str>, allow_merge: bool) -> Result<TagResult, String> {
    let state = app.state::<Mutex<AppState>>();
    let mut state = state.lock().unwrap_or_else(|p| p.into_inner());
    let base = state
        .base_path
        .clone()
        .or_else(|| state.folder_path.clone())
        .ok_or("保存先がありません")?;
    let result = {
        let _guard = lock().lock().unwrap_or_else(|p| p.into_inner());
        change_at_with_merge(&registry_path()?, Path::new(&base), old, new, allow_merge)
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
    merge_existing: Option<bool>,
) -> Result<TagResult, String> {
    change_with_merge(&app, &tag, Some(&name), merge_existing.unwrap_or(false))
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
    fn renamed_archive_folder_keeps_notes_assets_and_other_user_tags() {
        let dir = tempfile::tempdir().unwrap();
        let base = dir.path().join("vault");
        let registry = dir.path().join("catalog.json");
        let archived = base.join("tags/仕事/note.md");
        let assets = base.join("tags/仕事/assets");
        std::fs::create_dir_all(&assets).unwrap();
        std::fs::write(assets.join("photo.png"), b"image-content").unwrap();
        let content = "---\ntags: [仕事, 旅行]\n---\n本文 ![画像](assets/photo.png)";
        std::fs::write(&archived, content).unwrap();
        let result = change_at(&registry, &base, "仕事", Some("業務")).unwrap();
        assert!(result.failed.is_empty());
        assert!(!base.join("tags/仕事").exists());
        let moved = base.join("tags/業務/note.md");
        let raw = std::fs::read_to_string(&moved).unwrap();
        assert_eq!(tags_in(&raw), vec!["旅行", "業務"]);
        assert_eq!(logic::split_frontmatter(&raw).1, logic::split_frontmatter(content).1);
        assert_eq!(std::fs::read(base.join("tags/業務/assets/photo.png")).unwrap(), b"image-content");
        let summaries = storage::list_archived_notes(&base);
        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].location_name, "業務");
    }

    #[test]
    fn archive_folders_merge_without_overwriting_distinct_files() {
        let dir = tempfile::tempdir().unwrap();
        let base = dir.path().join("vault");
        let registry = dir.path().join("catalog.json");
        let old = fixture(&base, "tags/仕事/note.md");
        let other = fixture(&base, "tags/業務/other.md");
        std::fs::write(&other, "---\ntags: [旅行]\n---\n別の本文").unwrap();
        let old_before = std::fs::read(&old).unwrap();
        let other_before = std::fs::read(&other).unwrap();
        let result = change_at(&registry, &base, "仕事", Some("業務")).unwrap();
        assert!(result.failed.is_empty());
        assert!(!old.exists());
        let merged = std::fs::read_to_string(base.join("tags/業務/note.md")).unwrap();
        assert_eq!(tags_in(&merged), vec!["shortcut", "業務"]);
        assert_eq!(std::fs::read(&other).unwrap(), other_before);
        assert!(!old_before.is_empty());
    }

    #[test]
    fn deleting_tag_moves_only_its_archived_notes_to_archive_and_preserves_other_tags() {
        let dir = tempfile::tempdir().unwrap();
        let base = dir.path().join("vault");
        let registry = dir.path().join("catalog.json");
        let selected = base.join("tags/仕事/selected.md");
        let unrelated = base.join("tags/仕事/unrelated.md");
        std::fs::create_dir_all(base.join("tags/仕事/assets")).unwrap();
        std::fs::write(base.join("tags/仕事/assets/photo.png"), b"photo").unwrap();
        let source = "---\ntags: [仕事, 旅行]\n---\n本文 ![画像](assets/photo.png)";
        std::fs::write(&selected, source).unwrap();
        let unrelated_content = "---\ntags: [旅行]\n---\n他の付箋";
        std::fs::write(&unrelated, unrelated_content).unwrap();
        let result = change_at(&registry, &base, "仕事", None).unwrap();
        assert!(result.failed.is_empty());
        assert!(!selected.exists());
        let archived = base.join("Archive/selected.md");
        let updated = std::fs::read_to_string(archived).unwrap();
        assert_eq!(tags_in(&updated), vec!["旅行"]);
        assert!(updated.contains("本文"));
        let asset_rel = updated.split("![画像](").nth(1).unwrap().split(')').next().unwrap();
        assert_eq!(std::fs::read(base.join("Archive").join(asset_rel)).unwrap(), b"photo");
        assert_eq!(std::fs::read(&unrelated).unwrap(), unrelated_content.as_bytes());
        assert!(base.join("tags/仕事/assets/photo.png").exists());
        let restored = storage::restore_archived_note(&base, &base.join("Archive/selected.md")).unwrap();
        let restored_content = std::fs::read_to_string(&restored).unwrap();
        assert_eq!(tags_in(&restored_content), vec!["旅行"]);
        let restored_asset = restored_content.split("![画像](").nth(1).unwrap().split(')').next().unwrap();
        assert_eq!(std::fs::read(base.join(restored_asset)).unwrap(), b"photo");
    }

    #[test]
    fn deleting_tag_renames_a_colliding_note_and_preserves_both() {
        let dir = tempfile::tempdir().unwrap();
        let base = dir.path().join("vault");
        let registry = dir.path().join("catalog.json");
        let selected = fixture(&base, "tags/仕事/note.md");
        std::fs::write(&selected, "---\ntags: [仕事, 旅行]\n---\n移動対象").unwrap();
        let other = fixture(&base, "Archive/note.md");
        std::fs::write(&other, "---\ntags: [旅行]\n---\n元からある付箋").unwrap();
        let before = std::fs::read(&other).unwrap();
        let result = change_at(&registry, &base, "仕事", None).unwrap();
        assert!(result.failed.is_empty());
        assert!(!selected.exists());
        assert_eq!(std::fs::read(&other).unwrap(), before);
        let renamed = std::fs::read_to_string(base.join("Archive/note（2）.md")).unwrap();
        assert_eq!(tags_in(&renamed), vec!["旅行"]);
        assert!(renamed.contains("移動対象"));
    }

    #[test]
    fn folder_merge_renames_a_colliding_note_and_preserves_both() {
        let dir = tempfile::tempdir().unwrap();
        let base = dir.path().join("vault");
        let registry = dir.path().join("catalog.json");
        let original = fixture(&base, "tags/仕事/note.md");
        let existing = fixture(&base, "tags/業務/note.md");
        std::fs::write(&existing, "---\ntags: [旅行]\n---\n変更先").unwrap();
        let first = std::fs::read(&original).unwrap();
        let second = std::fs::read(&existing).unwrap();
        let result = change_at(&registry, &base, "仕事", Some("業務")).unwrap();
        assert!(result.failed.is_empty());
        assert!(!original.exists());
        let renamed = std::fs::read_to_string(base.join("tags/業務/note（2）.md")).unwrap();
        assert_eq!(tags_in(&renamed), vec!["shortcut", "業務"]);
        assert_eq!(logic::split_frontmatter(&renamed).1, logic::split_frontmatter(std::str::from_utf8(&first).unwrap()).1);
        assert_eq!(std::fs::read(existing).unwrap(), second);
    }

    #[test]
    fn archive_image_conflict_preserves_both_and_unhandled_relative_link_stops() {
        let dir = tempfile::tempdir().unwrap();
        let base = dir.path().join("vault");
        let registry = dir.path().join("catalog.json");
        let note = fixture(&base, "tags/仕事/note.md");
        std::fs::create_dir_all(base.join("tags/仕事/assets")).unwrap();
        std::fs::create_dir_all(base.join("Archive/assets")).unwrap();
        std::fs::write(base.join("tags/仕事/assets/a.png"), b"old image").unwrap();
        std::fs::write(base.join("Archive/assets/a.png"), b"different image").unwrap();
        let result = change_at(&registry, &base, "仕事", None).unwrap();
        assert!(result.failed.is_empty());
        assert!(!note.exists());
        let archived = std::fs::read_to_string(base.join("Archive/note.md")).unwrap();
        assert!(archived.contains("(assets/a（2）.png)"));
        assert_eq!(std::fs::read(base.join("Archive/assets/a.png")).unwrap(), b"different image");
        assert_eq!(std::fs::read(base.join("Archive/assets/a（2）.png")).unwrap(), b"old image");
        let another = base.join("tags/仕事/second.md");
        let unhandled = "---\ntags: [仕事]\n---\n[別の文書](../secret.md)";
        std::fs::write(&another, unhandled).unwrap();
        assert!(change_at(&registry, &base, "仕事", None).is_err());
        assert_eq!(std::fs::read_to_string(&another).unwrap(), unhandled);
    }

    #[test]
    fn retry_after_tag_removed_moves_the_archived_note_without_losing_other_tag() {
        let dir = tempfile::tempdir().unwrap();
        let base = dir.path().join("vault");
        let registry = dir.path().join("catalog.json");
        let note = fixture(&base, "tags/仕事/note.md");
        let key = vault_key(&base);
        let path = note.to_string_lossy().to_string();
        let mut state = Registry::default();
        state.vaults.insert(key.clone(), Catalog {
            tags: BTreeSet::from(["仕事".into()]), created_order: BTreeMap::new(),
            pending: Some(Pending { old: "仕事".into(), new: None, targets: vec![path.clone()], completed: BTreeSet::from([path]), archive_moved: BTreeSet::new(), archive_moving: None, folder_expected: false, folder_moving: None }), interrupted: Vec::new(),
        });
        std::fs::write(&note, "---\ntags: [旅行]\n---\n安全な本文").unwrap();
        write_registry(&registry, &state).unwrap();
        let result = change_at(&registry, &base, "仕事", None).unwrap();
        assert!(result.failed.is_empty(), "{:?}", result.failed);
        assert!(!note.exists());
        let result = std::fs::read_to_string(base.join("Archive/note.md")).unwrap();
        assert_eq!(tags_in(&result), vec!["旅行"]);
        assert!(result.contains("安全な本文"));
        assert!(read_registry(&registry).unwrap().vaults[&key].pending.is_none());
    }

    #[test]
    fn retry_after_archive_move_checks_journal_and_never_loses_note() {
        let dir = tempfile::tempdir().unwrap();
        let base = dir.path().join("vault");
        let registry = dir.path().join("catalog.json");
        let old = base.join("tags/仕事/note.md");
        std::fs::create_dir_all(old.parent().unwrap()).unwrap();
        let target = base.join("Archive/note.md");
        std::fs::create_dir_all(target.parent().unwrap()).unwrap();
        std::fs::write(&target, "---\ntags: [旅行]\n---\n保管済み").unwrap();
        let path = old.to_string_lossy().to_string();
        let expected = note_hash(&target).unwrap();
        let key = vault_key(&base);
        let mut state = Registry::default();
        state.vaults.insert(key.clone(), Catalog { tags: BTreeSet::from(["仕事".into()]), created_order: BTreeMap::new(),
            pending: Some(Pending { old: "仕事".into(), new: None, targets: vec![path.clone()], completed: BTreeSet::from([path.clone()]), archive_moved: BTreeSet::new(), archive_moving: Some(ArchiveMove { source: path, destination_name: "note.md".into(), before_hash: expected.clone(), after_hash: expected, assets: vec![] }), folder_expected: false, folder_moving: None }), interrupted: Vec::new() });
        write_registry(&registry, &state).unwrap();
        let result = change_at(&registry, &base, "仕事", None).unwrap();
        assert!(result.failed.is_empty());
        assert!(target.exists());
        assert_eq!(tags_in(&std::fs::read_to_string(&target).unwrap()), vec!["旅行"]);
        assert!(read_registry(&registry).unwrap().vaults[&key].pending.is_none());
    }

    #[test]
    fn interrupted_folder_move_is_not_reported_as_complete_when_source_is_missing() {
        let dir = tempfile::tempdir().unwrap();
        let base = dir.path().join("vault");
        let registry = dir.path().join("catalog.json");
        std::fs::create_dir_all(base.join("tags/業務")).unwrap();
        let key = vault_key(&base);
        let mut state = Registry::default();
        state.vaults.insert(key.clone(), Catalog { tags: BTreeSet::from(["仕事".into()]), created_order: BTreeMap::new(),
            pending: Some(Pending { old: "仕事".into(), new: Some("業務".into()), targets: vec![], completed: BTreeSet::new(), archive_moved: BTreeSet::new(), archive_moving: None, folder_expected: true, folder_moving: None }), interrupted: Vec::new() });
        write_registry(&registry, &state).unwrap();
        let result = change_at(&registry, &base, "仕事", Some("業務")).unwrap();
        assert!(!result.failed.is_empty());
        assert!(read_registry(&registry).unwrap().vaults[&key].pending.is_some());
    }

    #[test]
    fn interrupted_archive_move_with_changed_destination_remains_pending() {
        let dir = tempfile::tempdir().unwrap();
        let base = dir.path().join("vault");
        let registry = dir.path().join("catalog.json");
        let old = base.join("tags/仕事/note.md");
        std::fs::create_dir_all(old.parent().unwrap()).unwrap();
        let target = base.join("Archive/note.md");
        std::fs::create_dir_all(target.parent().unwrap()).unwrap();
        std::fs::write(&target, "別の内容").unwrap();
        let path = old.to_string_lossy().to_string();
        let key = vault_key(&base);
        let mut state = Registry::default();
        state.vaults.insert(key.clone(), Catalog { tags: BTreeSet::from(["仕事".into()]), created_order: BTreeMap::new(),
            pending: Some(Pending { old: "仕事".into(), new: None, targets: vec![path.clone()], completed: BTreeSet::from([path.clone()]), archive_moved: BTreeSet::new(), archive_moving: Some(ArchiveMove { source: path, destination_name: "note.md".into(), before_hash: "different-hash".into(), after_hash: "different-hash".into(), assets: vec![] }), folder_expected: false, folder_moving: None }), interrupted: Vec::new() });
        write_registry(&registry, &state).unwrap();
        let result = change_at(&registry, &base, "仕事", None).unwrap();
        assert!(!result.failed.is_empty());
        assert_eq!(std::fs::read_to_string(target).unwrap(), "別の内容");
        assert!(read_registry(&registry).unwrap().vaults[&key].pending.is_some());
    }

    #[test]
    fn reference_style_attachment_stops_before_any_note_changes() {
        let dir = tempfile::tempdir().unwrap();
        let base = dir.path().join("vault");
        let registry = dir.path().join("catalog.json");
        let note = fixture(&base, "tags/仕事/note.md");
        let text = "---\ntags: [仕事]\n---\n![写真][pic]\n[pic]: assets/photo.png";
        std::fs::write(&note, text).unwrap();
        assert!(change_at(&registry, &base, "仕事", None).is_err());
        assert_eq!(std::fs::read_to_string(&note).unwrap(), text);
        assert!(!base.join("Archive/note.md").exists());
    }

    #[test]
    fn merge_existing_tag_requires_confirmation_and_preserves_two_tag_note() {
        let dir = tempfile::tempdir().unwrap();
        let base = dir.path().join("vault");
        let registry = dir.path().join("catalog.json");
        let source = fixture(&base, "tags/仕事/note.md");
        let target = fixture(&base, "tags/業務/other.md");
        std::fs::write(&source, "---\ntags: [仕事, 業務]\n---\n二つのタグの本文").unwrap();
        std::fs::write(&target, "---\ntags: [業務]\n---\n変更先の本文").unwrap();
        let before_source = std::fs::read(&source).unwrap();
        let before_target = std::fs::read(&target).unwrap();
        assert!(change_at(&registry, &base, "仕事", Some("業務")).is_err());
        assert_eq!(std::fs::read(&source).unwrap(), before_source);
        assert_eq!(std::fs::read(&target).unwrap(), before_target);
        let result = change_at_with_merge(&registry, &base, "仕事", Some("業務"), true).unwrap();
        assert!(result.failed.is_empty());
        let merged = std::fs::read_to_string(base.join("tags/業務/note.md")).unwrap();
        assert_eq!(tags_in(&merged), vec!["業務"]);
        assert!(merged.contains("二つのタグの本文"));
        assert_eq!(std::fs::read(target).unwrap(), before_target);
        let view = catalog_at(&registry, &base).unwrap();
        assert!(!view.tags.contains(&"仕事".into()));
        assert_eq!(view.counts["業務"], 2);
    }

    #[test]
    fn merging_folders_with_same_note_and_different_same_named_images_preserves_all() {
        let dir = tempfile::tempdir().unwrap();
        let base = dir.path().join("vault");
        let registry = dir.path().join("catalog.json");
        for folder in ["仕事", "業務"] { std::fs::create_dir_all(base.join("tags").join(folder).join("assets")).unwrap(); }
        std::fs::write(base.join("tags/仕事/assets/photo.png"), b"source image").unwrap();
        std::fs::write(base.join("tags/業務/assets/photo.png"), b"destination image").unwrap();
        std::fs::write(base.join("tags/仕事/note.md"), "---\ntags: [仕事, 業務]\n---\n仕事本文 ![画像](assets/photo.png)").unwrap();
        std::fs::write(base.join("tags/仕事/second.md"), "---\ntags: [仕事]\n---\n二枚目 ![画像](assets/photo.png)").unwrap();
        let existing = base.join("tags/業務/note.md");
        let existing_content = "---\ntags: [業務]\n---\n業務本文 ![画像](assets/photo.png)";
        std::fs::write(&existing, existing_content).unwrap();
        let result = change_at_with_merge(&registry, &base, "仕事", Some("業務"), true).unwrap();
        assert!(result.failed.is_empty(), "{:?}", result.failed);
        assert!(!base.join("tags/仕事").exists());
        assert_eq!(std::fs::read_to_string(&existing).unwrap(), existing_content);
        assert_eq!(std::fs::read(base.join("tags/業務/assets/photo.png")).unwrap(), b"destination image");
        for name in ["note（2）.md", "second.md"] {
            let text = std::fs::read_to_string(base.join("tags/業務").join(name)).unwrap();
            assert_eq!(tags_in(&text), vec!["業務"]);
            let image = text.split("![画像](").nth(1).unwrap().split(')').next().unwrap();
            assert_ne!(image, "assets/photo.png");
            assert_eq!(std::fs::read(base.join("tags/業務").join(image)).unwrap(), b"source image");
        }
    }

    #[test]
    fn archive_collision_skips_existing_two_and_keeps_each_image_reference() {
        let dir = tempfile::tempdir().unwrap();
        let base = dir.path().join("vault");
        let registry = dir.path().join("catalog.json");
        let old = base.join("tags/仕事/note.md");
        std::fs::create_dir_all(base.join("tags/仕事/assets")).unwrap();
        std::fs::create_dir_all(base.join("Archive/assets")).unwrap();
        std::fs::write(base.join("tags/仕事/assets/a.png"), b"original").unwrap();
        std::fs::write(base.join("Archive/assets/a.png"), b"existing 1").unwrap();
        std::fs::write(base.join("Archive/assets/a（2）.png"), b"existing 2").unwrap();
        std::fs::write(base.join("Archive/note.md"), "first").unwrap();
        std::fs::write(base.join("Archive/note（2）.md"), "second").unwrap();
        std::fs::write(&old, "---\ntags: [仕事, 旅行]\n---\n本文 ![画像](assets/a.png)").unwrap();
        let result = change_at(&registry, &base, "仕事", None).unwrap();
        assert!(result.failed.is_empty(), "{:?}", result.failed);
        let moved = std::fs::read_to_string(base.join("Archive/note（3）.md")).unwrap();
        assert_eq!(tags_in(&moved), vec!["旅行"]);
        assert!(moved.contains("(assets/a（3）.png)"));
        assert_eq!(std::fs::read(base.join("Archive/assets/a（3）.png")).unwrap(), b"original");
        assert_eq!(std::fs::read_to_string(base.join("Archive/note.md")).unwrap(), "first");
        assert_eq!(std::fs::read_to_string(base.join("Archive/note（2）.md")).unwrap(), "second");
        assert_eq!(std::fs::read(base.join("Archive/assets/a.png")).unwrap(), b"existing 1");
        assert_eq!(std::fs::read(base.join("Archive/assets/a（2）.png")).unwrap(), b"existing 2");
    }

    #[test]
    fn folder_merge_rejects_unhandled_links_before_editing_any_tags() {
        let dir = tempfile::tempdir().unwrap(); let base = dir.path().join("vault"); let registry = dir.path().join("catalog.json");
        for folder in ["仕事", "業務"] { std::fs::create_dir_all(base.join("tags").join(folder).join("assets")).unwrap(); }
        std::fs::write(base.join("tags/仕事/assets/a.png"), b"source").unwrap();
        std::fs::write(base.join("tags/業務/assets/a.png"), b"destination").unwrap();
        let note = base.join("tags/仕事/note.md"); let text = "---\ntags: [仕事]\n---\n[関連](../other.md)";
        std::fs::write(&note, text).unwrap();
        assert!(change_at(&registry, &base, "仕事", Some("業務")).is_err());
        assert_eq!(std::fs::read_to_string(&note).unwrap(), text);
        assert_eq!(std::fs::read(base.join("tags/業務/assets/a.png")).unwrap(), b"destination");
    }

    #[test]
    fn folder_merge_recovers_when_note_moved_before_journal_was_updated() {
        let dir = tempfile::tempdir().unwrap(); let base = dir.path().join("vault"); let registry = dir.path().join("catalog.json");
        for folder in ["仕事", "業務"] { std::fs::create_dir_all(base.join("tags").join(folder).join("assets")).unwrap(); }
        std::fs::write(base.join("tags/仕事/assets/a.png"), b"source").unwrap();
        std::fs::write(base.join("tags/業務/assets/a.png"), b"destination").unwrap();
        let old = base.join("tags/仕事/note.md");
        std::fs::write(&old, "---\ntags: [業務]\n---\n本文 ![画像](assets/a.png)").unwrap();
        let destination = base.join("tags/業務"); let plan = prepare_note_move(&destination, &old).unwrap();
        move_note_to_folder(&destination, &old, &plan).unwrap();
        let key = vault_key(&base); let path = old.to_string_lossy().to_string();
        let mut state = Registry::default();
        state.vaults.insert(key.clone(), Catalog { tags: BTreeSet::from(["仕事".into()]), created_order: BTreeMap::new(),
            pending: Some(Pending { old: "仕事".into(), new: Some("業務".into()), targets: vec![path.clone()], completed: BTreeSet::from([path]), archive_moved: BTreeSet::new(), archive_moving: None, folder_expected: true, folder_moving: Some(plan) }), interrupted: Vec::new() });
        write_registry(&registry, &state).unwrap();
        let result = change_at_with_merge(&registry, &base, "仕事", Some("業務"), true).unwrap();
        assert!(result.failed.is_empty(), "{:?}", result.failed);
        assert!(!base.join("tags/仕事").exists());
        let text = std::fs::read_to_string(destination.join("note.md")).unwrap();
        let image = text.split("![画像](").nth(1).unwrap().split(')').next().unwrap();
        assert_eq!(std::fs::read(destination.join(image)).unwrap(), b"source");
        assert_eq!(std::fs::read(destination.join("assets/a.png")).unwrap(), b"destination");
        assert!(read_registry(&registry).unwrap().vaults[&key].pending.is_none());
    }

    #[test]
    fn folder_merge_rejects_directory_at_image_destination_before_tag_edits() {
        let dir = tempfile::tempdir().unwrap(); let base = dir.path().join("vault"); let registry = dir.path().join("catalog.json");
        let source_assets = base.join("tags/仕事/assets"); let destination_assets = base.join("tags/業務/assets");
        std::fs::create_dir_all(&source_assets).unwrap(); std::fs::create_dir_all(destination_assets.join("a.png")).unwrap();
        std::fs::write(source_assets.join("a.png"), b"source").unwrap();
        let note = base.join("tags/仕事/note.md"); let before = "---\ntags: [仕事]\n---\n![画像](assets/a.png)";
        std::fs::write(&note, before).unwrap();
        assert!(change_at(&registry, &base, "仕事", Some("業務")).is_err());
        assert_eq!(std::fs::read_to_string(note).unwrap(), before);
        assert_eq!(std::fs::read(source_assets.join("a.png")).unwrap(), b"source");
        assert!(destination_assets.join("a.png").is_dir());
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
            let path = if path.starts_with(base.join("tags/仕事")) { base.join("tags/調査").join(path.strip_prefix(base.join("tags/仕事")).unwrap()) } else { path };
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
            completed: BTreeSet::new(), archive_moved: BTreeSet::new(), archive_moving: None, folder_expected: false, folder_moving: None,
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
            targets: vec![path.to_string_lossy().into()], completed: BTreeSet::new(), archive_moved: BTreeSet::new(), archive_moving: None, folder_expected: false, folder_moving: None,
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
