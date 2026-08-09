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
use image::{ExtendedColorType, ImageEncoder, ImageFormat};
use std::fs::{self, File, OpenOptions};
use std::io::{BufWriter, Write};
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

fn validate_annotated_png(bytes: &[u8]) -> Result<(), String> {
    if bytes.is_empty() {
        return Err("画像データが空です。元画像は変更しません。".to_string());
    }

    let format = image::guess_format(bytes)
        .map_err(|e| format!("画像形式を判定できません: {e}"))?;
    if format != ImageFormat::Png {
        return Err("描き込み画像がPNG形式ではありません。元画像は変更しません。".to_string());
    }

    image::load_from_memory_with_format(bytes, ImageFormat::Png)
        .map_err(|e| format!("PNG画像として読み込めません: {e}"))?;
    Ok(())
}

fn replace_file_safely(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "画像の保存先が不正です。".to_string())?;
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "画像ファイル名が不正です。".to_string())?;
    let unique = uuid::Uuid::new_v4();
    let temp_path = parent.join(format!(".{file_name}.{unique}.tmp"));
    let backup_path = parent.join(format!(".{file_name}.{unique}.bak"));

    let write_result = (|| -> Result<(), String> {
        let mut temp_file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)
            .map_err(|e| format!("一時画像ファイルを作成できません: {e}"))?;
        temp_file
            .write_all(bytes)
            .map_err(|e| format!("一時画像ファイルへ書き込めません: {e}"))?;
        temp_file
            .sync_all()
            .map_err(|e| format!("一時画像ファイルを確定できません: {e}"))?;
        drop(temp_file);

        let written = fs::read(&temp_path)
            .map_err(|e| format!("一時画像ファイルを再確認できません: {e}"))?;
        validate_annotated_png(&written)?;

        if path.exists() {
            fs::rename(path, &backup_path)
                .map_err(|e| format!("元画像の退避に失敗しました: {e}"))?;
        }

        if let Err(error) = fs::rename(&temp_path, path) {
            if backup_path.exists() {
                let _ = fs::rename(&backup_path, path);
            }
            return Err(format!("新しい画像への置換に失敗しました: {error}"));
        }

        if backup_path.exists() {
            fs::remove_file(&backup_path)
                .map_err(|e| format!("画像は保存されましたがバックアップ削除に失敗しました: {e}"))?;
        }
        Ok(())
    })();

    if temp_path.exists() {
        let _ = fs::remove_file(&temp_path);
    }
    if write_result.is_err() && backup_path.exists() && !path.exists() {
        let _ = fs::rename(&backup_path, path);
    }
    write_result
}

pub fn save_annotated_image(path: &str, data: &str) -> Result<(), String> {
    use base64::{engine::general_purpose, Engine as _};

    let b64 = data
        .strip_prefix("data:image/png;base64,")
        .ok_or_else(|| "PNGのData URLではありません。元画像は変更しません。".to_string())?;
    if b64.trim().is_empty() {
        return Err("画像データが空です。元画像は変更しません。".to_string());
    }

    let bytes = general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| format!("base64デコード失敗: {e}"))?;
    validate_annotated_png(&bytes)?;

    let target_path = Path::new(path);
    let original_bytes = fs::read(target_path)
        .map_err(|e| format!("元画像を読み込めません: {e}"))?;
    let mut original = image::load_from_memory(&original_bytes)
        .map_err(|e| format!("元画像をデコードできません: {e}"))?
        .to_rgba8();
    let mut overlay = image::load_from_memory_with_format(&bytes, ImageFormat::Png)
        .map_err(|e| format!("描画画像をデコードできません: {e}"))?
        .to_rgba8();

    if overlay.dimensions() != original.dimensions() {
        overlay = image::imageops::resize(
            &overlay,
            original.width(),
            original.height(),
            image::imageops::FilterType::Lanczos3,
        );
    }
    image::imageops::overlay(&mut original, &overlay, 0, 0);

    let mut composed = Vec::new();
    PngEncoder::new_with_quality(
        &mut composed,
        CompressionType::Fast,
        FilterType::Adaptive,
    )
    .write_image(
        original.as_raw(),
        original.width(),
        original.height(),
        ExtendedColorType::Rgba8,
    )
    .map_err(|e| format!("合成画像をPNGへ変換できません: {e}"))?;
    replace_file_safely(target_path, &composed)
}

