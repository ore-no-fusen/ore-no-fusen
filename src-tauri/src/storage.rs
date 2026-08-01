/*
 * ストレージ層 (File I/O)
 *
 * 責務:
 * - ローカルファイルシステムへのアクセス（読み書き、リネーム、削除）
 * - 設定ファイルの永続化
 * - ディレクトリ操作（作成、走査）
 */

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use walkdir::WalkDir;
use sha2::{Digest, Sha256};
use crate::state::{Note, NoteMeta};
use crate::logic;

pub const RECIPES_DIR_NAME: &str = "Recipes";
pub const QA_DIR_NAME: &str = "QA";
pub const TERMS_DIR_NAME: &str = "Terms";
static SETTINGS_IO_LOCK: Mutex<()> = Mutex::new(());

// UC-01: 設定ファイル管理
pub use crate::state::Settings;

pub fn get_settings_path() -> Result<PathBuf, String> {
    let app_data = std::env::var("APPDATA").map_err(|_| "APPDATA not found".to_string())?;
    let config_dir = PathBuf::from(app_data).join("OreNoFusen");
    fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    Ok(config_dir.join("settings.json"))
}

pub fn append_trash_operation(source: &Path, destination: &Path, origin: &str) -> Result<(), String> {
    use std::io::Write;

    let settings_path = get_settings_path()?;
    let config_dir = settings_path.parent().ok_or("config directory not found")?;
    fs::create_dir_all(config_dir).map_err(|e| e.to_string())?;
    let log_path = config_dir.join("trash_operations.jsonl");
    let record = serde_json::json!({
        "timestamp": chrono::Local::now().to_rfc3339(),
        "source": source.to_string_lossy(),
        "destination": destination.to_string_lossy(),
        "origin": origin,
    });
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
        .map_err(|e| e.to_string())?;
    writeln!(file, "{}", record).map_err(|e| e.to_string())
}

pub fn load_settings() -> Result<Settings, String> {
    let _guard = SETTINGS_IO_LOCK.lock().unwrap_or_else(|p| p.into_inner());
    let path = get_settings_path()?;
    if !path.exists() {
        return Ok(Settings::default());
    }

    match read_settings_file(&path) {
        Ok(settings) => Ok(settings),
        Err(primary_error) => {
            let backup_path = settings_backup_path(&path);
            if !backup_path.exists() {
                return Err(format!(
                    "settings.json is invalid and no backup exists: {}",
                    primary_error
                ));
            }
            read_settings_file(&backup_path).map_err(|backup_error| {
                format!(
                    "settings.json and its backup are invalid: primary={}; backup={}",
                    primary_error, backup_error
                )
            })
        }
    }
}

pub fn save_settings(settings: &Settings) -> Result<(), String> {
    if let Some(base_path) = &settings.base_path {
        validate_storage_path(base_path)?;
    }

    let _guard = SETTINGS_IO_LOCK.lock().unwrap_or_else(|p| p.into_inner());
    let path = get_settings_path()?;
    let temp_path = path.with_extension("json.tmp");
    let rollback_path = path.with_extension("json.rollback");
    let backup_path = settings_backup_path(&path);
    let content = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;

    let _ = fs::remove_file(&temp_path);
    let _ = fs::remove_file(&rollback_path);

    let mut temp_file = fs::File::create(&temp_path).map_err(|e| e.to_string())?;
    temp_file
        .write_all(content.as_bytes())
        .and_then(|_| temp_file.sync_all())
        .map_err(|e| {
            let _ = fs::remove_file(&temp_path);
            e.to_string()
        })?;
    drop(temp_file);

    // 書き込んだ一時ファイルを実際の Settings として再読込できる場合だけ交換する。
    read_settings_file(&temp_path).map_err(|e| {
        let _ = fs::remove_file(&temp_path);
        format!("temporary settings validation failed: {}", e)
    })?;

    if path.exists() {
        // 壊れた現行ファイルで、最後の正常バックアップを上書きしない。
        if read_settings_file(&path).is_ok() {
            fs::copy(&path, &backup_path).map_err(|e| {
                let _ = fs::remove_file(&temp_path);
                format!("failed to preserve settings backup: {}", e)
            })?;
        }

        fs::rename(&path, &rollback_path).map_err(|e| {
            let _ = fs::remove_file(&temp_path);
            format!("failed to stage current settings: {}", e)
        })?;
    }

    if let Err(e) = fs::rename(&temp_path, &path) {
        if rollback_path.exists() {
            let _ = fs::rename(&rollback_path, &path);
        }
        let _ = fs::remove_file(&temp_path);
        return Err(format!("failed to install new settings: {}", e));
    }

    let _ = fs::remove_file(&rollback_path);
    Ok(())
}

fn settings_backup_path(settings_path: &Path) -> PathBuf {
    settings_path.with_extension("json.bak")
}

fn read_settings_file(path: &Path) -> Result<Settings, String> {
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

fn corrupt_settings_archive_path(
    settings_path: &Path,
    timestamp: &str,
    backup: bool,
) -> PathBuf {
    let file_name = if backup {
        format!("settings.backup-corrupt-{}.json", timestamp)
    } else {
        format!("settings.corrupt-{}.json", timestamp)
    };
    settings_path.parent().unwrap_or(Path::new(".")).join(file_name)
}

/// 両方とも存在し、両方とも読めない設定だけを、安全な既定設定へ置き換える。
/// テストで任意の設定パスを使えるよう、I/O本体はパス引数で分離する。
fn recover_corrupt_settings_at(
    settings_path: &Path,
    base_path: &Path,
    timestamp: &str,
) -> Result<Settings, String> {
    let backup_path = settings_backup_path(settings_path);
    if !settings_path.exists()
        || !backup_path.exists()
        || read_settings_file(settings_path).is_ok()
        || read_settings_file(&backup_path).is_ok()
    {
        return Err("settings primary and backup are not both invalid".to_string());
    }

    fs::create_dir_all(base_path)
        .map_err(|e| format!("failed to create recovery vault: {}", e))?;
    check_storage_health(&base_path.to_string_lossy())?;

    let primary_archive = corrupt_settings_archive_path(settings_path, timestamp, false);
    let backup_archive = corrupt_settings_archive_path(settings_path, timestamp, true);
    fs::copy(settings_path, &primary_archive)
        .map_err(|e| format!("failed to archive corrupt settings: {}", e))?;
    if let Err(e) = fs::copy(&backup_path, &backup_archive) {
        let _ = fs::remove_file(&primary_archive);
        return Err(format!("failed to archive corrupt settings backup: {}", e));
    }

    let mut settings = Settings::default();
    settings.base_path = Some(base_path.to_string_lossy().to_string());
    let content = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    let temp_path = settings_path.with_extension("json.recovery.tmp");
    let write_result = (|| -> Result<(), String> {
        let mut file = fs::File::create(&temp_path).map_err(|e| e.to_string())?;
        file.write_all(content.as_bytes())
            .and_then(|_| file.sync_all())
            .map_err(|e| e.to_string())?;
        drop(file);
        read_settings_file(&temp_path)
            .map_err(|e| format!("recovered settings validation failed: {}", e))?;
        fs::remove_file(settings_path).map_err(|e| e.to_string())?;
        fs::remove_file(&backup_path).map_err(|e| e.to_string())?;
        fs::rename(&temp_path, settings_path).map_err(|e| e.to_string())?;
        fs::copy(settings_path, &backup_path).map_err(|e| e.to_string())?;
        read_settings_file(settings_path)?;
        read_settings_file(&backup_path)?;
        Ok(())
    })();
    if let Err(e) = write_result {
        let _ = fs::remove_file(&temp_path);
        let _ = fs::remove_file(settings_path);
        let _ = fs::remove_file(&backup_path);
        let _ = fs::copy(&primary_archive, settings_path);
        let _ = fs::copy(&backup_archive, &backup_path);
        return Err(format!("failed to install recovered settings: {}", e));
    }

    Ok(settings)
}

pub fn recover_corrupt_settings_to_safe_default() -> Result<Settings, String> {
    let _guard = SETTINGS_IO_LOCK.lock().unwrap_or_else(|p| p.into_inner());
    let settings_path = get_settings_path()?;
    let timestamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let documents = std::env::var("USERPROFILE")
        .map(|home| PathBuf::from(home).join("Documents").join("OreNoFusen"));
    let app_managed = settings_path
        .parent()
        .unwrap_or(Path::new("."))
        .join("Notes");

    let base_path = documents
        .ok()
        .filter(|path| {
            fs::create_dir_all(path).is_ok()
                && check_storage_health(&path.to_string_lossy()).is_ok()
        })
        .unwrap_or(app_managed);

    recover_corrupt_settings_at(&settings_path, &base_path, &timestamp)
}

fn recovery_draft_path(note_path: &str) -> Result<PathBuf, String> {
    let settings_path = get_settings_path()?;
    let config_dir = settings_path.parent().ok_or("config directory not found")?;
    let recovery_dir = config_dir.join("recovery-drafts");
    let digest = Sha256::digest(note_path.to_lowercase().as_bytes());
    Ok(recovery_dir.join(format!("{:x}.md", digest)))
}

/// 通常保存が失敗した場合だけ、最新内容をアプリ管理領域へ退避する。
pub fn save_recovery_draft(note_path: &str, content: &str) -> Result<(), String> {
    let draft_path = recovery_draft_path(note_path)?;
    let recovery_dir = draft_path.parent().ok_or("recovery directory not found")?;
    fs::create_dir_all(recovery_dir).map_err(|e| e.to_string())?;
    write_note(&draft_path.to_string_lossy(), content)
}

pub fn clear_recovery_draft(note_path: &str) {
    let Ok(draft_path) = recovery_draft_path(note_path) else {
        return;
    };
    if draft_path.exists() {
        let _ = fs::remove_file(draft_path);
    }
}

/// 通常ファイルより新しい復旧コピーだけを返す。
pub fn load_newer_recovery_draft(note_path: &str) -> Option<String> {
    let draft_path = recovery_draft_path(note_path).ok()?;
    let note_modified = fs::metadata(note_path).ok()?.modified().ok()?;
    let draft_modified = fs::metadata(&draft_path).ok()?.modified().ok()?;
    if draft_modified <= note_modified {
        return None;
    }
    fs::read_to_string(draft_path).ok()
}

pub fn ensure_directory(path: &str) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|e| e.to_string())
}

