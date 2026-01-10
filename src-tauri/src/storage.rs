
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
                    Some("#f7e9b0")
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

                if let Ok(content) = fs::read_to_string(path) {
                     let (lx, ly, lw, lh, lc, laot) = logic::extract_meta_from_content(&content);
                     x = lx; y = ly; width = lw; height = lh; background_color = lc; always_on_top = laot;
                }

                notes.push(NoteMeta {
                    path: path.to_string_lossy().to_string(),
                    seq,
                    context,
                    updated,
                    x, y, width, height, background_color, always_on_top
                });
            }
        }
    }
    notes.sort_by(|a, b| a.path.cmp(&b.path));
    notes
}

pub fn read_note(path: &str) -> Result<Note, String> {
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    
    // TEMP: Return full content as body - frontend will split
    Ok(Note {
        body: content,
        frontmatter: String::new(),
        meta: NoteMeta { path: path.to_string(), ..Default::default() },
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

pub fn open_in_explorer(path: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        // Convert forward slashes to backslashes for Windows
        let windows_path = path.replace('/', "\\");
        
        // Use explorer /select to open and highlight the file
        Command::new("explorer")
            .arg("/select,")
            .arg(&windows_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        // Fallback for non-windows
        return Err("Not implemented for this platform".to_string());
    }
    Ok(())
}
