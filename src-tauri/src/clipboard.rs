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

const MAX_DROPPED_IMAGE_BYTES: u64 = 50 * 1024 * 1024;
const DROPPED_IMAGE_EXTENSIONS: [&str; 6] = ["png", "jpg", "jpeg", "gif", "webp", "bmp"];

fn validate_dropped_image_size(byte_len: u64) -> Result<(), String> {
    if byte_len > MAX_DROPPED_IMAGE_BYTES {
        Err("画像ファイルが50MBを超えています。".to_string())
    } else {
        Ok(())
    }
}

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

pub fn save_dropped_image_data(
    note_path: &str,
    file_name: &str,
    data: &str,
) -> Result<String, String> {
    use base64::{engine::general_purpose, Engine as _};

    let extension = Path::new(file_name)
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .filter(|value| DROPPED_IMAGE_EXTENSIONS.contains(&value.as_str()))
        .ok_or_else(|| "対応していない画像形式です。".to_string())?;
    let encoded = data.split_once(',').map(|(_, value)| value).unwrap_or(data);
    let bytes = general_purpose::STANDARD
        .decode(encoded)
        .map_err(|e| format!("画像データのデコードに失敗しました: {e}"))?;
    validate_dropped_image_size(bytes.len() as u64)?;

    let note_parent = Path::new(note_path)
        .parent()
        .ok_or_else(|| "付箋の保存先が不正です。".to_string())?;
    let assets_dir = note_parent.join("assets");
    fs::create_dir_all(&assets_dir).map_err(|e| e.to_string())?;
    let timestamp = Local::now().format("%Y%m%d_%H%M%S_%f");
    let unique = &uuid::Uuid::new_v4().to_string()[..8];
    let filename = format!("dropped_{}_{}.{}", timestamp, unique, extension);
    fs::write(assets_dir.join(&filename), bytes).map_err(|e| e.to_string())?;
    Ok(format!("assets/{}", filename))
}

#[tauri::command]
pub fn fusen_save_dropped_image_data(
    path: String,
    file_name: String,
    data: String,
) -> Result<String, String> {
    save_dropped_image_data(&path, &file_name, &data)
}

pub fn remove_dropped_images(note_path: &str, relative_paths: &[String]) -> Result<(), String> {
    let note_parent = Path::new(note_path)
        .parent()
        .ok_or_else(|| "付箋の保存先が不正です。".to_string())?;
    for relative_path in relative_paths {
        let relative = Path::new(relative_path);
        let file_name = relative
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| "画像ファイル名が不正です。".to_string())?;
        if relative.parent() != Some(Path::new("assets")) || !file_name.starts_with("dropped_") {
            return Err("削除対象の画像パスが不正です。".to_string());
        }
        match fs::remove_file(note_parent.join(relative)) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(())
}

#[tauri::command]
pub fn fusen_remove_dropped_images(
    path: String,
    relative_paths: Vec<String>,
) -> Result<(), String> {
    remove_dropped_images(&path, &relative_paths)
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

    #[test]
    fn dropped_image_data_is_written_into_note_assets() {
        use base64::{engine::general_purpose, Engine as _};

        let dir = tempfile::tempdir().unwrap();
        let note_path = dir.path().join("note.md");
        fs::write(&note_path, "memo").unwrap();
        let encoded = general_purpose::STANDARD.encode(b"png-bytes");

        let relative =
            save_dropped_image_data(note_path.to_str().unwrap(), "photo.PNG", &encoded).unwrap();

        assert!(relative.starts_with("assets/dropped_"));
        assert!(relative.ends_with(".png"));
        assert_eq!(fs::read(dir.path().join(relative)).unwrap(), b"png-bytes");
    }

    #[test]
    fn dropped_images_are_removed_after_a_failed_import() {
        let dir = tempfile::tempdir().unwrap();
        let note_path = dir.path().join("note.md");
        let assets = dir.path().join("assets");
        fs::create_dir_all(&assets).unwrap();
        fs::write(&note_path, "memo").unwrap();
        fs::write(assets.join("dropped_test.png"), b"image").unwrap();

        remove_dropped_images(
            note_path.to_str().unwrap(),
            &["assets/dropped_test.png".to_string()],
        )
        .unwrap();

        assert!(!assets.join("dropped_test.png").exists());
    }

    #[test]
    fn dropped_image_cleanup_rejects_unrelated_assets() {
        let dir = tempfile::tempdir().unwrap();
        let note_path = dir.path().join("note.md");
        let assets = dir.path().join("assets");
        fs::create_dir_all(&assets).unwrap();
        fs::write(&note_path, "memo").unwrap();
        fs::write(assets.join("existing.png"), b"keep").unwrap();

        let result = remove_dropped_images(
            note_path.to_str().unwrap(),
            &["assets/existing.png".to_string()],
        );

        assert!(result.is_err());
        assert!(assets.join("existing.png").exists());
    }

    #[test]
    fn dropped_image_size_accepts_limit_and_rejects_one_byte_over() {
        assert!(validate_dropped_image_size(MAX_DROPPED_IMAGE_BYTES).is_ok());
        assert!(validate_dropped_image_size(MAX_DROPPED_IMAGE_BYTES + 1).is_err());
    }

    #[test]
    fn dropped_image_save_uses_unique_names_for_same_original_name() {
        use base64::{engine::general_purpose, Engine as _};

        let dir = tempfile::tempdir().unwrap();
        let note_path = dir.path().join("note.md");
        fs::write(&note_path, "memo").unwrap();
        let encoded = general_purpose::STANDARD.encode(b"same-name");

        let first = save_dropped_image_data(
            note_path.to_str().unwrap(),
            "同じ 名前.PNG",
            &encoded,
        )
        .unwrap();
        let second = save_dropped_image_data(
            note_path.to_str().unwrap(),
            "同じ 名前.PNG",
            &encoded,
        )
        .unwrap();

        assert_ne!(first, second);
        assert!(dir.path().join(first).exists());
        assert!(dir.path().join(second).exists());
    }
}