/// 保存先が現在読み書き可能かを、既存データを変更せずに確認する。
pub fn check_storage_health(path: &str) -> Result<(), String> {
    let target = Path::new(path);
    if !target.exists() {
        return Err("保存先フォルダが見つかりません".to_string());
    }
    if !target.is_dir() {
        return Err("保存先に指定された場所はフォルダではありません".to_string());
    }

    fs::read_dir(target)
        .map_err(|e| format!("保存先フォルダを読み取れません: {}", e))?;

    let probe_name = format!(
        ".fusen_storage_probe_{}_{}.tmp",
        std::process::id(),
        chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
    );
    let probe_path = target.join(probe_name);
    let probe_result = (|| -> Result<(), String> {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&probe_path)
            .map_err(|e| format!("保存先フォルダへ書き込めません: {}", e))?;
        file.write_all(b"OreNoFusen storage health check")
            .and_then(|_| file.sync_all())
            .map_err(|e| format!("保存先への書き込みを完了できません: {}", e))
    })();

    let remove_result = fs::remove_file(&probe_path);
    probe_result?;
    remove_result.map_err(|e| format!("保存先の確認用ファイルを削除できません: {}", e))?;
    Ok(())
}

pub fn validate_storage_path(path: &str) -> Result<(), String> {
    if is_dangerous_storage_path(path) {
        return Err("危険な保存先のため使用できません".to_string());
    }

    Ok(())
}

pub fn is_dangerous_storage_path(path: &str) -> bool {
    let target = Path::new(path);
    let normalized = dunce::canonicalize(target).unwrap_or_else(|_| target.to_path_buf());

    is_path_under(&normalized, Path::new(r"C:\Program Files\WindowsApps"))
        || std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(|parent| parent.to_path_buf()))
            .map_or(false, |exe_dir| is_path_under(&normalized, &exe_dir))
        || (crate::distribution::is_msix_packaged()
            && std::env::current_exe()
                .ok()
                .and_then(|exe| exe.parent().map(|parent| parent.to_path_buf()))
                .map_or(false, |exe_dir| is_path_under(&normalized, &exe_dir)))
}

#[cfg(windows)]
fn is_path_under(path: &Path, parent: &Path) -> bool {
    let path_str = path.to_string_lossy().replace('/', "\\").to_lowercase();
    let mut parent_str = parent.to_string_lossy().replace('/', "\\").to_lowercase();
    while parent_str.ends_with('\\') && parent_str.len() > 3 {
        parent_str.pop();
    }

    path_str == parent_str || path_str.starts_with(&format!("{}\\", parent_str))
}

#[cfg(not(windows))]
fn is_path_under(path: &Path, parent: &Path) -> bool {
    path.starts_with(parent)
}

// UC-02: インポート機能（.mdファイルをコピー + Δ0.7形式フロントマター生成）
pub fn import_files(source_dir: &str, dest_dir: &str) -> Result<usize, String> {
    let mut count = 0;
    
    for entry in WalkDir::new(source_dir).max_depth(1).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "md") {
                // 1. ファイルを読み込む
                let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
                
                // 2. 既存のフロントマターを削除して本文を抽出
                let body = extract_body_without_frontmatter(&content);
                
                // 3. 1行目を取得してcontextを生成
                let first_line = body.lines()
                    .map(|l| l.trim())
                    .find(|l| !l.is_empty() && !l.starts_with("!["))
                    .unwrap_or("imported");
                let safe_context = logic::sanitize_context(first_line);
                let context = if safe_context.is_empty() { 
                    "imported".to_string() 
                } else { 
                    safe_context 
                };
                
                // 4. 新しいseqとファイル名を生成
                let seq = get_next_seq(dest_dir);
                let today = chrono::Local::now().format("%Y-%m-%d").to_string();
                let new_filename = logic::generate_filename(seq, &today, &context);
                
                // 5. 新しいフロントマターを生成（Δ0.7完全形式）
                let frontmatter = logic::generate_frontmatter(
                    seq, 
                    &context, 
                    &today,  // created
                    &today,  // updated
                    Some("#f7e9b0"),
                    &[],
                    None, // folded
                    None,
                    None
                );
                
                // 6. 新しい内容を作成して保存
                let new_content = format!("{}\n\n{}", frontmatter, body);
                let dest_path = PathBuf::from(dest_dir).join(new_filename);
                fs::write(dest_path, new_content).map_err(|e| e.to_string())?;
                count += 1;
            }
        }
    }
    
    Ok(count)
}

// フロントマターを削除して本文だけを抽出するヘルパー関数
fn extract_body_without_frontmatter(content: &str) -> String {
    let trimmed = content.trim_start();
    if trimmed.starts_with("---") {
        // フロントマターの終わりを探す（最初の---の後）
        if let Some(first_end) = trimmed[3..].find("---") {
            let body_start = 3 + first_end + 3;
            return trimmed[body_start..].trim_start().to_string();
        }
    }
    // フロントマターがない場合はそのまま返す
    content.to_string()
}

pub fn list_notes(folder_path: &str) -> Vec<NoteMeta> {
    let mut notes = Vec::new();

    cleanup_zero_byte_note_stubs(folder_path);

    // WalkDir 中にリネームして混乱しないよう、先にパスを収集する
    let md_paths: Vec<PathBuf> = WalkDir::new(folder_path)
        .max_depth(1)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter(|e| e.path().extension().map_or(false, |ext| ext == "md"))
        .map(|e| e.path().to_path_buf())
        .collect();

    for path in md_paths {
        let content = match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        // フロントマターがない場合はリネーム＋フロントマター付与して移行
        let actual_path = if !content.trim_start().starts_with("---") {
            migrate_to_frontmatter(&path, &content, folder_path).unwrap_or(path)
        } else {
            path
        };

        let final_content = match fs::read_to_string(&actual_path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let filename = match actual_path.file_name() {
            Some(n) => n.to_string_lossy().to_string(),
            None => continue,
        };
        let (seq, updated, context) = logic::parse_filename(&filename);
        let (x, y, width, height, background_color, always_on_top, tags, folded) =
            logic::extract_meta_from_content(&final_content);
        let opacity = logic::extract_opacity(&final_content);
        let font_size = logic::extract_font_size(&final_content);

        notes.push(NoteMeta {
            path: actual_path.to_string_lossy().to_string(),
            seq,
            context,
            updated,
            x, y, width, height, background_color, always_on_top, folded, opacity, font_size,
            tags,
        });
    }
    notes.sort_by(|a, b| a.path.cmp(&b.path));
    notes
}

fn cleanup_zero_byte_note_stubs(folder_path: &str) {
    let Ok(entries) = fs::read_dir(folder_path) else {
        return;
    };

    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if is_zero_byte_note_stub(&path) {
            let _ = fs::remove_file(path);
        }
    }
}

