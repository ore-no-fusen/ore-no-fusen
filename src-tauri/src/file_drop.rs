//! FileDrop's validation and exclusive Vault writes. Independent of video naming.
use serde::Deserialize;
use std::{
    io::Write,
    path::{Path, PathBuf},
};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileRef {
    pub file_name: String,
    pub original_file_name: String,
    pub mime_type: String,
    pub size: u64,
}

pub fn collect(item: &serde_json::Value) -> Result<Vec<FileRef>, String> {
    let Some(value) = item.get("files") else {
        return Ok(vec![]);
    };
    let files: Vec<FileRef> =
        serde_json::from_value(value.clone()).map_err(|e| format!("Invalid files: {e}"))?;
    if files.iter().any(|f| {
        !f.file_name.starts_with("fusen_file_")
            || !f
                .file_name
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.'))
            || f.original_file_name.is_empty()
            || f.mime_type.is_empty()
    }) {
        return Err("Invalid file attachment metadata".into());
    }
    Ok(files)
}

fn safe_name(original: &str) -> String {
    let leaf = original.rsplit(['/', '\\']).next().unwrap_or("file");
    let name: String = leaf
        .chars()
        .map(|c| {
            if c.is_control() || matches!(c, ':' | '*' | '?' | '"' | '<' | '>' | '|') {
                '_'
            } else {
                c
            }
        })
        .collect();
    let name = name.trim().trim_end_matches(['.', ' ']);
    let name = if name.is_empty() { "file" } else { name };
    let stem = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    let reserved = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL" | "CLOCK$")
        || (stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && matches!(stem.as_bytes()[3], b'1'..=b'9'));
    if reserved {
        format!("_{name}")
    } else {
        name.to_string()
    }
}

/// create_new reserves the name atomically, including under concurrent receivers.
pub fn save(vault: &Path, file: &FileRef, bytes: &[u8]) -> Result<PathBuf, String> {
    if bytes.len() as u64 != file.size {
        return Err("File size mismatch".into());
    }
    let root = vault.canonicalize().map_err(|e| e.to_string())?;
    let assets = std::path::absolute(vault)
        .map_err(|e| e.to_string())?
        .join("assets");
    std::fs::create_dir_all(&assets).map_err(|e| e.to_string())?;
    if !assets
        .canonicalize()
        .map_err(|e| e.to_string())?
        .starts_with(&root)
    {
        return Err("Assets outside Vault".into());
    }
    let dir = assets.join("files");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    if !dir
        .canonicalize()
        .map_err(|e| e.to_string())?
        .starts_with(&root)
    {
        return Err("Files outside Vault".into());
    }
    let name = safe_name(&file.original_file_name);
    let p = Path::new(&name);
    let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
    let ext = p.extension().and_then(|s| s.to_str());
    for n in 1..=9999 {
        let candidate = if n == 1 {
            name.clone()
        } else {
            match ext {
                Some(ext) => format!("{stem}_{n}.{ext}"),
                None => format!("{stem}_{n}"),
            }
        };
        let path = dir.join(candidate);
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
        {
            Ok(mut output) => {
                if let Err(error) = output.write_all(bytes).and_then(|_| output.sync_all()) {
                    drop(output);
                    let _ = std::fs::remove_file(&path);
                    return Err(error.to_string());
                }
                return Ok(path);
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.to_string()),
        }
    }
    Err("No available attachment name".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn file(name: &str) -> FileRef {
        FileRef {
            file_name: "fusen_file_test".into(),
            original_file_name: name.into(),
            mime_type: "application/pdf".into(),
            size: 4,
        }
    }
    #[test]
    fn preserves_bytes_extension_and_does_not_overwrite() {
        let vault = tempfile::tempdir().unwrap();
        let first = save(vault.path(), &file("説明.PDF"), b"%PDF").unwrap();
        let second = save(vault.path(), &file("説明.PDF"), b"abcd").unwrap();
        assert_eq!(first.file_name().unwrap(), "説明.PDF");
        assert_eq!(second.file_name().unwrap(), "説明_2.PDF");
        assert_eq!(std::fs::read(first).unwrap(), b"%PDF");
        assert_eq!(std::fs::read(second).unwrap(), b"abcd");
    }
    #[test]
    fn rejects_incomplete_download_without_creating_file() {
        let vault = tempfile::tempdir().unwrap();
        assert!(save(vault.path(), &file("memo.pdf"), b"bad").is_err());
        assert!(!vault.path().join("assets").exists());
    }
    #[test]
    fn sanitizes_paths_windows_names_and_keeps_extensions() {
        assert_eq!(safe_name("../../説明.pdf"), "説明.pdf");
        assert_eq!(safe_name("C:\\temp\\CON.pdf"), "_CON.pdf");
        assert_eq!(safe_name("a:b?.ZIP"), "a_b_.ZIP");
        assert_eq!(safe_name(".."), "file");
    }
    #[test]
    fn metadata_is_generic_and_malformed_files_fail_closed() {
        assert!(collect(&serde_json::json!({"body":"old note"}))
            .unwrap()
            .is_empty());
        let valid = serde_json::json!({"files":[{"fileName":"fusen_file_1", "originalFileName":"音声.wav", "mimeType":"audio/wav", "size":4}]});
        assert_eq!(collect(&valid).unwrap()[0].original_file_name, "音声.wav");
        assert!(collect(&serde_json::json!({"files":[{"fileName":"other"}]})).is_err());
        assert!(collect(&serde_json::json!({"files":null})).is_err());
    }
    #[test]
    fn file_only_and_extensionless_attachments_are_supported() {
        let vault = tempfile::tempdir().unwrap();
        assert_eq!(
            save(vault.path(), &file("README"), b"data")
                .unwrap()
                .file_name()
                .unwrap(),
            "README"
        );
        assert_eq!(
            save(vault.path(), &file("README"), b"data")
                .unwrap()
                .file_name()
                .unwrap(),
            "README_2"
        );
    }
}
