use crate::state::AppState;
use crate::web_share_contract::{
    self, OperationKind, ShareImageManifest, ShareOperation, SharePayload, ShareScope,
};
use crate::{logger, logic, storage};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl};

const MAX_WEB_SHARE_IMAGE_BYTES: u64 = 50 * 1024 * 1024;

const LAUNCHER_ORDER_FILE: &str = "launcher_order.json";
const CRYSTAL_FORMATS_FILE: &str = "crystal_formats.json";
const QUICK_LAUNCHER_LABEL: &str = "quick_launcher";
pub(crate) const LAUNCHER_SHELF_CHANGED_EVENT: &str = "fusen:launcher_shelf_changed";
static TOGGLE_IN_PROGRESS: AtomicBool = AtomicBool::new(false);
static WEB_SHARE_SYNC_IN_PROGRESS: AtomicBool = AtomicBool::new(false);
const TABS: [&str; 4] = ["recipe", "shortcut", "qa", "term"];

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct LauncherOrder {
    pub last_tab: String,
    pub orders: HashMap<String, Vec<String>>,
    #[serde(default)]
    pub selected_tags: HashMap<String, String>,
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
    let mut guard = cache
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
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

pub(crate) fn invalidate_quick_open_content(path: &str) {
    quick_open_content_cache()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .remove(Path::new(path));
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
            selected_tags: HashMap::new(),
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
        .selected_tags
        .retain(|tab, _| TABS.contains(&tab.as_str()));
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
    let content =
        serde_json::to_string_pretty(&normalize_order(order.clone())).map_err(|e| e.to_string())?;
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

    fs::read_to_string(path)
        .map(Some)
        .map_err(|e| e.to_string())
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
    shortcut_item_from_content(path, &content)
}

fn shortcut_item_from_content(path: &Path, content: &str) -> Option<QuickOpenItem> {
    let tags = parse_launcher_tags(content);
    if !note_has_tag(&tags, "shortcut") {
        return None;
    }
    let path_str = path.to_string_lossy().to_string();
    let filename = path.file_name()?.to_string_lossy();
    let (_, _, context) = logic::parse_filename(&filename);
    Some(QuickOpenItem {
        path: path_str,
        title: context,
        launches: parse_launcher_launches(content),
        is_recipe: note_has_tag(&tags, "recipe"),
        tags,
    })
}

fn load_shortcut_items(base_path: &Path) -> Result<Vec<QuickOpenItem>, String> {
    let order = load_launcher_order()?;
    let items = crate::favorite_storage::desktop_note_paths(base_path)
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

/// Sync must not interpret a note read failure as removal from Quick Launcher:
/// that could otherwise append a Drive revoke record for an unreadable note.
fn load_shortcut_items_strict(base_path: &Path) -> Result<Vec<QuickOpenItem>, String> {
    let entries = fs::read_dir(base_path)
        .map_err(|error| format!("Quick Launcher登録一覧を読めず同期を止めました: {error}"))?;
    let mut items = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|error| {
            format!("Quick Launcher登録一覧を確認できず同期を止めました: {error}")
        })?;
        let path = entry.path();
        if !path.is_file() || path.extension().map_or(true, |ext| ext != "md") {
            continue;
        }
        let content = fs::read_to_string(&path).map_err(|error| {
            format!("付箋を読み取れず共有解除を含む同期を止めました: {error}")
        })?;
        if let Some(item) = shortcut_item_from_content(&path, &content) {
            items.push(item);
        }
    }
    let order = load_launcher_order()?;
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

fn prepare_registered_share_payload(
    base_path: &Path,
    path: &str,
    registered_paths: &[String],
) -> Result<SharePayload, String> {
    let base = base_path.canonicalize().map_err(|e| e.to_string())?;
    let target = Path::new(path).canonicalize().map_err(|e| e.to_string())?;
    if !target.starts_with(&base) || target.extension().and_then(|ext| ext.to_str()) != Some("md") {
        return Err("付箋が現在の保管場所にありません".to_string());
    }
    let registered = registered_paths.iter().any(|registered_path| {
        Path::new(registered_path)
            .canonicalize()
            .is_ok_and(|candidate| candidate == target)
    });
    if !registered {
        return Err("クイックランチャーに登録されていない付箋です".to_string());
    }

    let note_snapshot = fs::read_to_string(&target).map_err(|e| e.to_string())?;
    prepare_registered_share_payload_from_snapshot(
        base_path,
        &target,
        registered_paths,
        &note_snapshot,
    )
}

fn prepare_registered_share_payload_from_snapshot(
    base_path: &Path,
    target: &Path,
    registered_paths: &[String],
    note_snapshot: &str,
) -> Result<SharePayload, String> {
    let base = base_path.canonicalize().map_err(|e| e.to_string())?;
    let target = target.canonicalize().map_err(|e| e.to_string())?;
    if !target.starts_with(&base) || target.extension().and_then(|ext| ext.to_str()) != Some("md") {
        return Err("付箋が現在の保管場所にありません".to_string());
    }
    let registered = registered_paths.iter().any(|registered_path| {
        Path::new(registered_path)
            .canonicalize()
            .is_ok_and(|candidate| candidate == target)
    });
    if !registered {
        return Err("クイックランチャーに登録されていない付箋です".to_string());
    }
    if !crate::web_share_markdown::local_note_has_frontmatter_tag(note_snapshot, "shortcut")? {
        return Err("付箋のランチャー登録状態が変わりました。再読込してください".to_string());
    }
    let filename = target
        .file_name()
        .ok_or_else(|| "付箋のファイル名が不正です".to_string())?
        .to_string_lossy();
    let (_, _, launcher_title) = logic::parse_filename(&filename);
    let images = prepare_local_share_image_manifests(&target, &note_snapshot)?;
    let mut payload =
        crate::web_share_markdown::local_note_to_share_payload(&note_snapshot, &images)?;
    payload.title = launcher_title;
    Ok(payload)
}

fn prepare_local_share_image_manifests(
    note_path: &Path,
    note_file: &str,
) -> Result<HashMap<String, ShareImageManifest>, String> {
    Ok(read_local_share_images(note_path, note_file)?
        .into_iter()
        .map(|(path, image)| (path, image.manifest))
        .collect())
}

struct LocalShareImage {
    manifest: ShareImageManifest,
    bytes: Vec<u8>,
}

async fn apply_web_payload_to_windows_note(
    path: &Path,
    original: &str,
    with_share_id: &str,
    windows_payload: &SharePayload,
    web_payload: &SharePayload,
    client: &reqwest::Client,
    token: &str,
    share_folder: &str,
    snapshot: Option<&crate::web_share_snapshot::Snapshot>,
) -> Result<(), String> {
    if windows_payload.title != web_payload.title {
        return Err("Web側のタイトル変更はWindows原本に反映できないため保留しました".into());
    }
    let latest = fs::read_to_string(path).map_err(|e| e.to_string())?;
    if latest != original {
        return Err(
            "同期中にWindows付箋が変更されました。内容を再確認して再同期してください".into(),
        );
    }
    let local = read_local_share_images(path, with_share_id)?;
    let local_manifests = unique_image_manifests(local.values().map(|image| &image.manifest))?;
    let expected_manifests = unique_image_manifests(windows_payload.images.iter())?;
    let incoming_manifests = unique_image_manifests(web_payload.images.iter())?;
    if local_manifests != expected_manifests || expected_manifests != incoming_manifests {
        return Err("Web側の画像変更はまだWindowsへ反映できないため保留しました".into());
    }
    for manifest in &web_payload.images {
        if manifest.size_bytes == 0 || manifest.size_bytes as u64 > MAX_WEB_SHARE_IMAGE_BYTES {
            return Err("共有画像のサイズ上限を超えているため保留しました".into());
        }
        let bytes = if let Some(snapshot)=snapshot {
            snapshot.images.get(&manifest.sha256).ok_or("Web画像の原本参照がありません")?.validate(&manifest.sha256)?;
            local.values().find(|i|i.manifest.sha256==manifest.sha256).ok_or("Windows原本がありません")?.bytes.clone()
        } else {
        let filename = format!("image-{}", manifest.sha256);
        let id = crate::gdrive::find_web_share_file(client, token, share_folder, &filename)
            .await?
            .ok_or_else(|| {
                "共有画像がDriveに見つからず、Windows原本は変更していません".to_string()
            })?;
        crate::gdrive::download_web_share_bytes(client, token, &id).await?
        };
        if bytes.len() != manifest.size_bytes as usize
            || format!("{:x}", Sha256::digest(&bytes)) != manifest.sha256
        {
            return Err(
                "Drive上の共有画像の内容が一致しないため、Windows原本は変更していません".into(),
            );
        }
    }
    let mut markdown = web_payload.markdown.clone();
    for (local_path, image) in &local {
        let relative_path = Path::new(local_path);
        if relative_path.as_os_str().is_empty()
            || relative_path
                .components()
                .any(|component| !matches!(component, std::path::Component::Normal(_)))
        {
            return Err("付箋画像の相対パスが不正なため保留しました".into());
        }
        let relative = local_path.replace('\\', "/");
        markdown = markdown.replace(
            &format!("ore-fusen-image://{}", image.manifest.image_id),
            &relative,
        );
    }
    if markdown.contains("ore-fusen-image://") {
        return Err("Web付箋にWindows側で確認できない画像参照があるため保留しました".into());
    }
    // Keep the stable identity embedded in the Windows original so a rename
    // after a down-sync still belongs to the same shared note.
    let mut updated = logic::replace_web_share_note_body(with_share_id, &markdown)?;
    let receipt = format!("{:x}", Sha256::digest(web_payload.markdown.as_bytes()));
    updated = logic::update_frontmatter_value_for_web_share(&updated, "web_sync_receipt", &receipt);
    storage::write_note_if_unchanged(&path.to_string_lossy(), original, &updated)
        .map_err(|e| format!("Web変更を書き戻せませんでした: {e}"))
}

fn unique_image_manifests<'a>(
    manifests: impl IntoIterator<Item = &'a ShareImageManifest>,
) -> Result<Vec<ShareImageManifest>, String> {
    let mut unique = HashMap::<String, ShareImageManifest>::new();
    for manifest in manifests {
        match unique.get(&manifest.image_id) {
            Some(previous) if previous != manifest => {
                return Err("同じ画像IDに異なる画像情報があるため保留しました".into());
            }
            Some(_) => {}
            None => {
                unique.insert(manifest.image_id.clone(), manifest.clone());
            }
        }
    }
    let mut result = unique.into_values().collect::<Vec<_>>();
    result.sort_by(|a, b| a.image_id.cmp(&b.image_id));
    Ok(result)
}