fn is_zero_byte_note_stub(path: &Path) -> bool {
    if path.extension().is_some() {
        return false;
    }

    let Ok(metadata) = fs::metadata(path) else {
        return false;
    };
    if !metadata.is_file() || metadata.len() != 0 {
        return false;
    }

    let Some(filename) = path.file_name().and_then(|name| name.to_str()) else {
        return false;
    };

    looks_like_note_stub_name(filename)
}

fn looks_like_note_stub_name(filename: &str) -> bool {
    let parts: Vec<&str> = filename.splitn(3, '_').collect();
    if parts.len() != 3 || parts[2].is_empty() {
        return false;
    }

    parts[0].len() == 4
        && parts[0].chars().all(|c| c.is_ascii_digit())
        && is_ymd_date(parts[1])
}

fn is_ymd_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    value.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(i, b)| i == 4 || i == 7 || b.is_ascii_digit())
}

/// フロントマターなしの .md ファイルを標準形式に移行する。
/// 新しいパスを返す。失敗した場合は元のパスをそのまま返す。
fn migrate_to_frontmatter(path: &PathBuf, content: &str, folder_path: &str) -> Result<PathBuf, PathBuf> {
    // 空ファイルは移行しない（コンテンツが消える危険を避ける）
    if content.trim().is_empty() {
        return Err(path.clone());
    }

    let first_line = content.lines()
        .map(|l| l.trim())
        .find(|l| !l.is_empty() && !l.starts_with("!["))
        .unwrap_or("note");
    let safe_context = logic::sanitize_context(first_line);
    let context = if safe_context.is_empty() { "note".to_string() } else { safe_context };

    let seq = get_next_seq(folder_path);
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let new_filename = logic::generate_filename(seq, &today, &context);
    let new_path = PathBuf::from(folder_path).join(&new_filename);

    let frontmatter = logic::generate_frontmatter(seq, &context, &today, &today, Some("#f7e9b0"), &[], None, None, None);
    let new_content = format!("{}\n\n{}", frontmatter, content);

    if fs::write(&new_path, &new_content).is_err() {
        return Err(path.clone());
    }

    // 書き込み後に元の本文が含まれているか検証してから削除
    let verified = fs::read_to_string(&new_path)
        .map(|c| c.contains(content.trim()))
        .unwrap_or(false);
    if !verified {
        let _ = fs::remove_file(&new_path);
        return Err(path.clone());
    }

    if *path != new_path {
        let _ = fs::remove_file(path);
    }
    Ok(new_path)
}

pub fn read_note(path: &str) -> Result<Note, String> {
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    
    // 1. ファイル名から基本情報を解析
    let path_obj = Path::new(path);
    let filename = path_obj.file_name()
        .ok_or("Invalid filename")?
        .to_string_lossy()
        .to_string();
    let (seq, updated, context) = logic::parse_filename(&filename);

    // 2. コンテンツから拡張メタデータを解析（list_notesと同様のロジック）
    let (x, y, width, height, background_color, always_on_top, tags, folded) = logic::extract_meta_from_content(&content);
    let opacity = logic::extract_opacity(&content);
    let font_size = logic::extract_font_size(&content);

    // 3. 正しい値をセットして返す
    Ok(Note {
        body: content,
        frontmatter: String::new(), 
        meta: NoteMeta { 
            path: path.to_string(),
            seq,
            context,
            updated,
            x, 
            y, 
            width, 
            height, 
            background_color, 
            always_on_top,
            tags,
            folded,
            opacity,
            font_size,
        },
    })
}

/// iPhone 受信IDのハッシュを持つ付箋を検索する。
/// 再受信時の重複作成防止にだけ使用し、本文は比較しない。
pub fn find_note_by_iphone_source_hash(folder_path: &str, source_hash: &str) -> Option<String> {
    let marker = format!("iphone_source_hash: {}", source_hash);
    WalkDir::new(folder_path)
        .into_iter()
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            entry.file_type().is_file()
                && entry.path().extension().and_then(|ext| ext.to_str()) == Some("md")
        })
        .find_map(|entry| {
            let content = fs::read_to_string(entry.path()).ok()?;
            content
                .lines()
                .any(|line| line.trim() == marker)
                .then(|| entry.path().to_string_lossy().to_string())
        })
}

pub fn write_note(path: &str, content: &str) -> Result<(), String> {
    // Atomic Write attempt: Write to temp file then rename
    let path_obj = Path::new(path);
    // temp path: same dir, different extension to ensure same filesystem
    
    // Add a random suffix or just .tmp extension. 
    // using .tmp extension might conflict if multiple writes happen, but sufficient for single user app.
    // Better: use UUID or timestamp if possible, but let's stick to simple .tmp for now.
    let file_stem = path_obj.file_stem().unwrap_or_default().to_string_lossy();
    let extension = path_obj.extension().unwrap_or_default().to_string_lossy();
    let temp_filename = format!("{}.{}.tmp", file_stem, extension);
    let temp_path = path_obj.parent().unwrap_or(Path::new(".")).join(temp_filename);

    if let Err(e) = fs::write(&temp_path, content) {
        return Err(format!("Failed to write temp file: {}", e));
    }

    // Rename temp file to target file
    // [Safe] Atomic Write: バックアップを先に作り、失敗時は必ず元に戻す。
    //   旧実装: rename失敗 → 元ファイル削除 → rename再試行 → 失敗するとデータ消滅
    //   新実装: 元ファイル → backup退避 → temp → 本番 → 成功時backup削除 / 失敗時backup復元
    match fs::rename(&temp_path, path_obj) {
        Ok(_) => Ok(()),
        Err(_) => {
            // 元ファイルが存在する場合はバックアップに退避してから再試行
            let backup_path = path_obj.with_extension("md.bak");
            if path_obj.exists() {
                if let Err(e) = fs::rename(path_obj, &backup_path) {
                    // バックアップすら作れない場合は temp を消してエラー（元ファイルは無傷）
                    let _ = fs::remove_file(&temp_path);
                    return Err(format!("バックアップ作成に失敗しました: {}", e));
                }
            }
            // temp → 本番 へ rename
            match fs::rename(&temp_path, path_obj) {
                Ok(_) => {
                    // 成功 → バックアップを削除してクリーンアップ
                    let _ = fs::remove_file(&backup_path);
                    Ok(())
                }
                Err(e) => {
                    // 失敗 → バックアップから元ファイルを復元してデータを保護
                    let _ = fs::rename(&backup_path, path_obj);
                    let _ = fs::remove_file(&temp_path);
                    Err(format!("保存に失敗しました（元データは保護されています）: {}", e))
                }
            }
        }
    }
}

pub fn rename_note(old_path: &str, new_path: &str) -> Result<(), String> {
    fs::rename(old_path, new_path).map_err(|e| e.to_string())
}

pub fn get_next_seq(folder_path: &str) -> i32 {
    let dir = Path::new(folder_path);
    let mut max_seq = 0;
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let name = entry.file_name().to_string_lossy().to_string();
            let (seq, _, _) = logic::parse_filename(&name);
            if seq > max_seq { max_seq = seq; }
        }
    }
    max_seq + 1
}

pub fn ensure_trash_dir(parent_path: &Path) -> Result<PathBuf, String> {
    ensure_named_dir(parent_path, "Trash")
}

pub fn ensure_named_dir(parent_path: &Path, name: &str) -> Result<PathBuf, String> {
    let named_dir = parent_path.join(name);
    if !named_dir.exists() {
        fs::create_dir(&named_dir).map_err(|e| e.to_string())?;
    }
    Ok(named_dir)
}

pub fn ensure_recipes_dir(parent_path: &Path) -> Result<PathBuf, String> {
    ensure_named_dir(parent_path, RECIPES_DIR_NAME)
}

pub fn ensure_qa_dir(parent_path: &Path) -> Result<PathBuf, String> {
    ensure_named_dir(parent_path, QA_DIR_NAME)
}

pub fn ensure_terms_dir(parent_path: &Path) -> Result<PathBuf, String> {
    ensure_named_dir(parent_path, TERMS_DIR_NAME)
}

