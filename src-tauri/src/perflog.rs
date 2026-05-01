/*
 * パフォーマンスログ基盤 (perflog)
 *
 * 責務:
 * - JSON Lines 形式で構造化ログを %LOCALAPPDATA%\ore-no-fusen\perf.jsonl に記録
 * - Ctrl+N → T2_READY の計測に使用する（T0 / T1_RUST_ENTER / T2_READY）
 * - Mutex で書き込み排他（並列書き込みで改行が混ざらない）
 * - PERF_LOG 環境変数でパスを上書き可能（テスト用）
 * - path を含めない（プライバシー保護 / Sentry リーク対策）
 */

use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use chrono::Local;
use serde::Serialize;
use serde_json::Value;

/// ファイル書き込みを排他する Mutex
static PERF_LOG_MUTEX: Mutex<()> = Mutex::new(());

/// パフォーマンスイベント（JSON Lines 1 行分）
#[derive(Serialize)]
pub struct PerfEvent {
    pub ts: String,
    pub run_id: String,
    pub event: String,
    pub label: Option<String>,
    pub elapsed_ms: Option<u64>,
    pub meta: Value,
}

/// perf.jsonl のパスを返す
/// 環境変数 PERF_LOG が設定されていれば優先（テスト・CI 用）
fn perf_log_path() -> Result<PathBuf, String> {
    if let Ok(override_path) = std::env::var("PERF_LOG") {
        return Ok(PathBuf::from(override_path));
    }
    let app_data = std::env::var("LOCALAPPDATA")
        .map_err(|_| "LOCALAPPDATA not found".to_string())?;
    let log_dir = PathBuf::from(app_data).join("ore-no-fusen");
    std::fs::create_dir_all(&log_dir)
        .map_err(|e| format!("Failed to create perf log directory: {}", e))?;
    Ok(log_dir.join("perf.jsonl"))
}

/// JSON Lines 1 行を perf.jsonl に append する
///
/// - `run_id`: 1 回の Ctrl+N 操作を識別する UUID 等の文字列
/// - `event`:  "T0" / "T1_RUST_ENTER" / "T2_READY" など
/// - `label`:  任意の追加ラベル（None 可）
/// - `elapsed_ms`: T0 からの経過 ms（T0 自身は None）
/// - `meta`:   追加情報（path は含めない。絶対パスは sanitize_path 経由で除去済みであること）
pub fn log_event(
    run_id: &str,
    event: &str,
    label: Option<&str>,
    elapsed_ms: Option<u64>,
    meta: Value,
) {
    let ev = PerfEvent {
        ts: Local::now().to_rfc3339(),
        run_id: run_id.to_string(),
        event: event.to_string(),
        label: label.map(|s| s.to_string()),
        elapsed_ms,
        meta,
    };

    let line = match serde_json::to_string(&ev) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[perflog] serialize error: {}", e);
            return;
        }
    };

    if cfg!(debug_assertions) {
        println!("[perflog] {}", line);
    }

    let path = match perf_log_path() {
        Ok(p) => p,
        Err(e) => {
            eprintln!("[perflog] path error: {}", e);
            return;
        }
    };

    let _guard = PERF_LOG_MUTEX.lock().unwrap_or_else(|p| p.into_inner());

    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        let _ = writeln!(file, "{}", line);
    } else {
        eprintln!("[perflog] failed to open: {:?}", path);
    }
}

// ============================================================
// テスト
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader};
    use std::fs::File;
    use tempfile::tempdir;

    /// テスト用: 指定パスに直接 JSON Lines 1 行を append する内部関数
    fn log_event_to(
        path: &std::path::Path,
        run_id: &str,
        event: &str,
        label: Option<&str>,
        elapsed_ms: Option<u64>,
        meta: serde_json::Value,
    ) {
        let ev = PerfEvent {
            ts: chrono::Local::now().to_rfc3339(),
            run_id: run_id.to_string(),
            event: event.to_string(),
            label: label.map(|s| s.to_string()),
            elapsed_ms,
            meta,
        };
        let line = serde_json::to_string(&ev).unwrap();
        let _guard = PERF_LOG_MUTEX.lock().unwrap_or_else(|p| p.into_inner());
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .unwrap();
        writeln!(file, "{}", line).unwrap();
    }

    /// Test 1: log_event_to を 3 回呼んで perf.jsonl に 3 行書かれていることを検証
    #[test]
    fn test_log_event_writes_three_lines() {
        let dir = tempdir().unwrap();
        let perf_path = dir.path().join("perf.jsonl");

        log_event_to(&perf_path, "run-abc", "T0", None, None, serde_json::json!({}));
        log_event_to(&perf_path, "run-abc", "T1_RUST_ENTER", None, Some(10), serde_json::json!({}));
        log_event_to(&perf_path, "run-abc", "T2_READY", None, Some(150), serde_json::json!({}));

        let file = File::open(&perf_path).expect("perf.jsonl が作成されていること");
        let reader = BufReader::new(file);
        let lines: Vec<String> = reader.lines().filter_map(|l| l.ok()).collect();
        assert_eq!(lines.len(), 3, "3 行書かれているべき");
    }

    /// Test 2: 同 run_id の 3 イベントを書いた後、parse して event 配列が 3 要素であることを検証
    #[test]
    fn test_log_event_parseable_and_groupable() {
        let dir = tempdir().unwrap();
        let perf_path = dir.path().join("perf2.jsonl");

        let run_id = "run-xyz";
        log_event_to(&perf_path, run_id, "T0", None, None, serde_json::json!({}));
        log_event_to(&perf_path, run_id, "T1_RUST_ENTER", Some("rust"), Some(8), serde_json::json!({}));
        log_event_to(&perf_path, run_id, "T2_READY", None, Some(200), serde_json::json!({}));

        let file = File::open(&perf_path).expect("perf.jsonl が作成されていること");
        let reader = BufReader::new(file);
        let events: Vec<serde_json::Value> = reader
            .lines()
            .filter_map(|l| l.ok())
            .map(|l| serde_json::from_str(&l).expect("各行が JSON として parse できること"))
            .collect();

        // run_id でグルーピングしたとき 3 要素
        let grouped: Vec<&serde_json::Value> = events
            .iter()
            .filter(|ev| ev["run_id"].as_str() == Some(run_id))
            .collect();
        assert_eq!(grouped.len(), 3, "同 run_id のイベントが 3 個存在するべき");

        // elapsed_ms の存在確認
        let t2 = grouped.iter().find(|ev| ev["event"].as_str() == Some("T2_READY")).unwrap();
        assert_eq!(t2["elapsed_ms"].as_u64(), Some(200));
    }
}
