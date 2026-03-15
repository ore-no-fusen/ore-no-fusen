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
    pub skipped: usize,
    pub errors: Vec<String>,
}

impl ImportStats {
    fn new() -> Self {
        Self {
            total_files: 0,
            imported_md: 0,
            imported_images: 0,
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
            if let Err(e) = fs::copy(&path, &dest) {
                stats.errors.push(format!("Failed to copy {:?}: {}", path, e));
                stats.skipped += 1;
            } else {
                stats.imported_md += 1;
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
