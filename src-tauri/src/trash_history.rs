//! A small, fail-closed journal for Trash moves. No automatic repair or rollback.
use std::{fs, io::Write, path::{Path, PathBuf}, time::{Duration, Instant}};

pub struct HistoryLock { _file: fs::File }
pub fn pending_path(log: &Path) -> PathBuf { log.with_extension("pending.json") }

fn regular(file: &fs::File) -> Result<(), String> {
    let meta = file.metadata().map_err(|e| e.to_string())?;
    #[cfg(windows)] {
        use std::os::windows::fs::MetadataExt;
        if meta.file_attributes() & 0x400 != 0 { return Err("Linked history file; cleanup stopped".into()); }
    }
    if !meta.is_file() { return Err("Invalid history file; cleanup stopped".into()); }
    Ok(())
}

pub fn lock(log: &Path) -> Result<HistoryLock, String> {
    let parent = log.parent().ok_or("Missing history directory")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let lock_path = log.with_extension("jsonl.lock");
    let started = Instant::now();
    loop {
        let mut options = fs::OpenOptions::new();
        options.read(true).write(true).create(true);
        #[cfg(windows)] {
            use std::os::windows::fs::OpenOptionsExt;
            options.share_mode(0).custom_flags(0x00200000);
        }
        #[cfg(not(windows))]
        { return Err("Safe Trash journaling is supported only on Windows".into()); }
        match options.open(&lock_path) {
            Ok(file) => { regular(&file)?; return Ok(HistoryLock { _file: file }); }
            Err(error) if matches!(error.raw_os_error(), Some(32 | 33)) && started.elapsed() < Duration::from_secs(2) => {
                std::thread::sleep(Duration::from_millis(25));
            }
            Err(error) => return Err(format!("Trash history is busy or unavailable: {error}")),
        }
    }
}

pub fn ensure_complete(log: &Path) -> Result<(), String> {
    if pending_path(log).try_exists().map_err(|e| e.to_string())? {
        return Err("Incomplete Trash move; cleanup stopped. Preserve the history and review it manually.".into());
    }
    Ok(())
}

fn append_locked(log: &Path, record: &serde_json::Value) -> Result<(), String> {
    let mut bytes = serde_json::to_vec(record).map_err(|e| e.to_string())?;
    bytes.push(b'\n');
    let mut options = fs::OpenOptions::new();
    options.create(true).append(true);
    #[cfg(windows)] {
        use std::os::windows::fs::OpenOptionsExt;
        options.custom_flags(0x00200000);
    }
    let mut file = options.open(log).map_err(|e| e.to_string())?;
    regular(&file)?;
    file.write_all(&bytes).and_then(|_| file.sync_all()).map_err(|e| e.to_string())
}

pub fn append(log: &Path, record: &serde_json::Value) -> Result<(), String> {
    let _guard = lock(log)?;
    ensure_complete(log)?;
    append_locked(log, record)
}

pub struct MoveResult { pub warning: Option<String> }

