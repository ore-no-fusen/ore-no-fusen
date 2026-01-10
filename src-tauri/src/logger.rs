use std::fs::{OpenOptions, create_dir_all, metadata, File};
use std::io::{Write, BufRead, BufReader};
use std::path::PathBuf;
use chrono::Local;

const MAX_LOG_SIZE: u64 = 5 * 1024 * 1024; // 5MB
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

/// ログファイルのパスを取得
/// インストールフォルダ（%LOCALAPPDATA%\ore-no-fusen\）に配置
pub fn get_log_path() -> Result<PathBuf, String> {
    let app_data = std::env::var("LOCALAPPDATA")
        .map_err(|_| "LOCALAPPDATA not found".to_string())?;
    let log_dir = PathBuf::from(app_data).join("ore-no-fusen");
    create_dir_all(&log_dir).map_err(|e| format!("Failed to create log directory: {}", e))?;
    Ok(log_dir.join("app.log"))
}

/// ログローテーション（サイズ制限）
fn rotate_log_if_needed(path: &PathBuf) -> Result<(), String> {
    if let Ok(meta) = metadata(path) {
        if meta.len() > MAX_LOG_SIZE {
            // 最後の1000行だけ残す
            if let Ok(file) = File::open(path) {
                let reader = BufReader::new(file);
                let lines: Vec<String> = reader.lines()
                    .filter_map(|l| l.ok())
                    .collect();
                
                let keep_lines = if lines.len() > 1000 {
                    &lines[lines.len() - 1000..]
                } else {
                    &lines[..]
                };
                
                if let Ok(mut new_file) = OpenOptions::new()
                    .write(true)
                    .truncate(true)
                    .open(path)
                {
                    for line in keep_lines {
                        let _ = writeln!(new_file, "{}", line);
                    }
                }
            }
        }
    }
    Ok(())
}

/// ログを書き込む内部関数
fn write_log(level: &str, message: &str) {
    if let Ok(path) = get_log_path() {
        let _ = rotate_log_if_needed(&path);
        
        if let Ok(mut file) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
        {
            let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S");
            let _ = writeln!(file, "[{}] [{}] {}", timestamp, level, message);
        }
    }
}

/// アプリケーション起動ログ
pub fn log_app_start() {
    write_log("INFO", &format!("ore-no-fusen v{} started (OS: {})", APP_VERSION, std::env::consts::OS));
}

/// デバッグログを出力（開発版のみ）
pub fn log_debug(message: &str) {
    // リリースビルドではDEBUGログを出力しない
    if cfg!(debug_assertions) {
        write_log("DEBUG", message);
    }
}

/// 情報ログを出力
pub fn log_info(message: &str) {
    write_log("INFO", message);
}

/// 警告ログを出力
pub fn log_warn(message: &str) {
    write_log("WARN", message);
}

/// エラーログを出力（必ず記録される）
pub fn log_error(message: &str) {
    write_log("ERROR", message);
    // フォールバック: コンソールにも出力（開発時用）
    eprintln!("[ERROR] {}", message);
}

/// 操作ログ（ユーザーアクション）
pub fn log_action(action: &str) {
    write_log("ACTION", action);
}

/// パスを安全な形式に変換（プライバシー保護）
/// フルパスではなく、ファイル名のみ記録
pub fn sanitize_path(path: &str) -> String {
    if let Some(filename) = std::path::Path::new(path).file_name() {
        filename.to_string_lossy().to_string()
    } else {
        "[unknown]".to_string()
    }
}