pub fn list_recipe_material_note_paths(parent_path: &Path) -> Vec<PathBuf> {
    let mut paths = Vec::new();

    if let Ok(entries) = fs::read_dir(parent_path) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.is_file() && path.extension().map_or(false, |ext| ext == "md") {
                paths.push(path);
            }
        }
    }

    let tags_dir = parent_path.join("tags");
    if tags_dir.exists() {
        for entry in WalkDir::new(&tags_dir).into_iter().filter_map(|e| e.ok()) {
            let path = entry.path();
            if entry.file_type().is_file()
                && path.extension().map_or(false, |ext| ext == "md")
                && !has_excluded_recipe_material_component(path)
            {
                paths.push(path.to_path_buf());
            }
        }
    }

    paths.sort();
    paths
}

fn has_excluded_recipe_material_component(path: &Path) -> bool {
    path.components().any(|component| {
        let name = component.as_os_str().to_string_lossy();
        name == "Trash" || name == "Archive" || name == RECIPES_DIR_NAME || name == QA_DIR_NAME || name == TERMS_DIR_NAME
    })
}

pub fn ensure_tag_dir(parent_path: &Path, tag: &str) -> Result<PathBuf, String> {
    let tags_dir = parent_path.join("tags");
    if !tags_dir.exists() {
        fs::create_dir(&tags_dir).map_err(|e| e.to_string())?;
    }
    // Sanitize tag name for use as directory name if necessary
    // For now we assume tag is simple.
    let tag_dir = tags_dir.join(tag);
    if !tag_dir.exists() {
        fs::create_dir(&tag_dir).map_err(|e| e.to_string())?;
    }
    Ok(tag_dir)
}

pub fn ensure_archive_dir(parent_path: &Path) -> Result<PathBuf, String> {
    let archive_dir = parent_path.join("Archive");
    if !archive_dir.exists() {
        fs::create_dir(&archive_dir).map_err(|e| e.to_string())?;
    }
    Ok(archive_dir)
}
/// 添付画像（assets/...）を参照するMarkdownパターン
/// OnceLock: アプリ起動後に1度だけコンパイルし、以降は再利用する。
/// リテラル正規表現は実行時に失敗しないため get_or_init + expect が安全。
static ASSETS_RE: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();

fn get_assets_regex() -> &'static regex::Regex {
    ASSETS_RE.get_or_init(|| {
        regex::Regex::new(r"!\[[^\]]*\]\((assets/[^)]+)\)")
            .expect("ASSETS_RE: リテラル正規表現のコンパイルは常に成功するはず")
    })
}

pub fn copy_associated_assets(note_path: &Path, target_note_dir: &Path) -> Result<(), String> {
    copy_associated_assets_with_policy(note_path, target_note_dir, false)
}

pub fn overwrite_associated_assets(note_path: &Path, target_note_dir: &Path) -> Result<(), String> {
    copy_associated_assets_with_policy(note_path, target_note_dir, true)
}

