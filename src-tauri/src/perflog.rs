/*
 * Opt-in performance logging.
 *
 * The user-facing path never performs file I/O: events are offered to a
 * bounded channel and a dedicated worker appends them later. If the channel
 * is full, measurement is dropped instead of delaying the application.
 */

use chrono::Local;
use serde::Serialize;
use serde_json::Value;
use std::fs::OpenOptions;
use std::io::{BufWriter, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{sync_channel, SyncSender, TrySendError};
use std::sync::OnceLock;

const QUEUE_CAPACITY: usize = 256;
static PERF_SENDER: OnceLock<Option<SyncSender<PerfEvent>>> = OnceLock::new();
static PERF_ENABLED: OnceLock<bool> = OnceLock::new();
static DROPPED_EVENTS: AtomicU64 = AtomicU64::new(0);

#[derive(Serialize)]
pub struct PerfEvent {
    pub ts: String,
    pub run_id: String,
    pub event: String,
    pub label: Option<String>,
    pub elapsed_ms: Option<u64>,
    pub meta: Value,
    pub dropped_before: u64,
}

fn measurement_enabled(value: Option<&str>) -> bool {
    value.is_some_and(|value| !value.trim().is_empty())
}

/// Explicit opt-in keeps normal debug and release runs free of measurement work.
pub fn enabled() -> bool {
    *PERF_ENABLED.get_or_init(|| measurement_enabled(std::env::var("PERF_LOG").ok().as_deref()))
}

/// Keeps argument construction (including `json!`) out of normal executions.
#[macro_export]
macro_rules! perf_event {
    ($run_id:expr, $event:expr, $label:expr, $elapsed_ms:expr, $meta:expr $(,)?) => {{
        if crate::perflog::enabled() {
            crate::perflog::log_event($run_id, $event, $label, $elapsed_ms, $meta)
        } else {
            false
        }
    }};
}

fn perf_log_path() -> Result<PathBuf, String> {
    let path = std::env::var("PERF_LOG").map_err(|_| "PERF_LOG not set".to_string())?;
    Ok(PathBuf::from(path))
}

fn contains_sensitive_key(value: &Value) -> bool {
    match value {
        Value::Object(map) => map.iter().any(|(key, value)| {
            matches!(
                key.to_ascii_lowercase().as_str(),
                "path" | "body" | "query" | "title" | "content"
            ) || contains_sensitive_key(value)
        }),
        Value::Array(values) => values.iter().any(contains_sensitive_key),
        _ => false,
    }
}

fn write_event(writer: &mut impl Write, event: &PerfEvent) -> std::io::Result<()> {
    serde_json::to_writer(&mut *writer, event)?;
    writer.write_all(b"\n")
}

fn start_worker() -> Option<SyncSender<PerfEvent>> {
    let path = perf_log_path().ok()?;
    let (sender, receiver) = sync_channel::<PerfEvent>(QUEUE_CAPACITY);
    std::thread::Builder::new()
        .name("fusen-perflog".to_string())
        .spawn(move || {
            if let Some(parent) = path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let Ok(file) = OpenOptions::new().create(true).append(true).open(&path) else {
                return;
            };
            let mut writer = BufWriter::new(file);
            while let Ok(event) = receiver.recv() {
                let _ = write_event(&mut writer, &event);
                while let Ok(event) = receiver.try_recv() {
                    let _ = write_event(&mut writer, &event);
                }
                let _ = writer.flush();
            }
        })
        .ok()?;
    Some(sender)
}

/// Non-blocking. Returns false when disabled, unsafe, unavailable, or full.
pub fn log_event(
    run_id: &str,
    event: &str,
    label: Option<&str>,
    elapsed_ms: Option<u64>,
    meta: Value,
) -> bool {
    if !enabled() || contains_sensitive_key(&meta) {
        return false;
    }

    let Some(sender) = PERF_SENDER.get_or_init(start_worker).as_ref() else {
        return false;
    };

    let event = PerfEvent {
        ts: Local::now().to_rfc3339(),
        run_id: run_id.to_string(),
        event: event.to_string(),
        label: label.map(str::to_string),
        elapsed_ms,
        meta,
        dropped_before: DROPPED_EVENTS.swap(0, Ordering::Relaxed),
    };
    match sender.try_send(event) {
        Ok(()) => true,
        Err(TrySendError::Full(_) | TrySendError::Disconnected(_)) => {
            DROPPED_EVENTS.fetch_add(1, Ordering::Relaxed);
            false
        }
    }
}

fn valid_note_ready(run_id: &str, elapsed_ms: u64) -> bool {
    !run_id.is_empty() && run_id.len() <= 128 && elapsed_ms <= 60_000
}

pub fn log_note_ready(run_id: &str, elapsed_ms: u64) -> Result<(), String> {
    if !valid_note_ready(run_id, elapsed_ms) {
        return Err("invalid performance completion".to_string());
    }
    crate::perf_event!(
        run_id,
        "NOTE_EDITOR_READY",
        None,
        Some(elapsed_ms),
        serde_json::json!({ "status": "success" }),
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn event(meta: Value) -> PerfEvent {
        PerfEvent {
            ts: "2026-07-14T00:00:00+09:00".to_string(),
            run_id: "run-1".to_string(),
            event: "ready".to_string(),
            label: None,
            elapsed_ms: Some(12),
            meta,
            dropped_before: 0,
        }
    }

    #[test]
    fn measurement_requires_explicit_non_empty_path() {
        assert!(!measurement_enabled(None));
        assert!(!measurement_enabled(Some("  ")));
        assert!(measurement_enabled(Some("C:/tmp/perf.jsonl")));
    }

    #[test]
    fn bounded_queue_never_waits_when_full() {
        let (sender, _receiver) = sync_channel(1);
        sender.try_send(event(serde_json::json!({}))).unwrap();
        assert!(matches!(
            sender.try_send(event(serde_json::json!({}))),
            Err(TrySendError::Full(_))
        ));
    }

    #[test]
    fn sensitive_metadata_is_rejected_recursively() {
        assert!(contains_sensitive_key(
            &serde_json::json!({"query": "secret"})
        ));
        assert!(contains_sensitive_key(
            &serde_json::json!({"safe": {"path": "secret"}})
        ));
        assert!(!contains_sensitive_key(
            &serde_json::json!({"result_count": 3})
        ));
    }

    #[test]
    fn event_is_one_parseable_json_line() {
        let mut output = Vec::new();
        write_event(&mut output, &event(serde_json::json!({"result_count": 3}))).unwrap();
        assert_eq!(output.iter().filter(|byte| **byte == b'\n').count(), 1);
        let parsed: Value = serde_json::from_slice(&output).unwrap();
        assert_eq!(parsed["event"], "ready");
        assert_eq!(parsed["meta"]["result_count"], 3);
    }

    #[test]
    fn note_ready_completion_has_strict_bounds() {
        assert!(valid_note_ready("run-1", 60_000));
        assert!(!valid_note_ready("", 10));
        assert!(!valid_note_ready(&"x".repeat(129), 10));
        assert!(!valid_note_ready("run-1", 60_001));
    }
}
