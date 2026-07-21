/*
 * クリップボード管理
 *
 * 責務:
 * - クリップボードからの画像データ取得
 * - 取得した画像のローカル保存処理
 */

use arboard::Clipboard;
use chrono::Local;
use image::codecs::png::{CompressionType, FilterType, PngEncoder};
use image::{ExtendedColorType, ImageEncoder};
use std::fs::{self, File};
use std::io::BufWriter;
use std::path::Path;

fn save_rgba_png_fast(
    target_path: &Path,
    bytes: &[u8],
    width: u32,
    height: u32,
) -> Result<(), String> {
    let output = File::create(target_path).map_err(|e| e.to_string())?;
    let encoder = PngEncoder::new_with_quality(
        BufWriter::new(output),
        CompressionType::Fast,
        FilterType::Adaptive,
    );
    encoder
        .write_image(bytes, width, height, ExtendedColorType::Rgba8)
        .map_err(|e| e.to_string())
}

// [NEW] クリップボードから画像を取得して保存する
pub fn get_image_from_clipboard(note_path: &str) -> Result<String, String> {
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;

    // 画像データを取得
    let image = clipboard
        .get_image()
        .map_err(|_| "No image in clipboard".to_string())?;

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

    // 貼り付けの応答を優先し、画質を変えずに高速設定で PNG 圧縮する。
    // 標準圧縮よりファイルが多少大きくなる可能性がある。
    save_rgba_png_fast(
        &target_path,
        image.bytes.as_ref(),
        image.width as u32,
        image.height as u32,
    )?;

    // 相対パスを返す (assets/filename)
    Ok(format!("assets/{}", filename))
}

#[tauri::command]
pub fn fusen_get_image_from_clipboard(path: String) -> Result<String, String> {
    get_image_from_clipboard(&path)
}

#[tauri::command]
pub fn fusen_save_annotated_image(path: String, data: String) -> Result<(), String> {
    use base64::{engine::general_purpose, Engine as _};
    let b64 = data.strip_prefix("data:image/png;base64,").unwrap_or(&data);
    let bytes = general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| format!("base64デコード失敗: {e}"))?;
    fs::write(&path, &bytes).map_err(|e| format!("ファイル書き込み失敗: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fast_png_keeps_rgba_pixels() {
        let path =
            std::env::temp_dir().join(format!("ore-no-fusen-fast-png-{}.png", std::process::id()));
        let pixels = [255, 0, 0, 128, 0, 255, 0, 255];

        save_rgba_png_fast(&path, &pixels, 2, 1).expect("fast PNG save should succeed");
        let decoded = image::open(&path)
            .expect("saved PNG should decode")
            .to_rgba8();

        assert_eq!(decoded.dimensions(), (2, 1));
        assert_eq!(decoded.as_raw(), &pixels);
        let _ = fs::remove_file(path);
    }
}
