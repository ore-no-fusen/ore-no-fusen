//! Timing state for infrequent maintenance, independent of backup consent.
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, fs, io::Write, path::Path, sync::Mutex};

pub static HEAVY_LOCK: Mutex<()> = Mutex::new(());
const INTERVAL_SECONDS: i64 = 24 * 60 * 60;

#[derive(Default, Serialize, Deserialize)]
struct State { attempts: BTreeMap<String, DateTime<Utc>> }

pub fn due(previous: Option<DateTime<Utc>>, now: DateTime<Utc>) -> bool {
    previous.map_or(true, |last| now.signed_duration_since(last).num_seconds() >= INTERVAL_SECONDS)
}

/// Persist the attempt before running. Failed attempts also wait until the next day.
pub fn claim(path: &Path, root: &Path, kind: &str, now: DateTime<Utc>) -> Result<bool, String> {
    let _lock = crate::trash_history::lock(path)?;
    let mut state: State = if path.exists() {
        let bytes = fs::read(path).map_err(|e| e.to_string())?;
        if bytes.len() > 1024 * 1024 { return Err("Maintenance state too large".into()); }
        serde_json::from_slice(&bytes).map_err(|e| e.to_string())?
    } else { State::default() };
    let key = format!("{}|{}", root.display(), kind);
    if !due(state.attempts.get(&key).copied(), now) { return Ok(false); }
    state.attempts.insert(key, now);
    let temporary = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut file = fs::OpenOptions::new().write(true).create_new(true).open(&temporary).map_err(|e| e.to_string())?;
        file.write_all(&serde_json::to_vec(&state).map_err(|e| e.to_string())?).and_then(|_| file.sync_all()).map_err(|e| e.to_string())?;
        drop(file);
        fs::rename(&temporary, path).map_err(|e| e.to_string())
    })();
    if result.is_err() { let _ = fs::remove_file(&temporary); }
    result.map(|_| true)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn daily_boundary_and_clock_rollback_are_safe() {
        let now=Utc::now();
        assert!(due(None,now));
        assert!(!due(Some(now),now+chrono::Duration::hours(23)));
        assert!(due(Some(now),now+chrono::Duration::hours(24)));
        assert!(!due(Some(now),now-chrono::Duration::hours(1)));
    }
    #[test]
    fn attempts_survive_restart_and_are_independent_per_root_and_kind() {
        let dir=tempfile::tempdir().unwrap(); let path=dir.path().join("maintenance.json"); let now=Utc::now();
        assert!(claim(&path,Path::new("root-a"),"trash",now).unwrap());
        assert!(!claim(&path,Path::new("root-a"),"trash",now+chrono::Duration::hours(23)).unwrap());
        assert!(claim(&path,Path::new("root-a"),"backup",now).unwrap());
        assert!(claim(&path,Path::new("root-b"),"trash",now).unwrap());
        assert!(claim(&path,Path::new("root-a"),"trash",now+chrono::Duration::hours(24)).unwrap());
    }
}