pub fn read_local_image_data_url(path: &str) -> Result<String, String> {
    use base64::{engine::general_purpose, Engine as _};

    let bytes = fs::read(path).map_err(|e| format!("更新画像を読み込めません: {e}"))?;
    let format = image::guess_format(&bytes)
        .map_err(|e| format!("更新画像の形式を判定できません: {e}"))?;
    let mime = match format {
        ImageFormat::Png => "image/png",
        ImageFormat::Jpeg => "image/jpeg",
        ImageFormat::Gif => "image/gif",
        ImageFormat::WebP => "image/webp",
        ImageFormat::Bmp => "image/bmp",
        _ => return Err("表示に対応していない画像形式です。".to_string()),
    };
    Ok(format!(
        "data:{mime};base64,{}",
        general_purpose::STANDARD.encode(bytes)
    ))
}

#[tauri::command]
pub fn fusen_save_annotated_image(path: String, data: String) -> Result<(), String> {
    save_annotated_image(&path, &data)
}

#[tauri::command]
pub fn fusen_read_local_image_data_url(path: String) -> Result<String, String> {
    read_local_image_data_url(&path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine as _;

    fn valid_png_data_url() -> String {
        use base64::{engine::general_purpose, Engine as _};

        let path = std::env::temp_dir().join(format!(
            "ore-no-fusen-annotation-source-{}-{}.png",
            std::process::id(),
            uuid::Uuid::new_v4()
        ));
        let pixels = [255, 0, 0, 255, 0, 255, 0, 255];
        save_rgba_png_fast(&path, &pixels, 2, 1).unwrap();
        let bytes = fs::read(&path).unwrap();
        let _ = fs::remove_file(path);
        format!(
            "data:image/png;base64,{}",
            general_purpose::STANDARD.encode(bytes)
        )
    }

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

    #[test]
    fn annotated_image_rejects_empty_data_and_keeps_original() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("image.png");
        fs::write(&target, b"original").unwrap();

        let result = save_annotated_image(
            target.to_str().unwrap(),
            "data:image/png;base64,",
        );

        assert!(result.is_err());
        assert_eq!(fs::read(&target).unwrap(), b"original");
    }

    #[test]
    fn annotated_image_rejects_non_png_and_keeps_original() {
        use base64::{engine::general_purpose, Engine as _};

        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("image.png");
        fs::write(&target, b"original").unwrap();
        let data = format!(
            "data:image/png;base64,{}",
            general_purpose::STANDARD.encode(b"not-a-png")
        );

        let result = save_annotated_image(target.to_str().unwrap(), &data);

        assert!(result.is_err());
        assert_eq!(fs::read(&target).unwrap(), b"original");
    }

    #[test]
    fn annotated_image_safely_replaces_original_with_valid_png() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("image.png");
        let original_pixels = [0, 0, 255, 255, 0, 0, 255, 255];
        save_rgba_png_fast(&target, &original_pixels, 2, 1).unwrap();

        save_annotated_image(target.to_str().unwrap(), &valid_png_data_url()).unwrap();

        let saved = fs::read(&target).unwrap();
        assert!(!saved.is_empty());
        assert_eq!(image::guess_format(&saved).unwrap(), ImageFormat::Png);
        let decoded = image::load_from_memory_with_format(&saved, ImageFormat::Png)
            .unwrap()
            .to_rgba8();
        assert_eq!(decoded.dimensions(), (2, 1));
        assert_eq!(decoded.as_raw(), &[255, 0, 0, 255, 0, 255, 0, 255]);
    }

    #[test]
    fn annotated_image_reload_reads_the_updated_file_without_asset_cache() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("image.png");
        let pixels = [12, 34, 56, 255];
        save_rgba_png_fast(&target, &pixels, 1, 1).unwrap();

        let data_url = read_local_image_data_url(target.to_str().unwrap()).unwrap();

        assert!(data_url.starts_with("data:image/png;base64,"));
        let encoded = data_url.split_once(',').unwrap().1;
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .unwrap();
        assert_eq!(decoded, fs::read(target).unwrap());
    }
}
