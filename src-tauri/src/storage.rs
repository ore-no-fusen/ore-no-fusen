
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
    let path = get_settings_path()?;
    let content = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())
}

pub fn ensure_directory(path: &str) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|e| e.to_string())
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
                let first_line = body.lines().next().unwrap_or("imported").trim();
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
                    &[]
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
    let walker = WalkDir::new(folder_path).max_depth(1).into_iter();

    for entry in walker.filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "md") {
                let filename = path.file_name().unwrap().to_string_lossy().to_string();
                let (seq, updated, context) = logic::parse_filename(&filename);
                
                let mut x = None;
                let mut y = None;
                let mut width = None;
                let mut height = None;
                let mut background_color = None;
                let mut always_on_top = None;
                let mut tags = Vec::new();

                if let Ok(content) = fs::read_to_string(path) {
                     let (lx, ly, lw, lh, lc, laot, ltags) = logic::extract_meta_from_content(&content);
                     x = lx; y = ly; width = lw; height = lh; background_color = lc; always_on_top = laot;
                     tags = ltags;
                }

                notes.push(NoteMeta {
                    path: path.to_string_lossy().to_string(),
                    seq,
                    context,
                    updated,
                    x, y, width, height, background_color, always_on_top,
                    tags
                });
            }
        }
    }
    notes.sort_by(|a, b| a.path.cmp(&b.path));
    notes
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
    let (x, y, width, height, background_color, always_on_top, tags) = logic::extract_meta_from_content(&content);

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
        },
    })
}

pub fn write_note(path: &str, content: &str) -> Result<(), String> {
    fs::write(path, content).map_err(|e| e.to_string())
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



pub fn create_symlink(src: &Path, dest: &Path) -> Result<(), String> {
    #[cfg(windows)]
    {
        std::os::windows::fs::symlink_file(src, dest).map_err(|e| e.to_string())
    }
    #[cfg(not(windows))]
    {
        std::os::unix::fs::symlink(src, dest).map_err(|e| e.to_string())
    }
}

pub fn copy_associated_assets(note_path: &Path, target_note_dir: &Path) -> Result<(), String> {
    let content = fs::read_to_string(note_path).map_err(|e| e.to_string())?;
    let re = regex::Regex::new(r"!\[[^\]]*\]\((assets/[^)]+)\)").unwrap();

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
    let re = regex::Regex::new(r"!\[[^\]]*\]\((assets/[^)]+)\)").unwrap();

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

        // Convert forward slashes to backslashes for Windows
        let windows_path = path.replace('/', "\\");

        // [DEBUG] Log path
        crate::logger::log_info(&format!("[DEBUG] open_in_explorer called with: '{}'", path));
        
        let path_obj = Path::new(&windows_path);
        
        if path_obj.exists() {
            // Plan A: File exists, select it
            Command::new("explorer")
                .arg("/select,")
                .arg(&windows_path)
                .spawn()
                .map_err(|e| e.to_string())?;
        } else {
            // Plan B: File missing, open parent folder (Fallback)
            crate::logger::log_warn(&format!("[WARN] File not found: '{}'. Opening parent folder.", windows_path));
            if let Some(parent) = path_obj.parent() {
                 Command::new("explorer")
                    .arg(parent)
                    .spawn()
                    .map_err(|e| e.to_string())?;
            } else {
                 // Fallback if parent lookup fails (e.g. root), try opening path directly
                  Command::new("explorer")
                    .arg(&windows_path)
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

pub fn open_file(path: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        // Convert forward slashes to backslashes for Windows
        let windows_path = path.replace('/', "\\");
        
        // Open file or folder with default application (explorer handles both)
        Command::new("explorer")
            .arg(&windows_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        return Err("Not implemented for this platform".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

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
    fn test_create_symlink() {
        let dir = tempdir().unwrap();
        let src = dir.path().join("source.md");
        let dest = dir.path().join("link.md");
        
        fs::write(&src, "content").unwrap();
        
        // symlink creation might fail if not running with enough privileges on Windows
        // but we want to test the wrapper.
        match create_symlink(&src, &dest) {
            Ok(_) => {
                assert!(dest.exists());
                let content = fs::read_to_string(&dest).unwrap();
                assert_eq!(content, "content");
            },
            Err(e) => {
                // If it's a privilege issue, we might skip or just log it.
                // On Windows, Developer Mode or Admin is needed.
                println!("Symlink test skipped/failed (likely privileges): {}", e);
            }
        }
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
x: 100.0
y: 200.0
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
}