fn same_share_content_ignoring_display_metadata(a: &SharePayload, b: &SharePayload) -> bool {
    let mut a_images = a.images.clone();
    let mut b_images = b.images.clone();
    a_images.sort_by(|left, right| left.image_id.cmp(&right.image_id));
    b_images.sort_by(|left, right| left.image_id.cmp(&right.image_id));
    a.title == b.title && a.markdown == b.markdown && a_images == b_images
}

fn read_local_share_images(
    note_path: &Path,
    note_file: &str,
) -> Result<HashMap<String, LocalShareImage>, String> {
    let note_dir = note_path
        .parent()
        .ok_or_else(|| "付箋の保存場所が不正です".to_string())?;
    let references = crate::web_share_markdown::local_note_image_references(note_file)?;
    if references.is_empty() {
        return Ok(HashMap::new());
    }
    let assets_dir = note_dir.join("assets");
    let canonical_note_dir = note_dir
        .canonicalize()
        .map_err(|_| "付箋の保存場所を確認できません".to_string())?;
    let assets_root = assets_dir
        .canonicalize()
        .map_err(|_| "付箋の画像フォルダーを確認できません".to_string())?;
    if !assets_root.starts_with(&canonical_note_dir) {
        return Err("付箋の画像フォルダーが保存場所の外を指しています".to_string());
    }
    let mut manifests = HashMap::new();
    let mut total_image_bytes=0usize;
    for relative in references {
        let relative_path = Path::new(&relative);
        if relative_path
            .components()
            .any(|component| !matches!(component, std::path::Component::Normal(_)))
        {
            return Err("付箋画像の相対パスが不正です".to_string());
        }
        let image_path = note_dir.join(relative_path);
        let canonical_image = image_path
            .canonicalize()
            .map_err(|_| "付箋画像を読み込めません".to_string())?;
        if !canonical_image.starts_with(&assets_root) || !canonical_image.is_file() {
            return Err("付箋画像が画像フォルダーの外を指しています".to_string());
        }
        let bytes = read_limited_image_file(&canonical_image)?;
        total_image_bytes+=bytes.len();
        if total_image_bytes>128*1024*1024 {return Err("1枚の付箋の画像容量が同期上限を超えています。原本は保持しています".into());}
        let format =
            image::guess_format(&bytes).map_err(|_| "画像形式を判定できません".to_string())?;
        let mime_type = match format {
            image::ImageFormat::Png => "image/png",
            image::ImageFormat::Jpeg => "image/jpeg",
            image::ImageFormat::Gif => "image/gif",
            image::ImageFormat::WebP => "image/webp",
            image::ImageFormat::Bmp => "image/bmp",
            _ => return Err("Web共有に対応していない画像形式です".to_string()),
        };
        // Hash/header inspection is enough for unchanged originals. Decode
        // pixels only once when a new Web preview is actually necessary.
        let (width,height)=image::ImageReader::with_format(std::io::Cursor::new(&bytes),format).into_dimensions()
            .map_err(|_| "付箋画像が壊れているか、画像サイズ上限を超えています".to_string())?;
        if width==0 || height==0 || width>4096 || height>4096 {return Err("付箋画像の画素数上限を超えています".into());}
        let digest = format!("{:x}", Sha256::digest(&bytes));
        let manifest = ShareImageManifest {
            image_id: format!("img-{digest}"),
            mime_type: mime_type.to_string(),
            size_bytes: u32::try_from(bytes.len())
                .map_err(|_| "画像サイズを共有形式に変換できません".to_string())?,
            sha256: digest,
        };
        manifests.insert(relative.to_string(), LocalShareImage { manifest, bytes });
    }
    Ok(manifests)
}

