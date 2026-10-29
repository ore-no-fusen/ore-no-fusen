//! Ninety-day Trash retention. Unknown/changed files are retained; no recursive deletion.
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs,
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    time::UNIX_EPOCH,
};
use walkdir::WalkDir;
pub const RETENTION_DAYS: i64 = 90;
const MAX_FILES: usize = 20_000;
const MAX_LOG: u64 = 16 * 1024 * 1024;
const MAX_NOTE: u64 = 8 * 1024 * 1024;
const MAX_TOTAL: u64 = 64 * 1024 * 1024;
static POLICY_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
#[derive(Serialize, Deserialize)]
struct Policy {
    root: Option<PathBuf>,
}
pub fn policy_enabled(path: &Path, root: &Path) -> Result<bool, String> {
    let _guard = POLICY_LOCK.lock().unwrap_or_else(|p| p.into_inner());
    if !path.exists() {
        return Ok(false);
    }
    let policy: Policy =
        serde_json::from_slice(&read_bounded(path, 64 * 1024)?).map_err(|e| e.to_string())?;
    Ok(policy.root.as_deref() == Some(root))
}
pub fn set_policy(path: &Path, root: Option<&Path>) -> Result<(), String> {
    let _guard = POLICY_LOCK.lock().unwrap_or_else(|p| p.into_inner());
    let parent = path.parent().ok_or("No policy directory")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let temporary = parent.join(format!("trash-policy-{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| -> Result<(), String> {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|e| e.to_string())?;
        file.write_all(
            &serde_json::to_vec(&Policy {
                root: root.map(Path::to_path_buf),
            })
            .map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        drop(file);
        fs::rename(&temporary, path).map_err(|e| e.to_string())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Fingerprint {
    digest: String,
    length: u64,
    modified: String,
    created: Option<String>,
    #[serde(default)]
    changed: Option<String>,
}
#[cfg(windows)]
fn change_time(file: &fs::File) -> Result<Option<String>, String> {
    use std::os::windows::io::AsRawHandle;
    use windows::Win32::{Foundation::HANDLE, Storage::FileSystem::{FileBasicInfo, FILE_BASIC_INFO, GetFileInformationByHandleEx}};
    let mut info = FILE_BASIC_INFO::default();
    // The handle remains open during the query; FILE_BASIC_INFO is the required buffer.
    unsafe { GetFileInformationByHandleEx(HANDLE(file.as_raw_handle() as isize), FileBasicInfo, &mut info as *mut _ as *mut _, std::mem::size_of::<FILE_BASIC_INFO>() as u32) }
        .map_err(|e| e.to_string())?;
    if info.ChangeTime <= 0 { return Err("File change identity unavailable; retained".into()); }
    Ok(Some(info.ChangeTime.to_string()))
}
#[cfg(not(windows))]
fn change_time(_: &fs::File) -> Result<Option<String>, String> { Ok(None) }
fn digest(data: &[u8]) -> String {
    format!("{:x}", Sha256::digest(data))
}
fn reparse(meta: &fs::Metadata) -> bool {
    if meta.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        return meta.file_attributes() & 0x400 != 0;
    }
    #[cfg(not(windows))]
    {
        false
    }
}
pub fn fingerprint(path: &Path) -> Result<Fingerprint, String> {
    let meta = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if reparse(&meta) || !meta.is_file() || meta.len() > 32 * 1024 * 1024 {
        return Err("Unsafe or oversized file".into());
    }
    let file = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut result = fingerprint_bytes(&meta, &read_bounded(path, 32 * 1024 * 1024)?)?;
    result.changed = change_time(&file)?;
    Ok(result)
}
fn read_bounded(path: &Path, limit: u64) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    fs::File::open(path)
        .map_err(|e| e.to_string())?
        .take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > limit {
        return Err("File size limit reached".into());
    }
    Ok(bytes)
}
fn fingerprint_bytes(meta: &fs::Metadata, bytes: &[u8]) -> Result<Fingerprint, String> {
    if reparse(&meta) || !meta.is_file() || meta.len() > 32 * 1024 * 1024 {
        return Err("Unsafe or oversized file".into());
    }
    let nanos = |t: std::time::SystemTime| {
        t.duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos().to_string())
            .map_err(|e| e.to_string())
    };
    Ok(Fingerprint {
        digest: digest(bytes),
        length: meta.len(),
        modified: nanos(meta.modified().map_err(|e| e.to_string())?)?,
        created: meta.created().ok().and_then(|t| nanos(t).ok()),
        changed: None,
    })
}
#[derive(Serialize, Deserialize)]
struct Record {
    timestamp: String,
    destination: String,
    #[serde(default)]
    fingerprint: Option<Fingerprint>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub path: String,
    pub deleted_at: Option<String>,
    pub eligible: bool,
    pub reason: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    pub token: String,
    pub items: Vec<Item>,
    pub eligible_count: usize,
    pub preserved_count: usize,
    pub asset_count: usize,
}
struct Plan {
    _history_lock: crate::trash_history::HistoryLock,
    preview: Preview,
    notes: BTreeMap<PathBuf, Fingerprint>,
    assets: BTreeMap<PathBuf, Fingerprint>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupResult {
    pub deleted_notes: usize,
    pub deleted_assets: usize,
    pub errors: Vec<String>,
}
fn inside_trash(root: &Path, path: &Path) -> bool {
    path.strip_prefix(root).ok().is_some_and(|p|p.components().any(|c| matches!(c,Component::Normal(s) if s.to_string_lossy().eq_ignore_ascii_case("Trash"))))
}
fn checked(root: &Path, path: &Path) -> Result<(), String> {
    let relative = path
        .strip_prefix(root)
        .map_err(|_| "Outside data location")?;
    let mut current = root.to_path_buf();
    for component in relative.components() {
        if !matches!(component, Component::Normal(_)) {
            return Err("Unsafe path component".into());
        }
        current.push(component);
        if reparse(&fs::symlink_metadata(&current).map_err(|e| e.to_string())?) {
            return Err("Linked path retained".into());
        }
    }
    if !dunce::canonicalize(path)
        .map_err(|e| e.to_string())?
        .starts_with(root)
    {
        return Err("Outside data location".into());
    }
    Ok(())
}
fn read_log(path: &Path) -> Result<Vec<u8>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    if fs::metadata(path).map_err(|e| e.to_string())?.len() > MAX_LOG {
        return Err("Trash operation log is too large; cleanup stopped".into());
    }
    read_bounded(path, MAX_LOG)
}
pub fn verify_history(log: &Path) -> Result<(), String> {
    let _lock = crate::trash_history::lock(log)?;
    crate::trash_history::ensure_complete(log)?;
    let bytes = read_log(log)?;
    for line in std::str::from_utf8(&bytes).map_err(|e| e.to_string())?.lines().filter(|s| !s.trim().is_empty()) {
        let _: Record = serde_json::from_str(line).map_err(|_| "Invalid Trash operation log; cleanup stopped")?;
    }
    Ok(())
}
#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
struct Observation { fingerprint: Fingerprint, history_revision: String, since: DateTime<Utc> }

fn plan(root: &Path, log: &Path, now: DateTime<Utc>) -> Result<Plan, String> {
    let history_lock = crate::trash_history::lock(log)?;
    crate::trash_history::ensure_complete(log)?;
    let root = dunce::canonicalize(root).map_err(|e| e.to_string())?;
    if root.parent().is_none() {
        return Err("A drive root cannot be cleaned".into());
    }
    let bytes = read_log(log)?;
    let mut records = BTreeMap::new();
    for line in std::str::from_utf8(&bytes)
        .map_err(|e| e.to_string())?
        .lines()
        .filter(|s| !s.trim().is_empty())
    {
        let record: Record = serde_json::from_str(line)
            .map_err(|_| "Invalid Trash operation log; cleanup stopped")?;
        // Windows temp/config paths may use an 8.3 alias while the scan uses
        // the full canonical name. Compare identities in the same namespace.
        if let Ok(destination) = dunce::canonicalize(&record.destination) {
            if destination.starts_with(&root) {
                records.insert(destination, record);
            }
        }
    }
    let mut bodies = BTreeMap::new();
    let mut snapshot = Vec::new();
    let mut count = 0;
    let mut total = 0;
    for entry in WalkDir::new(&root).follow_links(false).sort_by_file_name() {
        let entry = entry.map_err(|e| e.to_string())?;
        count += 1;
        if count > MAX_FILES {
            return Err("Data location is too large for safe cleanup".into());
        }
        let meta = fs::symlink_metadata(entry.path()).map_err(|e| e.to_string())?;
        if reparse(&meta) {
            return Err("Linked files/folders found; cleanup stopped".into());
        }
        if !meta.is_file() {
            continue;
        }
        let relative = entry
            .path()
            .strip_prefix(&root)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .to_string();
        if entry
            .path()
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("md"))
        {
            if meta.len() > MAX_NOTE {
                return Err("Oversized note; cleanup stopped".into());
            }
            let body = String::from_utf8(read_bounded(entry.path(), MAX_NOTE)?)
                .map_err(|e| e.to_string())?;
            total += body.len() as u64;
            if total > MAX_TOTAL {
                return Err("Note scan size limit reached; cleanup stopped".into());
            }
            snapshot.push((relative, digest(body.as_bytes())));
            bodies.insert(entry.path().to_path_buf(), body);
        }
    }
    let observation_path = log.with_extension("observations.json");
    let mut observations: BTreeMap<PathBuf, Observation> = if observation_path.exists() {
        serde_json::from_slice(&read_bounded(&observation_path, MAX_LOG)?).map_err(|_| "Invalid observation history; cleanup stopped")?
    } else { BTreeMap::new() };
    let before = serde_json::to_vec(&observations).map_err(|e| e.to_string())?;
    // Only a complete, successful scan may retire an observation for this root.
    // If the same file later re-enters Trash, it starts a fresh 90-day period.
    observations.retain(|path, _| !path.starts_with(&root) || (inside_trash(&root, path) && bodies.contains_key(path)));
    let mut items = Vec::new();
    let mut notes = BTreeMap::new();
    for path in bodies.keys().filter(|p| inside_trash(&root, p)) {
        let current = fingerprint(path)?;
        let record = records.get(path);
        let mut eligible = false;
        let historical = record.and_then(|r| {
            if r.fingerprint.as_ref() == Some(&current) {
                DateTime::parse_from_rfc3339(&r.timestamp).ok().map(|d| d.with_timezone(&Utc))
            } else { None }
        });
        let effective = if let Some(time) = historical { time } else {
            let revision = match record { Some(r) => digest(&serde_json::to_vec(r).map_err(|e| e.to_string())?), None => String::new() };
            let entry = observations.entry(path.clone()).or_insert_with(|| Observation { fingerprint: current.clone(), history_revision: revision.clone(), since: now });
            if entry.fingerprint != current || entry.history_revision != revision {
                *entry = Observation { fingerprint: current.clone(), history_revision: revision, since: now };
            }
            entry.since
        };
        let reason = if now.signed_duration_since(effective).num_seconds() >= RETENTION_DAYS * 86400 {
            if notes.len() < 100 { eligible = true; "expired" } else { "batch_wait" }
        } else if historical.is_none() { "recount_90_days" } else { "within_90_days" };
        if eligible {
            notes.insert(path.clone(), current);
        }
        items.push(Item {
            path: path
                .strip_prefix(&root)
                .unwrap()
                .to_string_lossy()
                .to_string(),
            deleted_at: record.map(|r| r.timestamp.clone()),
            eligible,
            reason: reason.into(),
        });
    }
    let after = serde_json::to_vec(&observations).map_err(|e| e.to_string())?;
    if after != before {
        let temp = observation_path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
        let written = (|| -> Result<(), String> {
            let mut f = fs::OpenOptions::new().write(true).create_new(true).open(&temp).map_err(|e| e.to_string())?;
            f.write_all(&after).and_then(|_| f.sync_all()).map_err(|e| e.to_string())?;
            drop(f); fs::rename(&temp, &observation_path).map_err(|e| e.to_string())
        })();
        if written.is_err() { let _ = fs::remove_file(&temp); }
        written?;
    }
    // Image ownership and move-time identity cannot yet be proven; retain every image.
    let assets: BTreeMap<PathBuf, Fingerprint> = BTreeMap::new();
    let identity = serde_json::to_vec(&(&root, digest(&bytes), digest(&after), &snapshot, &notes, &assets))
        .map_err(|e| e.to_string())?;
    let eligible_count = notes.len();
    let preserved_count = items.len() - eligible_count;
    let asset_count = assets.len();
    Ok(Plan {
        _history_lock: history_lock,
        preview: Preview {
            token: digest(&identity),
            items,
            eligible_count,
            preserved_count,
            asset_count,
        },
        notes,
        assets,
    })
}
pub fn preview(root: &Path, log: &Path, now: DateTime<Utc>) -> Result<Preview, String> {
    Ok(plan(root, log, now)?.preview)
}

