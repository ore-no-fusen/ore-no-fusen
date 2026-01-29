use tauri::Runtime;
use std::path::{Path, PathBuf};
use std::fs;
use arboard::Clipboard;
use chrono::Local;

// [NEW] クリップボードから画像を取得して保存する
pub fn get_image_from_clipboard(note_path: &str) -> Result<String, String> {
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    
    // 画像データを取得
    let image = clipboard.get_image().map_err(|_| "No image in clipboard".to_string())?;
    
    // ノートのディレクトリを特定
    let current_path = Path::new(note_path);
    let parent_dir = current_path.parent().ok_or("Invalid note path")?;
    
    // assetsディレクトリを作成
    let assets_dir = parent_dir.join("assets");
    if !assets_dir.exists() {
        fs::create_dir_all(&assets_dir).map_err(|e| e.to_string())?;
    }
    
    // ファイル名生成 (pasted_YYYYMMDD_HHmmss_NANOS.png)
    let timestamp = Local::now().format("%Y%m%d_%H%M%S_%f");
    let filename = format!("pasted_{}.png", timestamp);
    let target_path = assets_dir.join(&filename);
    
    // 画像保存
    // image crateを使って保存
    let img_buf = image::ImageBuffer::<image::Rgba<u8>, Vec<u8>>::from_raw(
        image.width as u32,
        image.height as u32,
        image.bytes.into_owned()
    ).ok_or("Failed to create image buffer")?;
    
    img_buf.save(&target_path).map_err(|e| e.to_string())?;
    
    // 相対パスを返す (assets/filename)
    Ok(format!("assets/{}", filename))
}

#[tauri::command]
pub fn fusen_get_image_from_clipboard(path: String) -> Result<String, String> {
    get_image_from_clipboard(&path)
}