fn copy_associated_assets_with_policy(
    note_path: &Path,
    target_note_dir: &Path,
    overwrite: bool,
) -> Result<(), String> {
    let content = fs::read_to_string(note_path).map_err(|e| e.to_string())?;
    let re = get_assets_regex();

    let note_dir = note_path.parent().ok_or("No parent")?;
    let target_assets_dir = target_note_dir.join("assets");

    for cap in re.captures_iter(&content) {
        let asset_rel_path = &cap[1];
        let src_asset_path = note_dir.join(asset_rel_path);
        
        if src_asset_path.exists() {
            if !target_assets_dir.exists() {
                fs::create_dir_all(&target_assets_dir).map_err(|e| e.to_string())?;
            }
            let asset_filename = src_asset_path.file_name().ok_or("No asset filename")?;
            let dest_asset_path = target_assets_dir.join(asset_filename);
            
            if overwrite || !dest_asset_path.exists() {
                fs::copy(&src_asset_path, &dest_asset_path).map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

pub fn delete_associated_assets(note_path: &Path) -> Result<(), String> {
    let content = fs::read_to_string(note_path).map_err(|e| e.to_string())?;
    let re = get_assets_regex(); // OnceLock 共有インスタンスを使用

    let note_dir = note_path.parent().ok_or("No parent")?;
    
    for cap in re.captures_iter(&content) {
        let asset_rel_path = &cap[1];
        let src_asset_path = note_dir.join(asset_rel_path);
        
        if src_asset_path.exists() {
            fs::remove_file(&src_asset_path).map_err(|e| e.to_string())?;
            // Optional: Try removing parent 'assets' dir if empty, but might be risky/noisy
        }
    }
    Ok(())
}

pub fn open_in_explorer(path: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        use std::path::Path;

        let arg_path = normalize_explorer_arg(path);

        // [DEBUG] Log path
        crate::logger::log_info(&format!("[DEBUG] open_in_explorer called with: '{}'", path));
        
        let path_obj = Path::new(&arg_path);
        
        if path_obj.exists() {
            // Plan A: File exists, select it
            Command::new("explorer")
                .arg("/select,")
                .arg(&arg_path)
                .spawn()
                .map_err(|e| e.to_string())?;
        } else {
            // Plan B: File missing, open parent folder (Fallback)
            crate::logger::log_warn(&format!("[WARN] File not found: '{}'. Opening parent folder.", arg_path));
            if let Some(parent) = path_obj.parent() {
                 Command::new("explorer")
                    .arg(parent)
                    .spawn()
                    .map_err(|e| e.to_string())?;
            } else {
                 // Fallback if parent lookup fails (e.g. root), try opening path directly
                  Command::new("explorer")
                    .arg(&arg_path)
                    .spawn()
                    .map_err(|e| e.to_string())?;
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        // Fallback for non-windows
        return Err("Not implemented for this platform".to_string());
    }
    Ok(())
}

/// explorer.exe に渡す引数用にパスを整形する。
///
/// 1. `/` を `\` に変換（Windows 形式へ統一）
/// 2. 末尾のバックスラッシュを除去（ドライブルート `C:\` は除く）
///
/// 末尾を除去する理由: パスにスペースを含む場合、std::process::Command が
/// 引数をダブルクォートで囲むため末尾が `\"` となり、Windows のコマンドライン
/// 解析でエスケープされたクォートと誤認されてパスが壊れる（explorer が既定
/// フォルダを開いてしまう）。`C:\` のようなルートは末尾 `\` を残さないと
/// ドライブ指定が壊れるため保護する。
fn normalize_explorer_arg(path: &str) -> String {
    let windows_path = path.replace('/', "\\");
    let trimmed = windows_path.trim_end_matches('\\');
    // ルート（例 "C:"）まで削れた場合は元のドライブ表記 "C:\" を維持する
    if trimmed.len() == 2 && trimmed.ends_with(':') {
        format!("{}\\", trimmed)
    } else if trimmed.is_empty() {
        windows_path
    } else {
        trimmed.to_string()
    }
}

/// Markdown の `[label](path)` から抽出された Windows パスには、構文を閉じる
/// `)` が末尾に混入することがある。元のパスが存在する場合はそのまま優先し、
/// 存在しない場合だけ `)` を1つ除いた実在パスへ補正する。
fn resolve_open_file_path(path: &str) -> String {
    if std::path::Path::new(path).exists() {
        return path.to_string();
    }

    if let Some(without_markdown_closing) = path.strip_suffix(')') {
        if std::path::Path::new(without_markdown_closing).exists() {
            return without_markdown_closing.to_string();
        }
    }

    path.to_string()
}

pub fn open_file(path: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let resolved_path = resolve_open_file_path(path);
        let arg_path = normalize_explorer_arg(&resolved_path);

        // Open file or folder with default application (explorer handles both)
        Command::new("explorer")
            .arg(&arg_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        return Err("Not implemented for this platform".to_string());
    }
    Ok(())
}

/// ベースパス全体を dest_dir へ再帰コピーする（バックアップ用）
/// tags/, assets/ を含むすべてのファイルを対象とする。
/// 戻り値: コピーしたファイル数
#[allow(dead_code)]
pub fn backup_notes(source_dir: &str, dest_dir: &str) -> Result<usize, String> {
    backup_notes_with_options(source_dir, dest_dir, true)
}

pub fn backup_notes_with_options(source_dir: &str, dest_dir: &str, include_trash: bool) -> Result<usize, String> {
    let src = std::path::Path::new(source_dir);
    let dst = std::path::Path::new(dest_dir);

    if !src.exists() {
        return Err(format!("バックアップ元が見つかりません: {}", source_dir));
    }
    if !dst.exists() {
        return Err(format!("バックアップ先が見つかりません: {}", dest_dir));
    }

    let canonical_src = src.canonicalize().map_err(|e| e.to_string())?;
    let canonical_dst = dst.canonicalize().map_err(|e| e.to_string())?;
    if canonical_src.starts_with(&canonical_dst) || canonical_dst.starts_with(&canonical_src) {
        return Err("バックアップ元と先には、同じ場所や親子フォルダを指定できません".to_string());
    }

    let mut count = 0;
    backup_dir_recursive(src, dst, &mut count, include_trash)?;
    Ok(count)
}

fn backup_dir_recursive(src: &std::path::Path, dst: &std::path::Path, count: &mut usize, include_trash: bool) -> Result<(), String> {
    for entry in fs::read_dir(src).map_err(|e| e.to_string())?.filter_map(|e| e.ok()) {
        let path = entry.path();
        let dest = dst.join(entry.file_name());
        if path.is_dir() {
            let is_trash = entry.file_name().to_string_lossy().eq_ignore_ascii_case("Trash");
            if is_trash && !include_trash && dest.exists() {
                fs::remove_dir_all(&dest).map_err(|e| e.to_string())?;
            }
            fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
            if include_trash || !is_trash {
                backup_dir_recursive(&path, &dest, count, include_trash)?;
            }
        } else {
            fs::copy(&path, &dest).map_err(|e| e.to_string())?;
            *count += 1;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;
    use tempfile::tempdir;

    static SETTINGS_ENV_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn overwrite_associated_assets_keeps_the_later_image() {
        let source = tempdir().unwrap();
        let destination = tempdir().unwrap();
        fs::create_dir_all(source.path().join("assets")).unwrap();
        fs::create_dir_all(destination.path().join("assets")).unwrap();
        fs::write(
            source.path().join("note.md"),
            "![image](assets/shared.png)",
        ).unwrap();
        fs::write(source.path().join("assets/shared.png"), "later").unwrap();
        fs::write(destination.path().join("assets/shared.png"), "earlier").unwrap();

        overwrite_associated_assets(&source.path().join("note.md"), destination.path()).unwrap();

        assert_eq!(
            fs::read_to_string(destination.path().join("assets/shared.png")).unwrap(),
            "later"
        );
    }

    #[test]
    fn backup_excludes_trash_contents_by_default_option_and_keeps_empty_folder() {
        let source = tempdir().unwrap();
        let destination = tempdir().unwrap();
        fs::write(source.path().join("note.md"), "note").unwrap();
        fs::create_dir_all(source.path().join("Trash")).unwrap();
        fs::write(source.path().join("Trash").join("deleted.md"), "deleted").unwrap();
        fs::create_dir_all(destination.path().join("Trash")).unwrap();
        fs::write(destination.path().join("Trash").join("old.md"), "old").unwrap();

        let count = backup_notes_with_options(
            source.path().to_string_lossy().as_ref(),
            destination.path().to_string_lossy().as_ref(),
            false,
        ).unwrap();

        assert_eq!(count, 1);
        assert!(destination.path().join("note.md").exists());
        assert!(destination.path().join("Trash").is_dir());
        assert_eq!(fs::read_dir(destination.path().join("Trash")).unwrap().count(), 0);
    }

    #[test]
    fn backup_includes_trash_contents_when_requested() {
        let source = tempdir().unwrap();
        let destination = tempdir().unwrap();
        fs::create_dir_all(source.path().join("Trash")).unwrap();
        fs::write(source.path().join("Trash").join("deleted.md"), "deleted").unwrap();

        let count = backup_notes_with_options(
            source.path().to_string_lossy().as_ref(),
            destination.path().to_string_lossy().as_ref(),
            true,
        ).unwrap();

        assert_eq!(count, 1);
        assert!(destination.path().join("Trash").join("deleted.md").exists());
    }

    #[test]
    fn backup_rejects_same_or_nested_destination() {
        let root = tempdir().unwrap();
        let source = root.path().join("source");
        let nested_destination = source.join("backup");
        fs::create_dir_all(&nested_destination).unwrap();
        fs::write(source.join("note.md"), "note").unwrap();

        for destination in [&source, &nested_destination, root.path()] {
            let error = backup_notes_with_options(
                source.to_string_lossy().as_ref(),
                destination.to_string_lossy().as_ref(),
                false,
            )
            .unwrap_err();
            assert!(error.contains("同じ場所や親子フォルダ"));
        }
    }

    // === write_note と read_note のテスト ===
    // ファイルI/O操作の基本
    
    #[test]
    fn test_write_and_read_note() {
        // 一時ディレクトリを作成（テスト終了時に自動削除される）
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test_note.md");
        let file_path_str = file_path.to_string_lossy().to_string();
        
        // テストデータ
        let content = "---\nseq: 1\n---\n\nテスト本文";
        
        // 1. 書き込み
        let write_result = write_note(&file_path_str, content);
        assert!(write_result.is_ok(), "書き込みが成功すること");
        
        // 2. ファイルが存在することを確認
        assert!(file_path.exists(), "ファイルが作成されていること");
        
        // 3. 読み込み
        let read_result = read_note(&file_path_str);
        assert!(read_result.is_ok(), "読み込みが成功すること");
        
        // 4. 内容が一致することを確認
        let note = read_result.unwrap();
        assert_eq!(note.body, content, "書き込んだ内容と読み込んだ内容が一致すること");
    }

    #[test]
    fn test_write_note_creates_file() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("new_file.md");
        let file_path_str = file_path.to_string_lossy().to_string();
        
        // ファイルがまだ存在しない
        assert!(!file_path.exists());
        
        // 書き込み
        write_note(&file_path_str, "新しいファイル").unwrap();
        
        // ファイルが作成された
        assert!(file_path.exists());
    }

    #[test]
    fn test_write_note_overwrites_existing() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("overwrite.md");
        let file_path_str = file_path.to_string_lossy().to_string();
        
        // 最初の書き込み
        write_note(&file_path_str, "最初の内容").unwrap();
        
        // 上書き
        write_note(&file_path_str, "上書きされた内容").unwrap();
        
        // 読み込んで確認
        let note = read_note(&file_path_str).unwrap();
        assert_eq!(note.body, "上書きされた内容");
    }

    #[cfg(windows)]
    #[test]
    fn test_dangerous_storage_path_rejects_windows_apps() {
        assert!(is_dangerous_storage_path(
            r"C:\Program Files\WindowsApps\OreNoFusen"
        ));
    }

    #[test]
    fn test_dangerous_storage_path_rejects_current_exe_parent() {
        let exe_dir = std::env::current_exe()
            .unwrap()
            .parent()
            .unwrap()
            .to_path_buf();
        let path = exe_dir.join("OreNoFusenData");

        assert!(is_dangerous_storage_path(&path.to_string_lossy()));
    }

    #[test]
    fn test_dangerous_storage_path_allows_normal_temp_path() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("Documents").join("OreNoFusen");

        assert!(!is_dangerous_storage_path(&path.to_string_lossy()));
    }

    #[test]
    fn storage_health_accepts_readable_writable_directory_and_cleans_probe() {
        let dir = tempdir().unwrap();
        check_storage_health(&dir.path().to_string_lossy()).unwrap();
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 0);
    }

    #[test]
    fn storage_health_rejects_missing_directory() {
        let dir = tempdir().unwrap();
        let missing = dir.path().join("missing");
        let error = check_storage_health(&missing.to_string_lossy()).unwrap_err();
        assert!(error.contains("見つかりません"));
    }

    #[test]
    fn storage_health_rejects_file_path() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("not-a-directory");
        fs::write(&file, "data").unwrap();
        let error = check_storage_health(&file.to_string_lossy()).unwrap_err();
        assert!(error.contains("フォルダではありません"));
    }

    #[test]
    fn finds_received_iphone_note_by_exact_source_hash() {
        let dir = tempdir().unwrap();
        let note_path = dir.path().join("received.md");
        fs::write(
            &note_path,
            "---\niphone_source_hash: abc123\n---\nreceived body",
        )
        .unwrap();

        assert_eq!(
            find_note_by_iphone_source_hash(&dir.path().to_string_lossy(), "abc123"),
            Some(note_path.to_string_lossy().to_string())
        );
        assert!(find_note_by_iphone_source_hash(&dir.path().to_string_lossy(), "abc").is_none());
    }

    #[test]
    fn test_save_settings_keeps_original_base_path_string() {
        let _guard = SETTINGS_ENV_LOCK.lock().unwrap();
        let appdata_dir = tempdir().unwrap();
        let base_dir = tempdir().unwrap();
        let raw_base_path = base_dir.path().join("..").join(
            base_dir
                .path()
                .file_name()
                .expect("temp dir has file name"),
        );
        let raw_base_path_str = raw_base_path.to_string_lossy().to_string();
        let old_appdata = std::env::var("APPDATA").ok();

        std::env::set_var("APPDATA", appdata_dir.path());

        let mut settings = Settings::default();
        settings.base_path = Some(raw_base_path_str.clone());
        save_settings(&settings).unwrap();

        let saved = std::fs::read_to_string(get_settings_path().unwrap()).unwrap();
        let saved_settings: Settings = serde_json::from_str(&saved).unwrap();
        assert_eq!(saved_settings.base_path, Some(raw_base_path_str));

        if let Some(value) = old_appdata {
            std::env::set_var("APPDATA", value);
        } else {
            std::env::remove_var("APPDATA");
        }
    }

    #[test]
    fn save_settings_keeps_one_valid_previous_generation() {
        let _guard = SETTINGS_ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let appdata_dir = tempdir().unwrap();
        let old_appdata = std::env::var("APPDATA").ok();
        std::env::set_var("APPDATA", appdata_dir.path());

        let mut first = Settings::default();
        first.language = "ja".to_string();
        save_settings(&first).unwrap();

        let mut second = first.clone();
        second.language = "en".to_string();
        save_settings(&second).unwrap();

        let settings_path = get_settings_path().unwrap();
        let current = read_settings_file(&settings_path).unwrap();
        let previous = read_settings_file(&settings_backup_path(&settings_path)).unwrap();
        assert_eq!(current.language, "en");
        assert_eq!(previous.language, "ja");

        if let Some(value) = old_appdata {
            std::env::set_var("APPDATA", value);
        } else {
            std::env::remove_var("APPDATA");
        }
    }

    #[test]
    fn load_settings_recovers_from_valid_backup_when_primary_is_corrupt() {
        let _guard = SETTINGS_ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let appdata_dir = tempdir().unwrap();
        let old_appdata = std::env::var("APPDATA").ok();
        std::env::set_var("APPDATA", appdata_dir.path());

        let mut first = Settings::default();
        first.language = "ja".to_string();
        save_settings(&first).unwrap();
        let mut second = first.clone();
        second.language = "en".to_string();
        save_settings(&second).unwrap();

        fs::write(get_settings_path().unwrap(), "{broken").unwrap();
        let recovered = load_settings().unwrap();
        assert_eq!(recovered.language, "ja");

        if let Some(value) = old_appdata {
            std::env::set_var("APPDATA", value);
        } else {
            std::env::remove_var("APPDATA");
        }
    }

    #[test]
    fn load_settings_fails_when_primary_and_backup_are_both_corrupt() {
        let _guard = SETTINGS_ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let appdata_dir = tempdir().unwrap();
        let old_appdata = std::env::var("APPDATA").ok();
        std::env::set_var("APPDATA", appdata_dir.path());

        let settings_path = get_settings_path().unwrap();
        fs::write(&settings_path, "{broken-primary").unwrap();
        fs::write(settings_backup_path(&settings_path), "{broken-backup").unwrap();

        let error = match load_settings() {
            Ok(_) => panic!("corrupt primary and backup must not load"),
            Err(error) => error,
        };
        assert!(error.contains("settings.json and its backup are invalid"));

        if let Some(value) = old_appdata {
            std::env::set_var("APPDATA", value);
        } else {
            std::env::remove_var("APPDATA");
        }
    }

    #[test]
    fn recover_corrupt_settings_archives_both_invalid_generations() {
        let root = tempdir().unwrap();
        let settings_path = root.path().join("settings.json");
        let backup_path = settings_backup_path(&settings_path);
        let vault = root.path().join("vault");
        fs::create_dir_all(&vault).unwrap();
        fs::write(&settings_path, "{broken-primary").unwrap();
        fs::write(&backup_path, "{broken-backup").unwrap();

        recover_corrupt_settings_at(&settings_path, &vault, "20260714-123456").unwrap();

        assert!(root.path().join("settings.corrupt-20260714-123456.json").exists());
        assert!(root.path().join("settings.backup-corrupt-20260714-123456.json").exists());
    }

    #[test]
    fn recover_corrupt_settings_writes_valid_primary_and_backup() {
        let root = tempdir().unwrap();
        let settings_path = root.path().join("settings.json");
        let backup_path = settings_backup_path(&settings_path);
        let vault = root.path().join("vault");
        fs::create_dir_all(&vault).unwrap();
        fs::write(&settings_path, "{broken-primary").unwrap();
        fs::write(&backup_path, "{broken-backup").unwrap();

        let recovered =
            recover_corrupt_settings_at(&settings_path, &vault, "20260714-123456").unwrap();

        assert_eq!(
            recovered.base_path.as_deref(),
            Some(vault.to_string_lossy().as_ref())
        );
        assert_eq!(
            read_settings_file(&settings_path).unwrap().base_path,
            recovered.base_path
        );
        assert_eq!(
            read_settings_file(&backup_path).unwrap().base_path,
            recovered.base_path
        );
    }

    #[test]
    fn recover_corrupt_settings_is_not_used_when_backup_is_valid() {
        let root = tempdir().unwrap();
        let settings_path = root.path().join("settings.json");
        let backup_path = settings_backup_path(&settings_path);
        let vault = root.path().join("vault");
        fs::create_dir_all(&vault).unwrap();
        fs::write(&settings_path, "{broken-primary").unwrap();
        fs::write(
            &backup_path,
            serde_json::to_string(&Settings::default()).unwrap(),
        )
        .unwrap();

        let error = match recover_corrupt_settings_at(
            &settings_path,
            &vault,
            "20260714-123456",
        ) {
            Ok(_) => panic!("valid backup must keep the normal backup recovery path"),
            Err(error) => error,
        };

        assert!(error.contains("both invalid"));
        assert!(backup_path.exists());
        assert!(!root.path().join("settings.corrupt-20260714-123456.json").exists());
    }

    #[test]
    fn recovered_settings_load_normally_on_next_start() {
        let root = tempdir().unwrap();
        let settings_path = root.path().join("settings.json");
        let backup_path = settings_backup_path(&settings_path);
        let vault = root.path().join("vault");
        fs::create_dir_all(&vault).unwrap();
        fs::write(&settings_path, "{broken-primary").unwrap();
        fs::write(&backup_path, "{broken-backup").unwrap();

        recover_corrupt_settings_at(&settings_path, &vault, "20260714-123456").unwrap();

        assert!(read_settings_file(&settings_path).is_ok());
        assert!(read_settings_file(&backup_path).is_ok());
    }

    #[test]
    fn recovery_draft_is_used_only_when_newer_than_note() {
        let _guard = SETTINGS_ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let appdata_dir = tempdir().unwrap();
        let note_dir = tempdir().unwrap();
        let old_appdata = std::env::var("APPDATA").ok();
        std::env::set_var("APPDATA", appdata_dir.path());
        let note_path = note_dir.path().join("note.md");
        let note_path_str = note_path.to_string_lossy().to_string();

        write_note(&note_path_str, "saved").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));
        save_recovery_draft(&note_path_str, "recovered").unwrap();
        assert_eq!(load_newer_recovery_draft(&note_path_str).as_deref(), Some("recovered"));

        std::thread::sleep(std::time::Duration::from_millis(20));
        write_note(&note_path_str, "newer saved").unwrap();
        assert!(load_newer_recovery_draft(&note_path_str).is_none());

        if let Some(value) = old_appdata {
            std::env::set_var("APPDATA", value);
        } else {
            std::env::remove_var("APPDATA");
        }
    }

    #[test]
    fn successful_save_can_clear_recovery_draft() {
        let _guard = SETTINGS_ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let appdata_dir = tempdir().unwrap();
        let old_appdata = std::env::var("APPDATA").ok();
        std::env::set_var("APPDATA", appdata_dir.path());
        let note_path = "D:/notes/example.md";

        save_recovery_draft(note_path, "recovered").unwrap();
        let draft_path = recovery_draft_path(note_path).unwrap();
        assert!(draft_path.exists());
        clear_recovery_draft(note_path);
        assert!(!draft_path.exists());

        if let Some(value) = old_appdata {
            std::env::set_var("APPDATA", value);
        } else {
            std::env::remove_var("APPDATA");
        }
    }

    #[test]
    fn recovery_lookup_does_not_create_directory_during_normal_save() {
        let _guard = SETTINGS_ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let appdata_dir = tempdir().unwrap();
        let old_appdata = std::env::var("APPDATA").ok();
        std::env::set_var("APPDATA", appdata_dir.path());

        let draft_path = recovery_draft_path("D:/notes/normal.md").unwrap();
        assert!(!draft_path.parent().unwrap().exists());
        clear_recovery_draft("D:/notes/normal.md");
        assert!(!draft_path.parent().unwrap().exists());

        if let Some(value) = old_appdata {
            std::env::set_var("APPDATA", value);
        } else {
            std::env::remove_var("APPDATA");
        }
    }

    #[test]
    fn trash_operation_log_records_source_destination_and_origin() {
        let _guard = SETTINGS_ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let appdata_dir = tempdir().unwrap();
        let old_appdata = std::env::var("APPDATA").ok();
        std::env::set_var("APPDATA", appdata_dir.path());

        append_trash_operation(
            Path::new("C:/notes/source.md"),
            Path::new("C:/notes/Trash/source.md"),
            "quick_launcher",
        )
        .unwrap();

        let log = fs::read_to_string(
            get_settings_path().unwrap().parent().unwrap().join("trash_operations.jsonl"),
        )
        .unwrap();
        let record: serde_json::Value = serde_json::from_str(log.trim()).unwrap();
        assert_eq!(record["origin"], "quick_launcher");
        assert!(record["source"].as_str().unwrap().contains("source.md"));
        assert!(record["destination"].as_str().unwrap().contains("Trash"));

        if let Some(value) = old_appdata {
            std::env::set_var("APPDATA", value);
        } else {
            std::env::remove_var("APPDATA");
        }
    }

    // === rename_note のテスト ===
    
    #[test]
    fn test_rename_note() {
        let dir = tempdir().unwrap();
        let old_path = dir.path().join("old_name.md");
        let new_path = dir.path().join("new_name.md");
        
        let old_path_str = old_path.to_string_lossy().to_string();
        let new_path_str = new_path.to_string_lossy().to_string();
        
        // ファイルを作成
        write_note(&old_path_str, "リネームテスト").unwrap();
        assert!(old_path.exists());
        
        // リネーム実行
        let rename_result = rename_note(&old_path_str, &new_path_str);
        assert!(rename_result.is_ok(), "リネームが成功すること");
        
        // 古いファイルが存在しない
        assert!(!old_path.exists(), "古いファイルが削除されていること");
        
        // 新しいファイルが存在する
        assert!(new_path.exists(), "新しいファイルが作成されていること");
        
        // 内容が保持されている
        let note = read_note(&new_path_str).unwrap();
        assert_eq!(note.body, "リネームテスト", "内容が保持されていること");
    }

    #[test]
    fn test_rename_note_nonexistent_file_fails() {
        let dir = tempdir().unwrap();
        let old_path = dir.path().join("nonexistent.md");
        let new_path = dir.path().join("new.md");
        
        // 存在しないファイルをリネームしようとする
        let result = rename_note(
            &old_path.to_string_lossy(),
            &new_path.to_string_lossy()
        );
        
        // エラーが返されること
        assert!(result.is_err(), "存在しないファイルのリネームは失敗すること");
    }

    // === list_notes のテスト ===
    
    #[test]
    fn test_list_notes_empty_folder() {
        let dir = tempdir().unwrap();
        let dir_path = dir.path().to_string_lossy().to_string();
        
        // 空のフォルダ
        let notes = list_notes(&dir_path);
        assert_eq!(notes.len(), 0, "空のフォルダではリストも空");
    }

    #[test]
    fn test_list_notes_finds_md_files() {
        let dir = tempdir().unwrap();
        let dir_path = dir.path().to_string_lossy().to_string();
        
        // .mdファイルを2つ作成
        write_note(
            &dir.path().join("0001_2026-01-12_Note1.md").to_string_lossy(),
            "---\nseq: 1\n---\n\nNote1"
        ).unwrap();
        
        write_note(
            &dir.path().join("0002_2026-01-12_Note2.md").to_string_lossy(),
            "---\nseq: 2\n---\n\nNote2"
        ).unwrap();
        
        // .txtファイルも作成（これは無視されるべき）
        std::fs::write(dir.path().join("ignore.txt"), "ignore").unwrap();
        
        // list_notes実行
        let notes = list_notes(&dir_path);
        
        // .mdファイルのみ取得されること
        assert_eq!(notes.len(), 2, ".mdファイルのみがリストされること");
        assert_eq!(notes[0].seq, 1);
        assert_eq!(notes[1].seq, 2);
    }

    // === get_next_seq のテスト ===
    
    #[test]
    fn test_get_next_seq_empty_folder() {
        let dir = tempdir().unwrap();
        let dir_path = dir.path().to_string_lossy().to_string();
        
        // 空のフォルダでは1が返される
        let next_seq = get_next_seq(&dir_path);
        assert_eq!(next_seq, 1);
    }

    #[test]
    fn test_get_next_seq_with_existing_files() {
        let dir = tempdir().unwrap();
        let dir_path = dir.path().to_string_lossy().to_string();
        
        // シーケンス番号のファイルを作成
        write_note(
            &dir.path().join("0001_2026-01-12_Test.md").to_string_lossy(),
            "test"
        ).unwrap();
        
        write_note(
            &dir.path().join("0005_2026-01-12_Test.md").to_string_lossy(),
            "test"
        ).unwrap();
        
        // 最大値(5) + 1 = 6 が返される
        let next_seq = get_next_seq(&dir_path);
        assert_eq!(next_seq, 6);
    }

    #[test]
    fn test_ensure_tag_dir() {
        let dir = tempdir().unwrap();
        let vault_path = dir.path();
        
        let tag = "work";
        let tag_dir = ensure_tag_dir(vault_path, tag).unwrap();
        
        assert!(tag_dir.exists());
        assert!(tag_dir.ends_with(format!("tags/{}", tag)));
        
        // Check if tags/ dir exists
        let tags_base = vault_path.join("tags");
        assert!(tags_base.exists());
    }

    #[test]
    fn test_ensure_archive_dir() {
        let dir = tempdir().unwrap();
        let vault_path = dir.path();
        
        let archive_dir = ensure_archive_dir(vault_path).unwrap();
        
        assert!(archive_dir.exists());
        assert!(archive_dir.ends_with("Archive"));
    }

    #[test]
    fn test_ensure_named_dir_creates_and_reuses_dir() {
        let dir = tempdir().unwrap();
        let named_dir = ensure_named_dir(dir.path(), "Custom").unwrap();
        let reused_dir = ensure_named_dir(dir.path(), "Custom").unwrap();

        assert!(named_dir.exists());
        assert_eq!(reused_dir, named_dir);
    }

    #[test]
    fn test_ensure_recipes_dir() {
        let dir = tempdir().unwrap();
        let recipes_dir = ensure_recipes_dir(dir.path()).unwrap();

        assert!(recipes_dir.exists());
        assert!(recipes_dir.ends_with("Recipes"));
    }

    #[test]
    fn test_ensure_qa_dir() {
        let dir = tempdir().unwrap();
        let qa_dir = ensure_qa_dir(dir.path()).unwrap();

        assert!(qa_dir.exists());
        assert!(qa_dir.ends_with("QA"));
    }

    #[test]
    fn test_ensure_terms_dir() {
        let dir = tempdir().unwrap();
        let terms_dir = ensure_terms_dir(dir.path()).unwrap();

        assert!(terms_dir.exists());
        assert!(terms_dir.ends_with("Terms"));
    }

    #[test]
    fn test_list_recipe_material_note_paths_scans_root_and_tags_only() {
        let dir = tempdir().unwrap();
        let root_note = dir.path().join("0001_2026-07-05_root.md");
        let tag_dir = dir.path().join("tags").join("work");
        let trash_dir = dir.path().join("Trash");
        let archive_dir = dir.path().join("Archive");
        let recipes_dir = dir.path().join("Recipes");
        let qa_dir = dir.path().join("QA");
        let terms_dir = dir.path().join("Terms");
        let nested_archive_dir = dir.path().join("tags").join("Archive");
        let nested_qa_dir = dir.path().join("tags").join("QA");
        let nested_terms_dir = dir.path().join("tags").join("Terms");

        fs::create_dir_all(&tag_dir).unwrap();
        fs::create_dir_all(&trash_dir).unwrap();
        fs::create_dir_all(&archive_dir).unwrap();
        fs::create_dir_all(&recipes_dir).unwrap();
        fs::create_dir_all(&qa_dir).unwrap();
        fs::create_dir_all(&terms_dir).unwrap();
        fs::create_dir_all(&nested_archive_dir).unwrap();
        fs::create_dir_all(&nested_qa_dir).unwrap();
        fs::create_dir_all(&nested_terms_dir).unwrap();

        fs::write(&root_note, "root").unwrap();
        fs::write(tag_dir.join("0002_2026-07-05_tag.md"), "tag").unwrap();
        fs::write(trash_dir.join("0003_2026-07-05_trash.md"), "trash").unwrap();
        fs::write(archive_dir.join("0004_2026-07-05_archive.md"), "archive").unwrap();
        fs::write(recipes_dir.join("0005_2026-07-05_recipe.md"), "recipe").unwrap();
        fs::write(nested_archive_dir.join("0006_2026-07-05_nested_archive.md"), "nested").unwrap();
        fs::write(qa_dir.join("0007_2026-07-05_qa.md"), "qa").unwrap();
        fs::write(nested_qa_dir.join("0008_2026-07-05_nested_qa.md"), "nested qa").unwrap();
        fs::write(terms_dir.join("0009_2026-07-05_term.md"), "term").unwrap();
        fs::write(nested_terms_dir.join("0010_2026-07-05_nested_term.md"), "nested term").unwrap();

        let paths = list_recipe_material_note_paths(dir.path());

        assert_eq!(paths.len(), 2);
        assert!(paths.contains(&root_note));
        assert!(paths.iter().any(|p| p.ends_with("0002_2026-07-05_tag.md")));
    }


    #[test]
    fn test_read_note_should_parse_metadata() {
        let dir = tempdir().unwrap();
        // ファイル名にメタ情報を含む（seq=1）
        let file_path = dir.path().join("0001_2026-01-31_TestNote.md");
        let file_path_str = file_path.to_string_lossy().to_string();

        // コンテンツにメタデータ（x, y, tags）を埋め込む
        let content = r#"---
seq: 1
window: { x: 100.0, y: 200.0, width: 300.0, height: 400.0 }
tags: ["important"]
---

本文"#;
        
        write_note(&file_path_str, content).unwrap();

        // 読み込み実行
        let note = read_note(&file_path_str).unwrap();

        // 検証：修正前はここで失敗する
        assert_eq!(note.meta.x, Some(100.0), "x座標が読み込まれていません");
        assert_eq!(note.meta.y, Some(200.0), "y座標が読み込まれていません");
        assert!(note.meta.tags.contains(&"important".to_string()), "タグが読み込まれていません");
    }

    // === migrate_to_frontmatter / list_notes フロントマター自動付与のテスト ===

    #[test]
    fn test_list_notes_adds_frontmatter_to_plain_md() {
        let dir = tempdir().unwrap();
        let dir_path = dir.path().to_string_lossy().to_string();

        // フロントマターなしの .md を配置
        std::fs::write(dir.path().join("メモ.md"), "これはメモです\n本文2行目").unwrap();

        let notes = list_notes(&dir_path);

        // 1件認識されること
        assert_eq!(notes.len(), 1);

        // 元ファイルが消えて標準形式にリネームされていること
        assert!(!dir.path().join("メモ.md").exists(), "元ファイルが残っている");
        let renamed: Vec<_> = std::fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().map_or(false, |x| x == "md"))
            .collect();
        assert_eq!(renamed.len(), 1, "リネーム後のファイルが1件あること");

        // NoteMeta の context が本文1行目から生成されていること
        assert_eq!(notes[0].context, "これはメモです");
    }

    #[test]
    fn test_list_notes_plain_md_gets_frontmatter_content() {
        let dir = tempdir().unwrap();
        let dir_path = dir.path().to_string_lossy().to_string();

        std::fs::write(dir.path().join("todo.md"), "買い物リスト\n- 牛乳\n- 卵").unwrap();

        list_notes(&dir_path);

        // リネーム後のファイルを読んでフロントマターが付いていることを確認
        let entry = std::fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .find(|e| e.path().extension().map_or(false, |x| x == "md"))
            .unwrap();
        let content = std::fs::read_to_string(entry.path()).unwrap();
        assert!(content.starts_with("---"), "フロントマターが付いていない");
        assert!(content.contains("買い物リスト"), "本文が保持されていない");
    }

    #[test]
    fn test_list_notes_with_frontmatter_unchanged() {
        let dir = tempdir().unwrap();
        let dir_path = dir.path().to_string_lossy().to_string();

        // 標準形式のファイルはリネームされないこと
        let file_path = dir.path().join("0001_2026-03-15_テスト.md");
        std::fs::write(&file_path, "---\nseq: 1\n---\n\n本文").unwrap();

        let notes = list_notes(&dir_path);

        assert_eq!(notes.len(), 1);
        assert!(file_path.exists(), "既存の標準形式ファイルが消えてはいけない");
    }

    #[test]
    fn test_list_notes_removes_zero_byte_extensionless_note_stubs() {
        let dir = tempdir().unwrap();
        let dir_path = dir.path().to_string_lossy().to_string();

        let stub_path = dir.path().join("0237_2026-06-17_17");
        let non_empty_stub_path = dir.path().join("0238_2026-06-17_18");
        let md_path = dir.path().join("0239_2026-06-17_19.md");
        let unrelated_empty_path = dir.path().join("empty");

        std::fs::write(&stub_path, "").unwrap();
        std::fs::write(&non_empty_stub_path, "keep").unwrap();
        std::fs::write(&md_path, "---\nseq: 239\n---\n\nbody").unwrap();
        std::fs::write(&unrelated_empty_path, "").unwrap();

        let notes = list_notes(&dir_path);

        assert_eq!(notes.len(), 1);
        assert!(!stub_path.exists(), "zero-byte extensionless note stub should be removed");
        assert!(non_empty_stub_path.exists(), "non-empty extensionless file should be kept");
        assert!(md_path.exists(), ".md note should be kept");
        assert!(unrelated_empty_path.exists(), "unrelated empty file should be kept");
    }

    // === normalize_explorer_arg のテスト ===
    // スペース入りパスで末尾 `\` があると explorer が壊れる不具合の修正

    #[test]
    fn normalize_removes_trailing_backslash_with_space() {
        // 不具合の本体: スペース有り + 末尾\ → 末尾\を除去する
        assert_eq!(
            normalize_explorer_arg("C:\\Program Files\\WindowsApps\\App_x64\\"),
            "C:\\Program Files\\WindowsApps\\App_x64"
        );
    }

    #[test]
    fn normalize_keeps_path_without_trailing_backslash() {
        // 末尾\が無ければそのまま
        assert_eq!(
            normalize_explorer_arg("C:\\Users\\uck\\note.md"),
            "C:\\Users\\uck\\note.md"
        );
    }

    #[test]
    fn normalize_converts_forward_slashes() {
        // `/` は `\` に変換され、末尾\も除去される
        assert_eq!(
            normalize_explorer_arg("C:/Users/uck/folder/"),
            "C:\\Users\\uck\\folder"
        );
    }

    #[test]
    fn normalize_preserves_drive_root() {
        // ドライブルートは末尾\を残す（"C:" にしない）
        assert_eq!(normalize_explorer_arg("C:\\"), "C:\\");
        assert_eq!(normalize_explorer_arg("C:/"), "C:\\");
    }

    #[test]
    fn normalize_removes_trailing_backslash_for_open_in_explorer_folder() {
        // open_in_explorer も同じ正規化済み引数で存在判定と explorer 起動を行う
        assert_eq!(
            normalize_explorer_arg("C:\\Users\\uck\\AppData\\Local\\ore-no-fusen\\some folder\\"),
            "C:\\Users\\uck\\AppData\\Local\\ore-no-fusen\\some folder"
        );
    }

    #[test]
    fn resolve_open_file_path_removes_markdown_closing_parenthesis_when_needed() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("linked-note.md");
        std::fs::write(&file_path, "test").unwrap();

        let markdown_extracted = format!("{})", file_path.to_string_lossy());
        assert_eq!(
            resolve_open_file_path(&markdown_extracted),
            file_path.to_string_lossy()
        );
    }

    #[test]
    fn resolve_open_file_path_preserves_real_parenthesis_in_filename() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("linked-note).md)");
        std::fs::write(&file_path, "test").unwrap();

        assert_eq!(
            resolve_open_file_path(&file_path.to_string_lossy()),
            file_path.to_string_lossy()
        );
    }
}