/// The caller owns NOTE_WRITE_LOCK and rechecks the enabled setting/storage location for each file.
pub fn execute<F: FnMut() -> Result<(), String>>(
    root: &Path,
    log: &Path,
    audit: &Path,
    token: &str,
    now: DateTime<Utc>,
    mut authorize: F,
) -> Result<CleanupResult, String> {
    let root = dunce::canonicalize(root).map_err(|e| e.to_string())?;
    let plan = plan(&root, log, now)?;
    if token != plan.preview.token {
        return Err("Trash changed; preview again before cleanup".into());
    }
    let mut result = CleanupResult {
        deleted_notes: 0,
        deleted_assets: 0,
        errors: Vec::new(),
    };
    let operation = uuid::Uuid::new_v4().to_string();
    for (path, expected) in plan.notes.iter().chain(plan.assets.iter()) {
        let attempt = (|| -> Result<(), String> {
            authorize()?;
            checked(&root, path)?;
            if &fingerprint(path)? != expected {
                return Err("File changed; retained".into());
            }
            let mut locked = LockedDeletion::open(&root, path, expected)?;
            if let Some(parent) = audit.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut journal = fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(audit)
                .map_err(|e| e.to_string())?;
            writeln!(journal,"{}",serde_json::json!({"operation":operation,"timestamp":Utc::now().to_rfc3339(),"path":path,"fingerprint":expected,"action":"delete_attempt"})).map_err(|e|e.to_string())?;
            journal.sync_data().map_err(|e| e.to_string())?;
            authorize()?;
            locked.delete()?;
            Ok(())
        })();
        match attempt {
            Ok(()) => {
                if plan.notes.contains_key(path) {
                    result.deleted_notes += 1
                } else {
                    result.deleted_assets += 1
                }
            }
            Err(e) => {
                result.errors.push(e);
                break;
            }
        }
    }
    Ok(result)
}
/// Pin every parent against rename/reparse replacement, then exclusively hold the
/// verified file. Deletion uses that handle, never a second pathname lookup.
#[cfg(windows)]
struct LockedDeletion {
    file: fs::File,
    _parents: Vec<fs::File>,
}
#[cfg(windows)]
impl LockedDeletion {
    fn open(root: &Path, path: &Path, expected: &Fingerprint) -> Result<Self, String> {
        use std::os::windows::fs::OpenOptionsExt;
        let mut parents = Vec::new();
        let mut ancestors: Vec<_> = path.parent().ok_or("Missing parent")?.ancestors().collect();
        ancestors.reverse();
        for parent in ancestors {
            let directory = fs::OpenOptions::new()
                .read(true)
                .share_mode(3)
                .custom_flags(0x02000000 | 0x00200000)
                .open(parent)
                .map_err(|e| e.to_string())?;
            let meta = directory.metadata().map_err(|e| e.to_string())?;
            if reparse(&meta) || !meta.is_dir() {
                return Err("Linked directory retained".into());
            }
            parents.push(directory);
        }
        checked(root, path)?;
        let mut file = fs::OpenOptions::new()
            .access_mode(0x80010000)
            .share_mode(0)
            .custom_flags(0x00200000)
            .open(path)
            .map_err(|e| e.to_string())?;
        let meta = file.metadata().map_err(|e| e.to_string())?;
        if meta.len() > 32 * 1024 * 1024 || reparse(&meta) || !meta.is_file() {
            return Err("Unsafe file retained".into());
        }
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
        let mut observed = fingerprint_bytes(&meta, &bytes)?;
        observed.changed = change_time(&file)?;
        if &observed != expected {
            return Err("File changed; retained".into());
        }
        Ok(Self {
            file,
            _parents: parents,
        })
    }
    fn delete(&mut self) -> Result<(), String> {
        use std::os::windows::io::AsRawHandle;
        use windows::Win32::{
            Foundation::{BOOLEAN, HANDLE},
            Storage::FileSystem::{
                FileDispositionInfo, SetFileInformationByHandle, FILE_DISPOSITION_INFO,
            },
        };
        let disposition = FILE_DISPOSITION_INFO {
            DeleteFile: BOOLEAN(1),
        };
        // SAFETY: file remains exclusively open; disposition is valid for this call.
        unsafe {
            SetFileInformationByHandle(
                HANDLE(self.file.as_raw_handle() as isize),
                FileDispositionInfo,
                &disposition as *const _ as *const std::ffi::c_void,
                std::mem::size_of::<FILE_DISPOSITION_INFO>() as u32,
            )
        }
        .map_err(|e| e.to_string())
    }
}
#[cfg(not(windows))]
struct LockedDeletion;
#[cfg(not(windows))]
impl LockedDeletion {
    fn open(_: &Path, _: &Path, _: &Fingerprint) -> Result<Self, String> {
        Err("Safe cleanup is supported only on Windows".into())
    }
    fn delete(&mut self) -> Result<(), String> {
        Err("Safe cleanup is supported only on Windows".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    #[test]
    fn policy_defaults_off_and_never_reactivates_after_location_change() {
        let d = tempdir().unwrap();
        let p = d.path().join("policy");
        let a = d.path().join("a");
        let b = d.path().join("b");
        assert!(!policy_enabled(&p, &a).unwrap());
        set_policy(&p, Some(&a)).unwrap();
        assert!(policy_enabled(&p, &a).unwrap());
        assert!(!policy_enabled(&p, &b).unwrap());
        set_policy(&p, None).unwrap();
        assert!(!policy_enabled(&p, &a).unwrap());
        fs::write(&p, "broken").unwrap();
        assert!(policy_enabled(&p, &a).is_err());
    }
    #[test]
    fn excess_expired_notes_wait_for_next_batch_and_oversized_files_are_retained() {
        let (_d, r, l, n) = fixture(91);
        let mut records = fs::read_to_string(&l).unwrap();
        for index in 0..100 {
            let path = r.join(format!("Trash/item{index:03}.md"));
            fs::write(&path, "expired").unwrap();
            records.push_str(&(serde_json::json!({"destination":path,"timestamp":(n-chrono::Duration::days(91)).to_rfc3339(),"fingerprint":fingerprint(&path).unwrap()}).to_string()+"\n"));
        }
        fs::write(&l, records).unwrap();
        let p = preview(&r, &l, n).unwrap();
        assert_eq!(p.eligible_count, 100);
        assert_eq!(
            p.items.iter().filter(|i| i.reason == "batch_wait").count(),
            1
        );
        let huge = r.join("Trash/huge.md");
        fs::File::create(&huge)
            .unwrap()
            .set_len(33 * 1024 * 1024)
            .unwrap();
        assert!(fingerprint(&huge).is_err());
        assert!(preview(&r, &l, n).is_err());
        assert!(huge.exists());
    }
    #[test]
    #[cfg(windows)]
    fn exclusive_handle_blocks_external_write_rename_and_parent_replacement() {
        let (_d, r, _l, _n) = fixture(91);
        let path = r.join("Trash/old.md");
        let fp = fingerprint(&path).unwrap();
        let locked = LockedDeletion::open(&r, &path, &fp).unwrap();
        assert!(fs::write(&path, "external overwrite").is_err());
        assert!(fs::rename(&path, r.join("Trash/renamed.md")).is_err());
        assert!(fs::rename(r.join("Trash"), r.join("replaced")).is_err());
        drop(locked);
        assert_eq!(
            fs::read_to_string(&path).unwrap(),
            "old ![image](assets/a.png)"
        );
        fs::write(&path, "external overwrite").unwrap();
        assert!(LockedDeletion::open(&r, &path, &fp).is_err());
    }
    fn fixture(age: i64) -> (tempfile::TempDir, PathBuf, PathBuf, DateTime<Utc>) {
        let d = tempdir().unwrap();
        let root = d.path().join("vault");
        fs::create_dir_all(root.join("Trash/assets")).unwrap();
        let note = root.join("Trash/old.md");
        fs::write(&note, "old ![image](assets/a.png)").unwrap();
        fs::write(root.join("Trash/assets/a.png"), "image").unwrap();
        let log = d.path().join("operations.jsonl");
        let now = Utc::now();
        fs::write(&log,serde_json::json!({"destination":note,"timestamp":(now-chrono::Duration::days(age)).to_rfc3339(),"fingerprint":fingerprint(&note).unwrap()}).to_string()+"\n").unwrap();
        let root = dunce::canonicalize(&root).unwrap();
        (d, root, log, now)
    }
    #[test]
    fn retention_boundary_unknown_and_modified_are_retained() {
        for age in [0, 89, 90, 91] {
            let (_d, r, l, n) = fixture(age);
            assert_eq!(
                preview(&r, &l, n).unwrap().eligible_count,
                usize::from(age >= 90)
            );
        }
        let (_d, r, l, n) = fixture(91);
        fs::write(r.join("Trash/unknown.md"), "legacy").unwrap();
        fs::write(r.join("Trash/old.md"), "changed").unwrap();
        let p = preview(&r, &l, n).unwrap();
        assert_eq!(p.eligible_count, 0);
        assert_eq!(p.preserved_count, 2);
    }
    #[test]
    fn operation_path_aliases_match_canonical_scan_but_outside_records_do_not() {
        let (_d, r, l, n) = fixture(91);
        let path = r.join("Trash/../Trash/old.md");
        fs::write(&l, serde_json::json!({"destination":path,"timestamp":(n-chrono::Duration::days(91)).to_rfc3339(),"fingerprint":fingerprint(&path).unwrap()}).to_string()+"\n").unwrap();
        assert_eq!(preview(&r, &l, n).unwrap().eligible_count, 1);
        #[cfg(windows)]
        {
            use std::os::windows::ffi::OsStrExt;
            use windows::{core::PCWSTR, Win32::Storage::FileSystem::GetShortPathNameW};
            let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
            let mut short = vec![0u16; 32768];
            // SAFETY: both buffers are valid and the source is null terminated.
            let length =
                unsafe { GetShortPathNameW(PCWSTR(wide.as_ptr()), Some(&mut short)) } as usize;
            assert!(length > 0 && length < short.len());
            let short = String::from_utf16(&short[..length]).unwrap();
            fs::write(&l, serde_json::json!({"destination":short,"timestamp":(n-chrono::Duration::days(91)).to_rfc3339(),"fingerprint":fingerprint(&path).unwrap()}).to_string()+"\n").unwrap();
            assert_eq!(preview(&r, &l, n).unwrap().eligible_count, 1);
        }
        let external = r.parent().unwrap().join("outside.md");
        fs::write(&external, "outside").unwrap();
        fs::write(&l, serde_json::json!({"destination":external,"timestamp":(n-chrono::Duration::days(91)).to_rfc3339(),"fingerprint":fingerprint(&external).unwrap()}).to_string()+"\n").unwrap();
        assert_eq!(preview(&r, &l, n).unwrap().eligible_count, 0);
        assert_eq!(fs::read_to_string(external).unwrap(), "outside");
    }
    #[test]
    fn expired_note_is_deleted_but_all_images_are_retained() {
        let (d, r, l, n) = fixture(91);
        let p = preview(&r, &l, n).unwrap();
        let result = execute(&r, &l, &d.path().join("audit"), &p.token, n, || Ok(())).unwrap();
        assert_eq!((result.deleted_notes, result.deleted_assets), (1, 0));
        assert!(result.errors.is_empty());
        assert!(!r.join("Trash/old.md").exists());
    }
    #[test]
    fn references_from_live_or_unknown_trash_notes_preserve_images() {
        for live in ["live.md", "Trash/unknown.md"] {
            let (d, r, l, n) = fixture(91);
            fs::write(r.join(live), "![shared](Trash/assets/a.png)").unwrap();
            let p = preview(&r, &l, n).unwrap();
            assert_eq!(p.asset_count, 0);
            execute(&r, &l, &d.path().join("audit"), &p.token, n, || Ok(())).unwrap();
            assert!(r.join("Trash/assets/a.png").exists());
        }
    }
    #[test]
    fn stale_preview_and_disabled_authorization_never_delete() {
        let (d, r, l, n) = fixture(91);
        let p = preview(&r, &l, n).unwrap();
        fs::write(r.join("new.md"), "new").unwrap();
        assert!(execute(&r, &l, &d.path().join("audit"), &p.token, n, || Ok(())).is_err());
        let p = preview(&r, &l, n).unwrap();
        let result = execute(&r, &l, &d.path().join("audit"), &p.token, n, || {
            Err("disabled".into())
        })
        .unwrap();
        assert_eq!(result.deleted_notes, 0);
        assert_eq!(result.errors.len(), 1);
        assert!(r.join("Trash/old.md").exists());
    }
    #[test]
    fn restored_note_is_not_selected_even_with_old_operation_record() {
        let (d, r, l, n) = fixture(91);
        fs::rename(r.join("Trash/old.md"), r.join("restored.md")).unwrap();
        let p = preview(&r, &l, n).unwrap();
        assert_eq!(p.eligible_count, 0);
        execute(&r, &l, &d.path().join("audit"), &p.token, n, || Ok(())).unwrap();
        assert!(r.join("restored.md").exists());
        assert!(r.join("Trash/assets/a.png").exists());
    }
    #[test]
    fn malformed_log_and_unwritable_journal_stop_safely() {
        let (d, r, l, n) = fixture(91);
        let p = preview(&r, &l, n).unwrap();
        let result = execute(&r, &l, d.path(), &p.token, n, || Ok(())).unwrap();
        assert_eq!(result.deleted_notes, 0);
        assert!(r.join("Trash/old.md").exists());
        fs::write(&l, "truncated {").unwrap();
        assert!(preview(&r, &l, n).is_err());
    }
    #[test]
    fn linked_directory_is_not_traversed() {
        let (d, r, l, n) = fixture(91);
        let other = d.path().join("outside");
        fs::create_dir(&other).unwrap();
        #[cfg(windows)]
        {
            // Directory junctions exercise reparse handling without symlink privilege.
            let status = std::process::Command::new("powershell.exe").args(["-NoProfile", "-NonInteractive", "-Command",
                "New-Item -ItemType Junction -Path $env:TRASH_TEST_LINK -Target $env:TRASH_TEST_TARGET | Out-Null"])
                .env("TRASH_TEST_LINK", r.join("linked")).env("TRASH_TEST_TARGET", &other).status().unwrap();
            assert!(status.success());
        }
        #[cfg(unix)]
        std::os::unix::fs::symlink(&other, r.join("linked")).unwrap();
        assert!(preview(&r, &l, n).is_err());
    }
    #[test]
    fn unknown_date_is_counted_from_first_safe_observation_and_resets_on_change() {
        let (_d, root, log, now) = fixture(91);
        fs::write(&log, "").unwrap();
        assert_eq!(preview(&root, &log, now).unwrap().eligible_count, 0);
        assert_eq!(preview(&root, &log, now + chrono::Duration::days(89)).unwrap().eligible_count, 0);
        assert_eq!(preview(&root, &log, now + chrono::Duration::days(90)).unwrap().eligible_count, 1);
        fs::write(root.join("Trash/old.md"), "changed").unwrap();
        assert_eq!(preview(&root, &log, now + chrono::Duration::days(90)).unwrap().eligible_count, 0);
        assert_eq!(preview(&root, &log, now + chrono::Duration::days(180)).unwrap().eligible_count, 1);
    }
    #[test]
    fn incomplete_move_stops_preview_without_deleting() {
        let (_d, root, log, now) = fixture(91);
        fs::write(crate::trash_history::pending_path(&log), "pending").unwrap();
        assert!(preview(&root, &log, now).is_err());
        assert!(root.join("Trash/old.md").exists());
    }
    #[test]
    fn note_reintroduced_after_absence_starts_a_fresh_retention_period() {
        let (_d, root, log, now) = fixture(91);
        fs::write(&log, "").unwrap();
        let trash = root.join("Trash/old.md");
        let outside = root.join("temporarily-restored.md");
        preview(&root, &log, now).unwrap();
        fs::rename(&trash, &outside).unwrap();
        preview(&root, &log, now + chrono::Duration::days(89)).unwrap();
        fs::rename(&outside, &trash).unwrap();
        assert_eq!(preview(&root, &log, now + chrono::Duration::days(90)).unwrap().eligible_count, 0);
        assert_eq!(preview(&root, &log, now + chrono::Duration::days(180)).unwrap().eligible_count, 1);
    }
    #[cfg(windows)]
    #[test]
    fn reintroduced_note_resets_even_without_an_intermediate_scan() {
        let (_d, root, log, now) = fixture(91);
        fs::write(&log, "").unwrap();
        let trash = root.join("Trash/old.md");
        let outside = root.join("temporarily-restored.md");
        preview(&root, &log, now).unwrap();
        fs::rename(&trash, &outside).unwrap();
        fs::rename(&outside, &trash).unwrap();
        assert_eq!(preview(&root, &log, now + chrono::Duration::days(90)).unwrap().eligible_count, 0);
    }

}
