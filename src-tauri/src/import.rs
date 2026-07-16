/*
 * インポート機能
 *
 * 責務:
 * - 外部ディレクトリからのMarkdownファイル取り込み
 * - インポート時の統計情報生成
 *
 * 対象:
 * - source_dir 直下の .md ファイル
 * - source_dir/assets/ ディレクトリ以下のファイル全部
 */

use std::fs;
use std::path::Path;
use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ImportStats {
    pub total_files: usize,
    pub imported_md: usize,
    pub imported_images: usize,
    pub imported_paths: Vec<String>,
    pub skipped: usize,
    pub errors: Vec<String>,
}

impl ImportStats {
    fn new() -> Self {
        Self {
            total_files: 0,
            imported_md: 0,
            imported_images: 0,
            imported_paths: Vec::new(),
            skipped: 0,
            errors: Vec::new(),
        }
    }
}

/// インポート処理のメイン関数
/// - source_dir 直下の .md ファイルをコピー
/// - source_dir/assets/ をまるごとコピー
pub fn import_markdown_files(source_dir: &str, target_dir: &str) -> Result<ImportStats, String> {
    let source_path = Path::new(source_dir);
    let target_path = Path::new(target_dir);

    if !source_path.exists() {
        return Err(format!("Source directory not found: {}", source_dir));
    }
    if !target_path.exists() {
        return Err(format!("Target directory not found: {}", target_dir));
    }

    let mut stats = ImportStats::new();

    // 1. source_dir 直下の .md ファイルをコピー
    let entries = fs::read_dir(source_path).map_err(|e| e.to_string())?;
    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.is_file() && path.extension().map_or(false, |ext| ext.to_string_lossy().to_lowercase() == "md") {
            stats.total_files += 1;
            let dest = target_path.join(path.file_name().unwrap());
            match fs::copy(&path, &dest) {
                Err(e) => {
                    stats.errors.push(format!("Failed to copy {:?}: {}", path, e));
                    stats.skipped += 1;
                }
                Ok(_) => match fs::read_to_string(&dest) {
                    Ok(content) => {
                        let cleaned = crate::logic::strip_sticky_fields(&content);
                        if let Err(e) = fs::write(&dest, cleaned) {
                            let _ = fs::remove_file(&dest);
                            stats.errors.push(format!("Failed to normalize {:?}: {}", path, e));
                            stats.skipped += 1;
                        } else {
                            stats.imported_md += 1;
                            stats.imported_paths.push(dest.to_string_lossy().to_string());
                        }
                    }
                    Err(e) => {
                        let _ = fs::remove_file(&dest);
                        stats.errors.push(format!("Failed to read {:?}: {}", path, e));
                        stats.skipped += 1;
                    }
                },
            }
        }
    }

    // 2. source_dir/assets/ をまるごとコピー
    let source_assets = source_path.join("assets");
    if source_assets.exists() && source_assets.is_dir() {
        let target_assets = target_path.join("assets");
        copy_dir_recursive(&source_assets, &target_assets, &mut stats)?;
    }

    Ok(stats)
}

#[cfg(test)]
mod tests {
    use super::import_markdown_files;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn imported_markdown_paths_point_to_the_copied_notes() {
        let source = tempdir().unwrap();
        let target = tempdir().unwrap();
        fs::write(source.path().join("returned-note.md"), "戻した付箋").unwrap();

        let stats = import_markdown_files(
            source.path().to_str().unwrap(),
            target.path().to_str().unwrap(),
        )
        .unwrap();

        assert_eq!(stats.imported_md, 1);
        assert_eq!(stats.imported_paths, vec![
            target.path().join("returned-note.md").to_string_lossy().to_string()
        ]);
    }

    #[test]
    fn import_removes_old_window_and_font_settings_but_keeps_content_metadata() {
        let source = tempdir().unwrap();
        let target = tempdir().unwrap();
        fs::write(
            source.path().join("old-note.md"),
            "---\ntags: [仕事]\nbackgroundColor: '#80d8ff'\nwindow: { x: 1, y: 2, width: 1800, height: 900 }\nfolded: true\nalwaysOnTop: true\nopacity: 0.5\nfontSize: 12\n---\n\n本文",
        )
        .unwrap();

        let stats = import_markdown_files(
            source.path().to_str().unwrap(),
            target.path().to_str().unwrap(),
        )
        .unwrap();
        let imported = fs::read_to_string(&stats.imported_paths[0]).unwrap();

        assert!(imported.contains("tags: [仕事]"));
        assert!(imported.contains("backgroundColor: '#80d8ff'"));
        assert!(imported.contains("本文"));
        for removed in ["window:", "folded:", "alwaysOnTop:", "opacity:", "fontSize:"] {
            assert!(!imported.contains(removed), "{} が残っている", removed);
        }
    }
}

fn copy_dir_recursive(src: &Path, dst: &Path, stats: &mut ImportStats) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())?.filter_map(|e| e.ok()) {
        let path = entry.path();
        let dest = dst.join(entry.file_name());
        if path.is_dir() {
            copy_dir_recursive(&path, &dest, stats)?;
        } else {
            stats.total_files += 1;
            if let Err(e) = fs::copy(&path, &dest) {
                stats.errors.push(format!("Failed to copy {:?}: {}", path, e));
                stats.skipped += 1;
            } else {
                stats.imported_images += 1;
            }
        }
    }
    Ok(())
}
