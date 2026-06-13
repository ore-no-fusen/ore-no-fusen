/*
 * ストレージ層 (File I/O)
 *
 * 責務:
 * - ローカルファイルシステムへのアクセス（読み書き、リネーム、削除）
 * - 設定ファイルの永続化
 * - ディレクトリ操作（作成、走査）
 */

use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;
use crate::state::{Note, NoteMeta};
use crate::logic;

// UC-01: 設定ファイル管理
pub use crate::state::Settings;

pub fn get_settings_path() -> Result<PathBuf, String> {
    let app_data = std::env::var("APPDATA").map_err(|_| "APPDATA not found".to_string())?;
    let config_dir = PathBuf::from(app_data).join("OreNoFusen");
    fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    Ok(config_dir.join("settings.json"))
}

pub fn load_settings() -> Result<Settings, String> {
    let path = get_settings_path()?;
    if !path.exists() {
        return Ok(Settings::default());
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

pub fn save_settings(settings: &Settings) -> Result<(), String> {
    if let Some(base_path) = &settings.base_path {
        validate_storage_path(base_path)?;
    }

    let path = get_settings_path()?;
    let content = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())
}

pub fn ensure_directory(path: &str) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|e| e.to_string())
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
                    None // folded
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

        notes.push(NoteMeta {
            path: actual_path.to_string_lossy().to_string(),
            seq,
            context,
            updated,
            x, y, width, height, background_color, always_on_top, folded,
            tags,
        });
    }
    notes.sort_by(|a, b| a.path.cmp(&b.path));
    notes
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

    let frontmatter = logic::generate_frontmatter(seq, &context, &today, &today, Some("#f7e9b0"), &[], None);
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
        },
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
    let trash_dir = parent_path.join("Trash");
    if !trash_dir.exists() {
        fs::create_dir(&trash_dir).map_err(|e| e.to_string())?;
    }
    Ok(trash_dir)
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
            
            // すでに存在する場合はスキップまたは上書き
            if !dest_asset_path.exists() {
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

pub fn open_file(path: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let arg_path = normalize_explorer_arg(path);

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
pub fn backup_notes(source_dir: &str, dest_dir: &str) -> Result<usize, String> {
    let src = std::path::Path::new(source_dir);
    let dst = std::path::Path::new(dest_dir);

    if !src.exists() {
        return Err(format!("バックアップ元が見つかりません: {}", source_dir));
    }
    if !dst.exists() {
        return Err(format!("バックアップ先が見つかりません: {}", dest_dir));
    }

    let mut count = 0;
    backup_dir_recursive(src, dst, &mut count)?;
    Ok(count)
}

fn backup_dir_recursive(src: &std::path::Path, dst: &std::path::Path, count: &mut usize) -> Result<(), String> {
    for entry in fs::read_dir(src).map_err(|e| e.to_string())?.filter_map(|e| e.ok()) {
        let path = entry.path();
        let dest = dst.join(entry.file_name());
        if path.is_dir() {
            fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
            backup_dir_recursive(&path, &dest, count)?;
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
}
