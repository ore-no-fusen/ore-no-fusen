use std::fs;
use std::path::Path;
use walkdir::WalkDir;
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

/// インポート処理のメイン関数 (構造維持・復元対応)
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
    
    // 1. 全ファイルを収集 (シンボリックリンクを含む)
    // WalkDir はデフォルトでシンボリックリンクをフォローしない(=リンクそのものをエントリとして扱う)
    for entry in WalkDir::new(source_path).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        
        // ソースディレクトリ自体はスキップ
        if path == source_path {
            continue;
        }

        // 相対パスを取得
        let rel_path = path.strip_prefix(source_path).map_err(|e| e.to_string())?;
        let dest_path = target_path.join(rel_path);

        // ディレクトリの場合は作成
        if entry.file_type().is_dir() {
            fs::create_dir_all(&dest_path).map_err(|e| e.to_string())?;
            continue;
        }

        stats.total_files += 1;

        // シンボリックリンクの処理
        let metadata = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
        if metadata.file_type().is_symlink() {
            // リンク先を取得
            let target = fs::read_link(path).map_err(|e| e.to_string())?;
            
            // リンク先がソースディレクトリ内の場合、インポート先でも相対的なリンクになるように調整が必要
            // 今回はシンプルに、Rustの symlink 関数を使ってそのまま復元を試みる
            // (注: Windowsでは権限が必要になる場合がある)
            if let Err(e) = create_symlink(&target, &dest_path) {
                stats.errors.push(format!("Failed to create symlink {:?}: {}", dest_path, e));
                stats.skipped += 1;
            } else {
                // リンク対象が .md か画像かによってカウント
                if is_md_file(&dest_path) { stats.imported_md += 1; }
                else if is_image_file(&dest_path) { stats.imported_images += 1; }
            }
            continue;
        }

        // 通常ファイルのコピー
        if is_md_file(path) {
            if let Err(e) = fs::copy(path, &dest_path) {
                stats.errors.push(format!("Failed to copy md {:?}: {}", dest_path, e));
                stats.skipped += 1;
            } else {
                stats.imported_md += 1;
            }
        } else if is_image_file(path) {
            if let Err(e) = fs::copy(path, &dest_path) {
                stats.errors.push(format!("Failed to copy image {:?}: {}", dest_path, e));
                stats.skipped += 1;
            } else {
                stats.imported_images += 1;
            }
        } else {
            // 対象外の拡張子はスキップ
            stats.skipped += 1;
        }
    }

    Ok(stats)
}

fn is_md_file(path: &Path) -> bool {
    path.extension().map_or(false, |ext| ext.to_string_lossy().to_lowercase() == "md")
}

fn is_image_file(path: &Path) -> bool {
    let ext = path.extension().map_or("".to_string(), |ext| ext.to_string_lossy().to_lowercase());
    matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg")
}

fn create_symlink(target: &Path, link_path: &Path) -> Result<(), String> {
    #[cfg(windows)]
    {
        // ファイルかディレクトリかによって使い分ける必要があるが、
        // 今回の構成では整理されたノートは常にファイル、assetsはディレクトリ
        if target.is_dir() {
            std::os::windows::fs::symlink_dir(target, link_path).map_err(|e| e.to_string())
        } else {
            std::os::windows::fs::symlink_file(target, link_path).map_err(|e| e.to_string())
        }
    }
    #[cfg(not(windows))]
    {
        std::os::unix::fs::symlink(target, link_path).map_err(|e| e.to_string())
    }
}
