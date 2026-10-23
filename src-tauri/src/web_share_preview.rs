//! Small, immutable Web renditions. Windows originals never get rewritten.
use image::{codecs::jpeg::JpegEncoder, GenericImageView, ImageDecoder};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashSet};

pub(crate) const MAX_PREVIEW_BYTES: usize = 1024 * 1024;
pub(crate) const MAX_PREVIEW_EDGE: u32 = 1600;
pub(crate) const PREVIEW_BUDGET_BYTES: u64 = 128 * 1024 * 1024;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct PreviewAsset {
    pub file_id: String,
    pub source_sha256: String,
    pub sha256: String,
    pub mime_type: String,
    pub size_bytes: u32,
    pub width: u32,
    pub height: u32,
    /// Legacy files remain read-only during migration; only managed previews
    /// may be garbage-collected by the new protocol.
    pub legacy: bool,
}
impl PreviewAsset {
    pub fn validate(&self, source: &str) -> Result<(), String> {
        fn hash(s: &str) -> bool {
            s.len() == 64
                && s.bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        }
        if self.file_id.is_empty()
            || self.source_sha256 != source
            || !hash(source)
            || !hash(&self.sha256)
            || self.size_bytes == 0
        {
            return Err("Web画像の識別情報が不正です".into());
        }
        if self.legacy {
            if self.size_bytes > 50 * 1024 * 1024
                || self.sha256 != source
                || ![
                    "image/jpeg",
                    "image/png",
                    "image/gif",
                    "image/bmp",
                    "image/webp",
                ]
                .contains(&self.mime_type.as_str())
            {
                return Err("旧画像の識別情報が不正です".into());
            }
        } else if self.size_bytes as usize > MAX_PREVIEW_BYTES
            || self.mime_type != "image/jpeg"
            || self.width == 0
            || self.height == 0
            || self.width > MAX_PREVIEW_EDGE
            || self.height > MAX_PREVIEW_EDGE
        {
            return Err("Web用画像の容量または画素数の上限を超えています".into());
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ImageReservation {
    pub mutation_id: String,
    pub owner_pc: String,
    pub expires_at: i64,
    pub assets: BTreeMap<String, PreviewAsset>,
}

pub(crate) struct EncodedPreview {
    pub bytes: Vec<u8>,
    pub width: u32,
    pub height: u32,
    pub sha256: String,
}
pub(crate) fn encode_preview(source: &[u8]) -> Result<EncodedPreview, String> {
    if source.is_empty() || source.len() > 50 * 1024 * 1024 {
        return Err("原本画像の容量上限を超えています".into());
    }
    let mut reader = image::ImageReader::new(std::io::Cursor::new(source))
        .with_guessed_format()
        .map_err(|_| "画像形式を判定できません")?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(4096);
    limits.max_image_height = Some(4096);
    limits.max_alloc = Some(128 * 1024 * 1024);
    reader.limits(limits);
    let mut decoder = reader
        .into_decoder()
        .map_err(|_| "画像が壊れているか、画素数上限を超えています")?;
    let orientation = decoder
        .orientation()
        .map_err(|_| "写真の向きを確認できません")?;
    let mut original = image::DynamicImage::from_decoder(decoder)
        .map_err(|_| "画像が壊れているか、画素数上限を超えています")?;
    original.apply_orientation(orientation);
    for edge in [1600, 1280, 1024, 800, 640] {
        let resized = if original.width() <= edge && original.height() <= edge {
            original.clone()
        } else {
            original.resize(edge, edge, image::imageops::FilterType::Lanczos3)
        };
        let (width, height) = resized.dimensions();
        // JPEG has no alpha. Composite onto white only for the disposable Web
        // preview, preserving the original file and its transparency.
        let rgba = resized.to_rgba8();
        let rgb = image::RgbImage::from_fn(width, height, |x, y| {
            let p = rgba.get_pixel(x, y);
            let a = p[3] as u32;
            image::Rgb([0, 1, 2].map(|i| ((p[i] as u32 * a + 255 * (255 - a) + 127) / 255) as u8))
        });
        for quality in [82, 72, 62] {
            let mut bytes = Vec::new();
            JpegEncoder::new_with_quality(&mut bytes, quality)
                .encode_image(&rgb)
                .map_err(|_| "Web画像を圧縮できません")?;
            if bytes.len() <= MAX_PREVIEW_BYTES {
                let sha256 = format!("{:x}", Sha256::digest(&bytes));
                return Ok(EncodedPreview {
                    bytes,
                    width,
                    height,
                    sha256,
                });
            }
        }
    }
    Err("Web用画像を容量上限以内にできません。原本は変更していません".into())
}

pub(crate) fn owned_preview_name(note_id: &str, name: &str) -> bool {
    let Some(id) = name
        .strip_prefix(&format!("web-image-{note_id}-"))
        .and_then(|s| s.strip_suffix(".jpg"))
    else {
        return false;
    };
    uuid::Uuid::parse_str(id).is_ok_and(|value| value.to_string() == id)
}
/// All current and reserved IDs are protected. Never infer ownership from hash.
pub(crate) fn orphan_candidates(
    note_id: &str,
    files: &[(String, String)],
    assets: &BTreeMap<String, PreviewAsset>,
    pending: Option<&ImageReservation>,
) -> Vec<(String, String)> {
    let protected = assets
        .values()
        .map(|a| a.file_id.as_str())
        .chain(
            pending
                .into_iter()
                .flat_map(|p| p.assets.values().map(|a| a.file_id.as_str())),
        )
        .collect::<HashSet<_>>();
    files
        .iter()
        .filter(|(id, name)| owned_preview_name(note_id, name) && !protected.contains(id.as_str()))
        .cloned()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    fn png(width: u32, height: u32) -> Vec<u8> {
        let img = image::RgbaImage::from_fn(width, height, |x, y| {
            image::Rgba([(x % 255) as u8, (y % 255) as u8, 80, 255])
        });
        let mut bytes = std::io::Cursor::new(Vec::new());
        image::DynamicImage::ImageRgba8(img)
            .write_to(&mut bytes, image::ImageFormat::Png)
            .unwrap();
        bytes.into_inner()
    }
    #[test]
    fn preview_is_bounded_and_original_unchanged() {
        let original = png(1800, 600);
        let before = original.clone();
        let preview = encode_preview(&original).unwrap();
        assert!(preview.width <= MAX_PREVIEW_EDGE && preview.height <= MAX_PREVIEW_EDGE);
        assert!(preview.bytes.len() <= MAX_PREVIEW_BYTES);
        assert_eq!(original, before);
        let decoded = image::load_from_memory(&preview.bytes).unwrap();
        assert_eq!(decoded.dimensions(), (preview.width, preview.height));
        assert_eq!(
            format!("{:x}", Sha256::digest(&preview.bytes)),
            preview.sha256
        );
    }
    #[test]
    fn small_images_are_never_enlarged_and_invalid_images_are_rejected() {
        let preview = encode_preview(&png(32, 16)).unwrap();
        assert_eq!((preview.width, preview.height), (32, 16));
        assert!(encode_preview(b"not an image").is_err());
        assert!(encode_preview(&[]).is_err());
    }
    #[test]
    fn jpeg_exif_orientation_is_applied_before_metadata_is_removed() {
        let mut jpeg = Vec::new();
        JpegEncoder::new(&mut jpeg)
            .encode_image(&image::RgbImage::new(32, 16))
            .unwrap();
        // APP1 Exif, little-endian TIFF, one SHORT Orientation=6 (90°).
        let exif = [
            b'E', b'x', b'i', b'f', 0, 0, b'I', b'I', 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1,
            0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0,
        ];
        let mut oriented = jpeg[..2].to_vec();
        oriented.extend([0xff, 0xe1]);
        oriented.extend(((exif.len() + 2) as u16).to_be_bytes());
        oriented.extend(exif);
        oriented.extend(&jpeg[2..]);
        let preview = encode_preview(&oriented).unwrap();
        assert_eq!((preview.width, preview.height), (16, 32));
    }
    #[test]
    fn garbage_collection_protects_current_and_pending_and_ignores_legacy_files() {
        let id = uuid::Uuid::new_v4().to_string();
        let name = |s: &str| format!("web-image-note-{s}.jpg");
        let asset = |file: &str| PreviewAsset {
            file_id: file.into(),
            source_sha256: "a".repeat(64),
            sha256: "b".repeat(64),
            mime_type: "image/jpeg".into(),
            size_bytes: 42,
            width: 2,
            height: 2,
            legacy: false,
        };
        let assets = BTreeMap::from([("current".into(), asset("current"))]);
        let pending = ImageReservation {
            mutation_id: id.clone(),
            owner_pc: "pc".into(),
            expires_at: 0,
            assets: BTreeMap::from([("pending".into(), asset("pending"))]),
        };
        let files = vec![
            ("current".into(), name(&id)),
            ("pending".into(), name(&id)),
            ("orphan".into(), name(&id)),
            ("legacy".into(), format!("image-{}", "a".repeat(64))),
            ("foreign".into(), format!("web-image-other-{id}.jpg")),
            ("unknown".into(), name("invalid")),
        ];
        assert_eq!(
            orphan_candidates("note", &files, &assets, Some(&pending)),
            vec![("orphan".into(), name(&id))]
        );
        assert_eq!(orphan_candidates("note", &files, &assets, None).len(), 2);
    }
}