/// The caller holds NOTE_WRITE_LOCK first. This lock order is also used by cleanup.
pub fn record_move<F: FnOnce() -> Result<(), String>>(
    log: &Path, source: &Path, destination: &Path, origin: &str, move_file: F,
) -> Result<MoveResult, String> {
    let _guard = lock(log)?;
    ensure_complete(log)?;
    let marker = pending_path(log);
    let pending = serde_json::json!({ "source": source, "destination": destination, "origin": origin });
    let mut file = fs::OpenOptions::new().write(true).create_new(true).open(&marker).map_err(|e| e.to_string())?;
    file.write_all(&serde_json::to_vec(&pending).map_err(|e| e.to_string())?)
        .and_then(|_| file.sync_all()).map_err(|e| e.to_string())?;
    drop(file);
    // Any interruption from this point leaves the marker. No automatic rollback is attempted.
    move_file()?;
    let commit = (|| {
        let fingerprint = crate::trash_cleanup::fingerprint(destination)?;
        append_locked(log, &serde_json::json!({ "timestamp": chrono::Utc::now().to_rfc3339(),
            "source": source, "destination": destination, "origin": origin, "fingerprint": fingerprint }))?;
        fs::remove_file(&marker).map_err(|e| e.to_string())
    })();
    Ok(MoveResult { warning: commit.err().map(|error| format!("Moved to Trash, but history could not be saved; automatic cleanup is stopped: {error}")) })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn concurrent_records_remain_complete_without_missing_ids() {
        let dir = tempfile::tempdir().unwrap(); let log = dir.path().join("history.jsonl");
        let threads: Vec<_> = (0..8).map(|worker| { let log=log.clone(); std::thread::spawn(move || {
            for item in 0..40 { append(&log, &serde_json::json!({"id": format!("{worker}-{item}")})).unwrap(); }
        }) }).collect();
        for thread in threads { thread.join().unwrap(); }
        let ids: std::collections::BTreeSet<_> = fs::read_to_string(log).unwrap().lines().map(|line|
            serde_json::from_str::<serde_json::Value>(line).unwrap()["id"].as_str().unwrap().to_string()).collect();
        assert_eq!(ids.len(), 320);
    }
    #[test]
    fn subprocess_worker() {
        let Some(log) = std::env::var_os("ONF_TEST_HISTORY") else { return; };
        let worker = std::env::var("ONF_TEST_WORKER").unwrap();
        for item in 0..25 { append(Path::new(&log), &serde_json::json!({"id":format!("{worker}-{item}")})).unwrap(); }
    }
    #[test]
    fn independent_processes_share_the_file_lock() {
        let dir = tempfile::tempdir().unwrap(); let log=dir.path().join("history.jsonl");
        let mut children: Vec<_> = (0..4).map(|worker| std::process::Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "trash_history::tests::subprocess_worker"])
            .env("ONF_TEST_HISTORY", &log).env("ONF_TEST_WORKER", worker.to_string()).spawn().unwrap()).collect();
        for child in &mut children { assert!(child.wait().unwrap().success()); }
        let records: Vec<serde_json::Value> = fs::read_to_string(log).unwrap().lines().map(|s| serde_json::from_str(s).unwrap()).collect();
        assert_eq!(records.len(), 100);
        assert_eq!(records.iter().map(|r| r["id"].as_str().unwrap()).collect::<std::collections::BTreeSet<_>>().len(),100);
    }
    #[test]
    fn interrupted_move_blocks_cleanup_and_preserves_original_data() {
        let dir=tempfile::tempdir().unwrap(); let log=dir.path().join("history.jsonl");
        let source=dir.path().join("note.md"); let dest=dir.path().join("Trash.md"); fs::write(&source,"keep me").unwrap();
        assert!(record_move(&log,&source,&dest,"test",||Err("injected move failure".into())).is_err());
        assert_eq!(fs::read_to_string(source).unwrap(),"keep me");
        assert!(ensure_complete(&log).is_err());
        assert!(pending_path(&log).exists());
    }
    #[test]
    fn failure_after_move_reports_moved_and_keeps_stop_marker() {
        let dir=tempfile::tempdir().unwrap(); let log=dir.path().join("history.jsonl"); fs::create_dir(&log).unwrap();
        let source=dir.path().join("note.md"); let dest=dir.path().join("Trash.md"); fs::write(&source,"keep me").unwrap();
        let result=record_move(&log,&source,&dest,"test",||fs::rename(&source,&dest).map_err(|e|e.to_string())).unwrap();
        assert!(result.warning.is_some()); assert!(!source.exists()); assert!(dest.exists());
        assert!(ensure_complete(&log).is_err());
    }
    #[test]
    fn completed_move_has_one_synced_record_and_no_pending_marker() {
        let dir=tempfile::tempdir().unwrap(); let log=dir.path().join("history.jsonl");
        let source=dir.path().join("note.md"); let dest=dir.path().join("Trash.md"); fs::write(&source,"keep me").unwrap();
        assert!(record_move(&log,&source,&dest,"test",||fs::rename(&source,&dest).map_err(|e|e.to_string())).unwrap().warning.is_none());
        ensure_complete(&log).unwrap();
        let record:serde_json::Value=serde_json::from_str(fs::read_to_string(log).unwrap().trim()).unwrap();
        assert_eq!(record["origin"],"test"); assert!(record["fingerprint"].is_object());
    }
}