fn persist_web_share_sync_state(path: &Path, state: &WebShareSyncState) -> Result<(), String> {
    let serialized = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    storage::write_note(&path.to_string_lossy(), &serialized)
        .map_err(|e| format!("同期結果をPCに記録できません: {e}"))
}

fn read_limited_image_file(path: &Path) -> Result<Vec<u8>, String> {
    read_limited_image_bytes(
        fs::File::open(path).map_err(|error| error.to_string())?,
        MAX_WEB_SHARE_IMAGE_BYTES,
    )
}

fn read_limited_image_bytes<R: Read>(reader: R, max_bytes: u64) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    reader
        .take(max_bytes + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.is_empty() || bytes.len() as u64 > max_bytes {
        return Err("付箋画像が空、またはサイズ上限を超えています".to_string());
    }
    Ok(bytes)
}

#[tauri::command]
pub(crate) fn fusen_prepare_web_share_note(
    state: State<'_, Mutex<AppState>>,
    path: String,
) -> Result<SharePayload, String> {
    let base = base_path_from_state(&state)?;
    let items = load_shortcut_items(Path::new(&base))?;
    let registered_paths = items.into_iter().map(|item| item.path).collect::<Vec<_>>();
    prepare_registered_share_payload(Path::new(&base), &path, &registered_paths)
}

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct WebShareSyncState {
    account_subject: String,
    notes: HashMap<String, WebShareNoteSyncState>,
    #[serde(default)]
    note_ids: HashMap<String, String>,
    #[serde(default)]
    revoked_ids: HashSet<String>,
    #[serde(default)]
    snapshot_ids: HashMap<String, String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct WebShareNoteSyncState {
    head_id: String,
    payload: SharePayload,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WebShareSyncSummary {
    uploaded: usize,
    applied: usize,
    unchanged: usize,
    revoked: usize,
    held: Vec<String>,
}

enum WebSyncOutcome {
    Uploaded,
    Applied,
    Unchanged,
}

struct WebShareSyncGuard;
impl Drop for WebShareSyncGuard {
    fn drop(&mut self) {
        WEB_SHARE_SYNC_IN_PROGRESS.store(false, Ordering::Release);
    }
}

/// Quick Launcherの登録付箋だけを手動でDriveへ送る。取得/検証に失敗した変更は保留し、
/// 既存操作ファイルを更新する経路は使用しない。
#[tauri::command]
pub(crate) async fn fusen_sync_quick_launcher_to_web(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<WebShareSyncSummary, String> {
    if WEB_SHARE_SYNC_IN_PROGRESS
        .compare_exchange(false, true, Ordering::Acquire, Ordering::Relaxed)
        .is_err()
    {
        return Err("Web同期はすでに実行中です。完了を待ってください".to_string());
    }
    let _sync_guard = WebShareSyncGuard;
    let sync_started = std::time::Instant::now();
    let base = PathBuf::from(base_path_from_state(&state)?)
        .canonicalize()
        .map_err(|e| format!("付箋の保存場所を確認できません: {e}"))?;
    let items = load_shortcut_items_strict(&base)?;
    let client = reqwest::Client::new();
    let token = crate::gdrive::get_access_token(&client)
        .await
        .map_err(|error| format!("Google Driveに接続できません: {error}"))?;
    let account = crate::gdrive::get_google_account_with_token(&client, &token)
        .await
        .map_err(|error| format!("Googleアカウントを確認できません: {error}"))?;
    let account_subject = account
        .email_address
        .filter(|email| !email.trim().is_empty())
        .ok_or_else(|| "Googleアカウントのメールアドレスを取得できません".to_string())?
        .trim()
        .to_lowercase();
    let share_folder = crate::gdrive::ensure_web_share_folder(&client, &token).await?;
    let remote_files =
        crate::gdrive::list_web_share_records(&client, &token, &share_folder).await?;
    let _ = app.emit("fusen:web_sync_progress", "history");
    let sharing_files = crate::gdrive::list_web_share_named_records(&client, &token, &share_folder, "web-sharing-").await?;
    let sharing_records=crate::gdrive::read_web_share_records(&client,&token,sharing_files).await?;

    let state_path = crate::gdrive::get_token_path().with_file_name("web_share_sync.json");
    let mut sync_state = if state_path.exists() {
        serde_json::from_slice::<WebShareSyncState>(
            &fs::read(&state_path).map_err(|e| e.to_string())?,
        )
        .map_err(|e| format!("前回同期の記録が壊れています。安全のため中止しました: {e}"))?
    } else {
        WebShareSyncState::default()
    };
    if !sync_state.account_subject.is_empty() && sync_state.account_subject != account_subject {
        return Err(
            "Windows側の前回同期アカウントとGoogleアカウントが異なります。同期を保留しました"
                .to_string(),
        );
    }
    sync_state.account_subject = account_subject.clone();
    let mut snapshots=crate::web_share_snapshot::Store::load(&client,&token,&share_folder,&account_subject,remote_files,sharing_records).await?;
    let paused_ids=snapshots.paused.clone();
    let all_remote=snapshots.operations.clone();

    let mut summary = WebShareSyncSummary {
        uploaded: 0,
        applied: 0,
        unchanged: 0,
        revoked: 0,
        held: Vec::new(),
    };
    let mut id_owners = HashMap::<String, String>::new();
    let mut note_ids_by_path = HashMap::<String, String>::new();
    let mut duplicate_id_paths = HashSet::<String>::new();
    let remote_note_ids = all_remote
        .iter()
        .filter(|record| record.scope.account_subject == account_subject)
        .map(|record| record.scope.note_id.clone())
        .collect::<HashSet<_>>();
    let mut remote_revoked_ids = HashSet::new();
    for note_id in remote_note_ids {
        let scope = ShareScope {
            account_subject: account_subject.clone(),
            note_id: note_id.clone(),
            generation: 1,
        };
        let scoped = all_remote
            .iter()
            .filter(|record| record.scope == scope)
            .cloned()
            .collect::<Vec<_>>();
        let validated = web_share_contract::validate_log(&scope, &scoped)
            .map_err(|error| format!("Drive上の共有記録を確認できず同期を止めました: {error:?}"))?;
        if validated.control_records.iter().any(|id| {
            scoped
                .iter()
                .any(|record| record.operation_id == *id && record.kind == OperationKind::Revoke)
        }) {
            remote_revoked_ids.insert(note_id);
        }
    }
    // A Web revoke removes sharing, never the Windows original. Apply only
    // once; an explicit later launcher registration receives a fresh note ID.
    for item in &items {
        let path = Path::new(&item.path);
        let source = fs::read_to_string(path).map_err(|e|e.to_string())?;
        if let Some(id) = logic::web_share_note_id(&source) {
            if remote_revoked_ids.contains(&id) && !sync_state.revoked_ids.contains(&id) {
                if let Some(updated) = web_unshare_content(&source,&id) {
                    storage::write_note_if_unchanged(&path.to_string_lossy(), &source, &updated)?;
                }
                sync_state.revoked_ids.insert(id);
                persist_web_share_sync_state(&state_path, &sync_state)?;
                summary.revoked += 1;
                let _ = app.emit("fusen:reload_note", serde_json::json!({"path":item.path}));
            }
        }
    }
    let _ = app.emit("fusen:web_sync_progress", "apply");
    let imported_paths = crate::web_create::receive(&base,&account_subject,&client,&token,&share_folder,&state).await?;
    summary.applied += imported_paths.len();
    let items = load_shortcut_items_strict(&base)?;
    let registered_paths = items.iter().map(|item|item.path.clone()).collect::<Vec<_>>();
    invalidate_shortcut_cache(shortcut_cache());
    emit_launcher_shelf_changed(&app);
    for item in &items {
        let path = Path::new(&item.path);
        let canonical = path.canonicalize().map_err(|error| {
            format!("登録付箋を確認できず、解除を含む同期を止めました: {error}")
        })?;
        if !canonical.starts_with(&base) {
            return Err("登録付箋が保管場所の外にあり、同期を止めました".into());
        }
        let Ok(relative) = canonical
            .strip_prefix(&base)
            .map(|path| path.to_string_lossy().replace('\\', "/"))
        else {
            return Err("登録付箋の保存場所を特定できず、同期を止めました".into());
        };
        let source = fs::read_to_string(&canonical).map_err(|error| {
            format!("登録付箋を読み取れず、解除を含む同期を止めました: {error}")
        })?;
        let stored_id = sync_state.note_ids.get(&relative).cloned();
        let embedded_id = logic::web_share_note_id(&source);
        let prior_id = stored_id.clone().or(embedded_id.clone());
        let id = if prior_id.as_ref().is_some_and(|id| {
            sync_state.revoked_ids.contains(id) || remote_revoked_ids.contains(id)
        }) {
            let id = uuid::Uuid::new_v4().to_string();
            sync_state.note_ids.insert(relative.clone(), id.clone());
            id
        } else if let Some(id) = stored_id {
            id
        } else if let Some(id) = embedded_id {
            sync_state
                .note_ids
                .entry(relative.clone())
                .or_insert_with(|| id.clone());
            id
        } else {
            sync_state
                .note_ids
                .entry(relative.clone())
                .or_insert_with(|| uuid::Uuid::new_v4().to_string())
                .clone()
        };
        let with_id = logic::set_web_share_note_id(&source, &id)?;
        let (_, body) = logic::split_frontmatter(&with_id);
        let receipt = format!("{:x}", Sha256::digest(body.as_bytes()));
        let with_id =
            logic::update_frontmatter_value_for_web_share(&with_id, "web_sync_receipt", &receipt);
        if with_id != source && !paused_ids.contains(&id) {
            storage::write_note_if_unchanged(&canonical.to_string_lossy(), &source, &with_id)
                .map_err(|error| format!("共有IDをWindows原本に記録できず保留しました: {error}"))?;
            let _ = app.emit(
                "fusen:reload_note",
                serde_json::json!({ "path": canonical.to_string_lossy() }),
            );
        }
        if let Some(previous_path) = id_owners.insert(id.clone(), relative.clone()) {
            duplicate_id_paths.insert(previous_path);
            duplicate_id_paths.insert(relative.clone());
        }
        note_ids_by_path.insert(relative, id);
    }
    // Persist stable local IDs before any Drive write so an interrupted upload can be retried.
    persist_web_share_sync_state(&state_path, &sync_state)?;
    let active_ids = note_ids_by_path.values().cloned().collect::<HashSet<_>>();
    let account_note_prefix = format!("{}:", account_subject);
    let removed_ids = sync_state
        .notes
        .keys()
        .filter_map(|key| key.strip_prefix(&account_note_prefix))
        .filter(|note_id| {
            !active_ids.contains(*note_id) && !sync_state.revoked_ids.contains(*note_id)
        })
        .map(str::to_string)
        .collect::<HashSet<_>>();
    for note_id in removed_ids {
        if !duplicate_id_paths.is_empty() {
            summary
                .held
                .push("付箋IDの重複があるため、未登録付箋の共有解除を保留しました".into());
            break;
        }
        let key = format!("{}:{}", account_subject, note_id);
        let Some(previous) = sync_state.notes.get(&key).cloned() else {
            continue;
        };
        let scope = ShareScope {
            account_subject: account_subject.clone(),
            note_id: note_id.clone(),
            generation: 1,
        };
        let scoped = all_remote
            .iter()
            .filter(|record| record.scope == scope)
            .cloned()
            .collect::<Vec<_>>();
        let validated = web_share_contract::validate_log(&scope, &scoped).map_err(|error| {
            format!("共有解除対象のDrive記録を確認できず保留しました: {error:?}")
        })?;
        let is_revoked = validated.control_records.iter().any(|id| {
            scoped
                .iter()
                .any(|record| &record.operation_id == id && record.kind == OperationKind::Revoke)
        });
        if !is_revoked {
            let mut revoke = ShareOperation {
                scope,
                operation_id: String::new(),
                kind: OperationKind::Revoke,
                parents: Vec::new(),
                payload_hash: String::new(),
                payload: previous.payload,
                resolved_ids: Vec::new(),
            };
            revoke.operation_id = format!(
                "op-{:x}",
                Sha256::digest(format!("{}:{}:revoke", account_subject, note_id).as_bytes())
            );
            revoke.payload_hash = web_share_contract::calculate_payload_hash(&revoke)
                .map_err(|error| format!("共有解除記録を作れません: {error:?}"))?;
            snapshots.save(&client,&token,&share_folder,&revoke,Default::default(),None).await?;
        }
        sync_state.revoked_ids.insert(note_id);
        summary.revoked += 1;
    }
    for item in items {
        let path = Path::new(&item.path);
        let relative = path.canonicalize().ok().and_then(|canonical| {
            canonical
                .strip_prefix(&base)
                .ok()
                .map(|path| path.to_string_lossy().replace('\\', "/"))
        });
        if let Some(relative) = &relative {
            if duplicate_id_paths.contains(relative) {
                summary.held.push(format!(
                    "{}: 共有IDが別の登録付箋と重複しているため保留しました",
                    item.title
                ));
                continue;
            }
        }
        let Some(note_id) = relative
            .as_ref()
            .and_then(|relative| note_ids_by_path.get(relative))
            .cloned()
        else {
            summary.held.push(format!(
                "{}: 付箋のIDを安全に準備できず保留しました",
                item.title
            ));
            continue;
        };
        if snapshots.blocked.contains(&note_id) {
            summary.held.push(format!("{}: 複数の変更を保持しています。競合中の記録は整理していません",item.title));continue;
        }
        if paused_ids.contains(&note_id) {
            summary.unchanged += 1;
            continue;
        }
        let result = sync_one_registered_note(
            &app,
            &base,
            path,
            &registered_paths,
            &account_subject,
            &token,
            &client,
            &share_folder,
            &all_remote,
            &mut sync_state,
            &note_id,
            &mut snapshots,
        )
        .await;
        match result {
            Ok(WebSyncOutcome::Uploaded) => summary.uploaded += 1,
            Ok(WebSyncOutcome::Applied) => summary.applied += 1,
            Ok(WebSyncOutcome::Unchanged) => summary.unchanged += 1,
            Err(error) => summary.held.push(format!("{}: {}", item.title, error)),
        }
    }
    persist_web_share_sync_state(&state_path, &sync_state)?;
    for path in imported_paths {
        if let Err(error) = fusen_open_quick_note(app.clone(), path.clone(), None).await {
            summary.held.push(format!("新規付箋は保存済みですが表示できませんでした（QLから開けます）: {path}: {error}"));
        }
    }
    if let Err(error)=crate::web_create::cleanup_published(&client,&token,&share_folder,&account_subject,&snapshots).await {
        crate::logger::log_info(&format!("[Web同期] 作成済み要求の整理を保留: {error}"));
    }
    crate::logger::log_info(&format!("[Web同期] 完了: {}ms / 送信{} 受信{} 変更なし{} 保留{}", sync_started.elapsed().as_millis(), summary.uploaded, summary.applied, summary.unchanged, summary.held.len()));
    Ok(summary)
}

async fn sync_one_registered_note(
    app: &AppHandle,
    base: &Path,
    path: &Path,
    registered_paths: &[String],
    account_subject: &str,
    token: &str,
    client: &reqwest::Client,
    share_folder: &str,
    all_remote: &[ShareOperation],
    sync_state: &mut WebShareSyncState,
    note_id: &str,
    snapshots: &mut crate::web_share_snapshot::Store,
) -> Result<WebSyncOutcome, String> {
    let canonical = path.canonicalize().map_err(|e| e.to_string())?;
    if !canonical.starts_with(base.canonicalize().map_err(|e| e.to_string())?) {
        return Err("登録付箋が保管場所の外にあります".into());
    }
    let original = fs::read_to_string(&canonical).map_err(|e| e.to_string())?;
    if !crate::web_share_markdown::local_note_has_frontmatter_tag(&original, "shortcut")? {
        return Err("Quick Launcher登録を確認できないため保留しました".into());
    }
    let note_id = note_id.to_string();
    let with_share_id = logic::set_web_share_note_id(&original, &note_id)?;
    let payload = prepare_registered_share_payload_from_snapshot(
        base,
        &canonical,
        registered_paths,
        &with_share_id,
    )?;
    let scope = ShareScope {
        account_subject: account_subject.to_string(),
        note_id: note_id.clone(),
        generation: 1,
    };
    let scoped_records = all_remote
        .iter()
        .filter(|record| record.scope == scope)
        .cloned()
        .collect::<Vec<_>>();
    let validated = web_share_contract::validate_log(&scope, &scoped_records)
        .map_err(|e| format!("Drive上の共有記録を安全に読めないため保留しました: {e:?}"))?;
    let key = format!("{}:{}", account_subject, note_id);
    let previous = sync_state.notes.get(&key).cloned();
    let remote_heads = validated.content_heads;
    let remote_head = match remote_heads.as_slice() {
        [] if previous.is_none() => None,
        [] => return Err("Drive上の前回同期記録が見つからないため保留しました".into()),
        [head] => Some(head.as_str()),
        _ => return Err("WindowsとWebの両方に変更があり、競合を保留しました".into()),
    };
    let remote_operation = remote_head.and_then(|head| {
        scoped_records
            .iter()
            .find(|record| record.operation_id == head)
    });
    if let Some(remote) = remote_operation {
        if remote.payload == payload {
            if snapshots.notes.get(&note_id).is_some_and(|saved|saved.snapshot.images.values().any(|asset|asset.legacy)) {
                let images=read_local_share_images(&canonical,&with_share_id)?.into_values().map(|image|(image.manifest.sha256,image.bytes)).collect();
                snapshots.save(client,token,share_folder,remote,images,None).await?;
            }
            sync_state.notes.insert(
                key,
                WebShareNoteSyncState {
                    head_id: remote.operation_id.clone(),
                    payload,
                },
            );
            return Ok(WebSyncOutcome::Unchanged);
        }
        if previous.as_ref().map(|entry| entry.head_id.as_str())
            != Some(remote.operation_id.as_str())
        {
            let baseline = previous
                .as_ref()
                .ok_or_else(|| "同期基準がないためWeb変更を安全に適用できません".to_string())?;
            let baseline_matches = if baseline.payload.schema_version == 1 {
                same_share_content_ignoring_display_metadata(&baseline.payload, &payload)
            } else {
                baseline.payload == payload
            };
            if !baseline_matches {
                return Err("WindowsとWebの同じ付箋に変更があり、競合を保留しました".into());
            }
            apply_web_payload_to_windows_note(
                &canonical,
                &original,
                &with_share_id,
                &payload,
                &remote.payload,
                client,
                token,
                share_folder,
                snapshots.notes.get(&note_id).map(|s|&s.snapshot),
            )
            .await?;
            let _ = app.emit(
                "fusen:reload_note",
                serde_json::json!({ "path": canonical.to_string_lossy() }),
            );
            sync_state.notes.insert(
                key,
                WebShareNoteSyncState {
                    head_id: remote.operation_id.clone(),
                    payload: remote.payload.clone(),
                },
            );
            return Ok(WebSyncOutcome::Applied);
        }
    }
    let parent = remote_operation
        .map(|record| record.operation_id.clone())
        .unwrap_or_else(|| {
            format!(
                "root:{}:{}:{}:{}:{}",
                scope.account_subject.len(),
                scope.account_subject,
                scope.note_id.len(),
                scope.note_id,
                scope.generation
            )
        });

    let latest = fs::read_to_string(&canonical).map_err(|e| e.to_string())?;
    if latest != original {
        return Err(
            "同期中にWindows付箋が変更されました。内容を再確認して再同期してください".into(),
        );
    }
    let verified_images = read_local_share_images(&canonical, &with_share_id)?;
    let verified_manifests =
        unique_image_manifests(verified_images.values().map(|image| &image.manifest))?;
    let payload_manifests = unique_image_manifests(payload.images.iter())?;
    if verified_manifests != payload_manifests {
        return Err("画像が同期中に変更されました。もう一度同期してください".into());
    }
    let mut snapshot_images=std::collections::BTreeMap::new();
    for image in verified_images.values() {
        if image.bytes.is_empty() || image.bytes.len() as u64 > MAX_WEB_SHARE_IMAGE_BYTES {
            return Err("共有画像のサイズ上限を超えているため保留しました".into());
        }
        snapshot_images.insert(image.manifest.sha256.clone(),image.bytes.clone());
    }

    let mut operation = ShareOperation {
        scope,
        operation_id: String::new(),
        kind: OperationKind::Edit,
        parents: vec![parent.clone()],
        payload_hash: String::new(),
        payload,
        resolved_ids: Vec::new(),
    };
    operation.payload_hash = web_share_contract::calculate_payload_hash(&operation)
        .map_err(|e| format!("共有内容の検証に失敗しました: {e:?}"))?;
    let operation_seed = format!(
        "{}:{}:{}",
        operation.scope.note_id, parent, operation.payload_hash
    );
    operation.operation_id = format!("op-{:x}", Sha256::digest(operation_seed.as_bytes()));
    if !snapshots.notes.contains_key(&note_id) && !sync_state.snapshot_ids.contains_key(&note_id) {
        let id=crate::gdrive::generate_web_share_id(client,token).await?;
        sync_state.snapshot_ids.insert(note_id.clone(),id);
        persist_web_share_sync_state(&crate::gdrive::get_token_path().with_file_name("web_share_sync.json"),sync_state)?;
    }
    snapshots.save(client,token,share_folder,&operation,snapshot_images,sync_state.snapshot_ids.get(&note_id).map(String::as_str)).await?;
    sync_state.notes.insert(
        key,
        WebShareNoteSyncState {
            head_id: operation.operation_id.clone(),
            payload: operation.payload,
        },
    );
    Ok(WebSyncOutcome::Uploaded)
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
        crate::favorite_storage::desktop_note_paths(base_path)
    }
}

fn query_matches(item: &QuickOpenItem, query: &str) -> bool {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return true;
    }

    let needle = trimmed.to_lowercase();
    item.title.to_lowercase().contains(&needle)
        || item
            .tags
            .iter()
            .filter(|tag| !logic::is_reserved_tag(tag))
            .any(|tag| tag.to_lowercase().contains(&needle))
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

fn list_quick_open_notes(
    base_path: &Path,
    tab: &str,
    query: &str,
) -> Result<Vec<QuickOpenItem>, String> {
    let tab = validate_tab(tab)?;
    if tab == "shortcut" {
        return cached_shortcut_items(base_path).map(|items| apply_query_filter(items, query));
    }
    let order = load_launcher_order()?;
    let items: Vec<QuickOpenItem> = quick_note_paths(base_path, tab)
        .into_iter()
        .filter_map(|path| read_quick_item(&path, tab))
        .collect();
    let ordered = merge_ordered_items(
        order.orders.get(tab).map(Vec::as_slice).unwrap_or(&[]),
        items,
    );
    Ok(apply_query_filter(ordered, query))
}

fn move_path_in_order(
    paths: Vec<String>,
    path: &str,
    direction: &str,
) -> Result<Vec<String>, String> {
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

fn web_unshare_content(source: &str, id: &str) -> Option<String> {
    let (front,_) = logic::split_frontmatter(source);
    if front.lines().any(|line|line.trim()==format!("webRevokedId: {}",id)) {return None;}
    let unregistered=remove_tag_from_content(source,"shortcut");
    Some(logic::update_frontmatter_value_for_web_share(&unregistered,"webRevokedId",id))
}

#[cfg(test)]
mod web_unshare_tests {
    use super::*;
    #[test]
    fn web_unshare_preserves_body_and_other_tags_and_marks_the_same_write() {
        let source="---\ntype: sticky\ntags: [shortcut, work]\n---\n\n本文\n- [x] 項目";
        let updated=web_unshare_content(source,"test-id").unwrap();
        assert_eq!(logic::split_frontmatter(&source).1,logic::split_frontmatter(&updated).1);
        assert!(!note_has_tag(&parse_launcher_tags(&updated),"shortcut"));
        assert!(note_has_tag(&parse_launcher_tags(&updated),"work"));
        assert!(updated.contains("webRevokedId: test-id"));
        let registered=logic::update_frontmatter_value_for_web_share(&updated,"tags","[shortcut, work]");
        assert!(web_unshare_content(&registered,"test-id").is_none());
    }
    #[test]
    fn body_text_cannot_impersonate_an_applied_revoke_marker() {
        assert!(web_unshare_content("---\ntags: [shortcut]\n---\n\nwebRevokedId: test-id","test-id").is_some());
    }
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
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("md");

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

pub(crate) fn handle_note_trashed(
    app: &AppHandle,
    old_path: &str,
    new_path: &str,
) -> Result<(), String> {
    let mut order = load_launcher_order()?;
    remove_path_from_orders(&mut order, old_path);
    remove_path_from_orders(&mut order, new_path);
    save_launcher_order(&order)?;
    emit_launcher_shelf_changed(app);
    Ok(())
}

fn move_crystal_to_local_trash(path: &Path, content: &str) -> Result<PathBuf, String> {
    let parent = path
        .parent()
        .ok_or_else(|| "invalid note parent".to_string())?;
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

fn build_quick_launcher_window<R: tauri::Runtime>(
    app: &AppHandle<R>,
) -> Result<tauri::WebviewWindow<R>, String> {
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
            let app_state = state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            app_state
                .base_path
                .clone()
                .or_else(|| app_state.folder_path.clone())
        }
        .or_else(|| {
            storage::load_settings()
                .ok()
                .and_then(|settings| settings.base_path)
        });
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

fn launcher_window_geometry(content: &str) -> (Option<i32>, Option<i32>, Option<u32>, Option<u32>) {
    let Some(window) = content
        .lines()
        .find_map(|line| line.trim().strip_prefix("window:"))
    else {
        return (None, None, None, None);
    };
    let mut x = None;
    let mut y = None;
    let mut width = None;
    let mut height = None;
    for field in window.trim().trim_matches(['{', '}']).split(',') {
        let Some((key, value)) = field.split_once(':') else {
            continue;
        };
        let parsed = value.trim().parse::<u32>().ok();
        match key.trim() {
            "x" => x = value.trim().parse::<i32>().ok(),
            "y" => y = value.trim().parse::<i32>().ok(),
            "width" => width = parsed.filter(|value| (200..=2000).contains(value)),
            "height" => height = parsed.filter(|value| (120..=2000).contains(value)),
            _ => {}
        }
    }
    (x, y, width, height)
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
pub(crate) async fn fusen_open_quick_note(
    app: AppHandle,
    path: String,
    requested_at: Option<u64>,
) -> Result<(), String> {
    let retained = {
        let state = app.state::<std::sync::Mutex<crate::state::AppState>>();
        let state = state.lock().unwrap_or_else(|p| p.into_inner());
        state
            .open_note_windows
            .get(&crate::normalize_path_for_label(&path))
            .cloned()
    }
    .and_then(|label| app.get_webview_window(&label));
    if let Some(window) = &retained {
        window.show().map_err(|e| e.to_string())?;
        crate::favorite_storage::log_visibility_latency("show", requested_at);
        window.unminimize().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        crate::favorite_storage::fusen_take_out_favorite(app.clone(), path.clone())?;
    }
    let content = cached_quick_open_content(Path::new(&path))?;
    let tags = parse_launcher_tags(&content);
    let (x, y, width, height) = launcher_window_geometry(&content);
    let is_crystal = tags.iter().any(|tag| {
        matches!(
            logic::normalize_reserved_tag(tag).as_str(),
            "recipe" | "qa" | "term"
        )
    });
    let emit_path = path.clone();
    run_quick_open_after_read(
        &content,
        |background_color| {
            if retained.is_some() {
                return Ok(());
            }
            app.emit(
                "fusen:open_note",
                serde_json::json!({
                    "path": emit_path,
                    "backgroundColor": background_color,
                    "content": content,
                    "isCrystal": is_crystal,
                    "x": x,
                    "y": y,
                    "width": width,
                    "height": height
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
            app.emit_to(
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
            logger::log_warn(&format!(
                "[Launcher] failed to schedule crystal window close: {}",
                e
            ));
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
pub(crate) fn fusen_set_launcher_tag_filter(tab: String, tag: String) -> Result<(), String> {
    let tab = validate_tab(&tab)?.to_string();
    let mut order = load_launcher_order()?;
    if tag.trim().is_empty() || tag == "__all__" {
        order.selected_tags.remove(&tab);
    } else {
        order.selected_tags.insert(tab, tag);
    }
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

    #[test]
    fn strict_web_sync_listing_stops_when_folder_cannot_be_read() {
        let directory = tempdir().unwrap();
        let missing = directory.path().join("missing-notes");
        let error = load_shortcut_items_strict(&missing).unwrap_err();
        assert!(error.contains("登録一覧"));
    }

    #[test]
    fn duplicate_image_references_compare_as_one_verified_manifest() {
        let manifest = ShareImageManifest {
            image_id: "img-abc".into(),
            mime_type: "image/png".into(),
            size_bytes: 3,
            sha256: "abc".into(),
        };
        let unique = unique_image_manifests([&manifest, &manifest]).unwrap();
        assert_eq!(unique, vec![manifest.clone()]);
        let conflicting = ShareImageManifest {
            size_bytes: 4,
            ..manifest.clone()
        };
        assert!(unique_image_manifests([&manifest, &conflicting]).is_err());
    }

    #[test]
    fn legacy_share_baseline_ignores_new_display_metadata_but_keeps_content_conflicts() {
        let old = SharePayload {
            schema_version: 1,
            title: "Title".into(),
            markdown: "Body".into(),
            images: vec![],
            background_color: None,
            tags: vec![],
        };
        let mut current = old.clone();
        current.schema_version = 2;
        current.background_color = Some("#80d8ff".into());
        assert!(same_share_content_ignoring_display_metadata(&old, &current));
        current.markdown.push_str(" changed");
        assert!(!same_share_content_ignoring_display_metadata(&old, &current));
    }

    #[test]
    fn share_payload_reads_only_registered_launcher_notes_without_writing_source() {
        let dir = tempdir().unwrap();
        let note_path = dir.path().join("20261016_1_Shopping.md");
        let original = "---\ntype: sticky\ntitle: 買い物リスト\ntags: [shortcut]\nwindow: { x: 10 }\n---\n\n- [ ] 牛乳\n";
        fs::write(&note_path, original).unwrap();
        let path = note_path.to_string_lossy().to_string();

        let payload =
            prepare_registered_share_payload(dir.path(), &path, std::slice::from_ref(&path))
                .unwrap();

        assert_eq!(payload.title, "Shopping");
        assert_eq!(payload.markdown, "\n- [ ] 牛乳\n");
        assert!(!payload.markdown.contains("window:"));
        assert_eq!(fs::read_to_string(note_path).unwrap(), original);
    }

    #[test]
    fn share_payload_rejects_unregistered_and_outside_notes() {
        let dir = tempdir().unwrap();
        let other = tempdir().unwrap();
        let note_path = dir.path().join("registered.md");
        let outside_path = other.path().join("outside.md");
        let contents = "---\ntitle: Note\n---\nBody";
        fs::write(&note_path, contents).unwrap();
        fs::write(&outside_path, contents).unwrap();
        let note = note_path.to_string_lossy().to_string();
        let outside = outside_path.to_string_lossy().to_string();

        assert!(prepare_registered_share_payload(dir.path(), &note, &[]).is_err());
        assert!(prepare_registered_share_payload(
            dir.path(),
            &outside,
            std::slice::from_ref(&outside)
        )
        .is_err());
    }

    #[test]
    fn share_payload_fails_closed_for_local_image_links_without_upload_manifest() {
        let dir = tempdir().unwrap();
        let note_path = dir.path().join("with-image.md");
        let original = "---\ntitle: Image\ntags: [shortcut]\n---\n![private](assets/private.png)\n";
        fs::write(&note_path, original).unwrap();
        let path = note_path.to_string_lossy().to_string();

        assert!(
            prepare_registered_share_payload(dir.path(), &path, std::slice::from_ref(&path))
                .is_err()
        );
        assert_eq!(fs::read_to_string(note_path).unwrap(), original);
    }

    #[test]
    fn share_payload_converts_verified_assets_to_hash_bound_ids_without_touching_source() {
        let dir = tempdir().unwrap();
        let assets = dir.path().join("assets");
        fs::create_dir_all(&assets).unwrap();
        let image_path = assets.join("photo.png");
        image::RgbaImage::from_pixel(1, 1, image::Rgba([10, 20, 30, 255]))
            .save(&image_path)
            .unwrap();
        let note_path = dir.path().join("20261016_1_Photo.md");
        let original =
            "---\ntitle: Photo\ntags: [shortcut]\n---\n![photo](<assets/photo.png> \"caption\")\n";
        fs::write(&note_path, original).unwrap();
        let path = note_path.to_string_lossy().to_string();

        let payload =
            prepare_registered_share_payload(dir.path(), &path, std::slice::from_ref(&path))
                .unwrap();

        assert_eq!(payload.title, "Photo");
        assert_eq!(payload.images.len(), 1);
        assert_eq!(payload.images[0].mime_type, "image/png");
        assert_eq!(
            payload.images[0].size_bytes as usize,
            fs::metadata(image_path).unwrap().len() as usize
        );
        assert_eq!(
            payload.images[0].image_id,
            format!("img-{}", payload.images[0].sha256)
        );
        assert_eq!(
            payload.markdown,
            format!(
                "![photo](ore-fusen-image://{} \"caption\")\n",
                payload.images[0].image_id
            )
        );
        assert_eq!(fs::read_to_string(note_path).unwrap(), original);
    }

    #[test]
    fn share_payload_rejects_image_paths_outside_assets_and_invalid_image_bytes() {
        let dir = tempdir().unwrap();
        let assets = dir.path().join("assets");
        fs::create_dir_all(&assets).unwrap();
        fs::write(assets.join("bad.png"), [137, 80, 78, 71, 13, 10, 26, 10]).unwrap();
        let note_path = dir.path().join("note.md");
        let path = note_path.to_string_lossy().to_string();
        for body in [
            "![escape](assets/../private.png)",
            "![invalid](assets/bad.png)",
        ] {
            let note = format!("---\ntitle: Note\ntags: [shortcut]\n---\n{body}");
            fs::write(&note_path, &note).unwrap();
            assert!(prepare_registered_share_payload(
                dir.path(),
                &path,
                std::slice::from_ref(&path)
            )
            .is_err());
            assert_eq!(fs::read_to_string(&note_path).unwrap(), note);
        }
    }

    #[test]
    fn image_reader_enforces_the_byte_limit_on_the_open_file_handle() {
        assert!(read_limited_image_bytes(std::io::Cursor::new(b"1234"), 3).is_err());
        assert_eq!(
            read_limited_image_bytes(std::io::Cursor::new(b"123"), 3).unwrap(),
            b"123"
        );
    }

    #[test]
    fn share_payload_does_not_treat_body_tags_as_launcher_registration() {
        let dir = tempdir().unwrap();
        let note_path = dir.path().join("unregistered.md");
        let original = "---\ntitle: Example\n---\nCode example:\ntags: [shortcut]\n";
        fs::write(&note_path, original).unwrap();
        let path = note_path.to_string_lossy().to_string();

        assert!(
            prepare_registered_share_payload(dir.path(), &path, std::slice::from_ref(&path))
                .is_err()
        );
        assert_eq!(fs::read_to_string(note_path).unwrap(), original);
    }

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
                emit_calls
                    .borrow_mut()
                    .push(format!("emit:{}", color.unwrap_or_default()));
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
    fn quick_open_lightweight_style_parser_preserves_color_and_window_size() {
        let content = "---\nbackgroundColor: \"#cfd8dc\"\nwindow: { x: 10, y: 20, width: 640, height: 520 }\n---\nbody";
        assert_eq!(
            launcher_background_color(content).as_deref(),
            Some("#cfd8dc")
        );
        assert_eq!(
            launcher_window_geometry(content),
            (Some(10), Some(20), Some(640), Some(520))
        );
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
        order
            .orders
            .insert("qa".to_string(), vec!["a.md".to_string()]);
        order
            .selected_tags
            .insert("qa".to_string(), "work".to_string());

        save_launcher_order_to_path(&path, &order).unwrap();
        let loaded = load_launcher_order_from_path(&path).unwrap();

        assert_eq!(loaded.last_tab, "qa");
        assert_eq!(loaded.orders["qa"], vec!["a.md"]);
        assert!(loaded.orders.contains_key("recipe"));
        assert_eq!(loaded.selected_tags["qa"], "work");
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
    fn query_filter_matches_title_and_user_tags_case_insensitively() {
        let items = vec![
            item("a.md", "Release Checklist", &["work"]),
            item("b.md", "Other", &["QA", "Support"]),
            item("c.md", "Other", &["term"]),
        ];

        let by_title = apply_query_filter(items.clone(), "release");
        let by_tag = apply_query_filter(items.clone(), "support");
        let by_system_tag = apply_query_filter(items, "qa");

        assert_eq!(by_title.len(), 1);
        assert_eq!(by_title[0].path, "a.md");
        assert_eq!(by_tag.len(), 1);
        assert_eq!(by_tag[0].path, "b.md");
        assert!(by_system_tag.is_empty());
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

        let moved = remove_from_shelf_at_base(dir.path(), &source)
            .unwrap()
            .unwrap();

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

        let moved = remove_from_shelf_at_base(dir.path(), &source)
            .unwrap()
            .unwrap();

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

        let moved = remove_from_shelf_at_base(dir.path(), &source)
            .unwrap()
            .unwrap();

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
        order
            .orders
            .insert("shortcut".to_string(), vec!["b.md".to_string()]);

        remove_path_from_orders(&mut order, "b.md");

        assert_eq!(order.orders["recipe"], vec!["a.md"]);
        assert!(order.orders["shortcut"].is_empty());
    }
}

/// Explicit taskbar request. Ordinary launches keep their existing behavior.
pub(crate) fn requests_quick_launcher(arguments: &[String]) -> bool {
    arguments
        .iter()
        .any(|argument| argument == "--quick-launcher")
}

/// Taskbar actions always show the launcher; repeated requests never toggle it off.
pub(crate) fn show_quick_launcher<R: tauri::Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let app_for_show = app.clone();
    app.run_on_main_thread(move || {
        let result = (|| {
            let window = match app_for_show.get_webview_window(QUICK_LAUNCHER_LABEL) {
                Some(window) => window,
                None => build_quick_launcher_window(&app_for_show)?,
            };
            window.unminimize().map_err(|e| e.to_string())?;
            window.show().map_err(|e| e.to_string())?;
            window.set_focus().map_err(|e| e.to_string())?;
            let _ = window.emit("fusen:launcher_shown", ());
            Ok::<(), String>(())
        })();
        if let Err(error) = result {
            logger::log_warn(&format!("[Launcher] taskbar show failed: {error}"));
        }
    })
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod taskbar_request_tests {
    use super::requests_quick_launcher;
    #[test]
    fn taskbar_argument_is_explicit_and_normal_launches_are_unchanged() {
        assert!(requests_quick_launcher(&[
            "app.exe".into(),
            "--quick-launcher".into()
        ]));
        for args in [
            vec![],
            vec!["app.exe".into()],
            vec!["--quick-launcher-other".into()],
            vec!["C:/notes/--quick-launcher.md".into()],
        ] {
            assert!(!requests_quick_launcher(&args));
        }
    }
}
