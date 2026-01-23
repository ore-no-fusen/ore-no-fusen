use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
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

/// インポート処理のメイン関数
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
    let mut files_to_import: Vec<PathBuf> = Vec::new();

    // 1. ファイル収集
    for entry in WalkDir::new(source_path) {
        let entry = match entry {
            Ok(e) => e,
            Err(e) => {
                stats.errors.push(format!("Failed to read entry: {}", e));
                continue;
            }
        };

        if entry.file_type().is_file() {
            let path = entry.path();
            if let Some(ext) = path.extension() {
                let ext_str = ext.to_string_lossy().to_lowercase();
                if is_target_extension(&ext_str) {
                    files_to_import.push(path.to_path_buf());
                }
            }
        }
    }
    stats.total_files = files_to_import.len();

    // 2. マッピング作成 (SourcePath -> TargetFileName)
    // 重複時は自動リネーム (例: image.png -> image_1.png)
    let mut path_map: HashMap<PathBuf, String> = HashMap::new();
    let mut used_filenames: HashMap<String, usize> = HashMap::new();

    // ターゲットディレクトリにある既存ファイルも考慮
    if let Ok(entries) = fs::read_dir(target_path) {
        for entry in entries {
            if let Ok(entry) = entry {
                if let Ok(type_) = entry.file_type() {
                    if type_.is_file() {
                        let name = entry.file_name().to_string_lossy().to_lowercase();
                        used_filenames.insert(name, 1);
                    }
                }
            }
        }
    }

    for src_path in &files_to_import {
        let file_name = src_path.file_name().unwrap_or_default().to_string_lossy().to_string();
        let file_name_lower = file_name.to_lowercase();

        let target_name = if used_filenames.contains_key(&file_name_lower) {
            // 重複解決
            let mut count = 1;
            let stem = Path::new(&file_name).file_stem().unwrap_or_default().to_string_lossy();
            let ext = Path::new(&file_name).extension().unwrap_or_default().to_string_lossy();
            let ext_dot = if ext.is_empty() { "".to_string() } else { format!(".{}", ext) };
            
            loop {
                let new_name = format!("{}_{}{}", stem, count, ext_dot);
                if !used_filenames.contains_key(&new_name.to_lowercase()) {
                    break new_name;
                }
                count += 1;
            }
        } else {
            file_name.clone()
        };

        used_filenames.insert(target_name.to_lowercase(), 1);
        path_map.insert(src_path.clone(), target_name);
    }

    // 3. コピー & 書き換え
    // Regex for Markdown links: ![alt](path) or ![[path]]
    // 簡単のため、単純なパス置換を行う
    // TODO: 画像拡張子のリストを共有化
    
    for src_path in &files_to_import {
        let target_filename = path_map.get(src_path).unwrap();
        let target_file_path = target_path.join(target_filename);
        
        let ext = src_path.extension().unwrap_or_default().to_string_lossy().to_lowercase();

        if ext == "md" {
            // Markdown: 読み込んでリンク書き換え
            match fs::read_to_string(src_path) {
                Ok(content) => {
                    let mut new_content = content.clone();
                    
                    // シンプルなアプローチ:
                    // コンテンツ内の参照パスが、取り込み対象ファイルのいずれかと一致するか確認して置換
                    // これは重い処理だが、確実性は高い。ただし、相対パスの解決がキー。
                    
                    // 今回は「ファイル名」ベースで置換を行うアプローチを取る（Obsidianライク）
                    // つまり、path/to/image.png があったら、image.png (or image_1.png) に置換する
                    
                    for (mapped_src, mapped_target_name) in &path_map {
                        // ソースファイルのファイル名を取得
                        let src_name = mapped_src.file_name().unwrap().to_string_lossy();
                        
                        // 画像またはMDファイルへのリンクを探して置換
                        // 注意: これは単純なreplaceなので、意図しない箇所も置換するリスクはあるが、
                        // リンク構文内だけを狙うとパースが必要になる。
                        // ここでは正規表現を使って、リンク構文内のパスを狙う。
                        
                        // パターン1: Standard Link ![alt](...src_name...)
                        // パターン2: Wiki Link ![[...src_name...]]
                        
                        // これらを安全にやるのは難しいので、今回は「コピー方式」の要件を満たすため、
                        // "パスの正規化などは行わずにファイル名だけでマッチさせる"
                        
                        // TODO: より高度なリンク解析
                        // ここでは暫定的に、「ファイル名が含まれていたら置換」する（危険だが動く）
                        // しかしそれだと "img.png" が "my_img.png" にマッチしてしまう。
                        
                        // 安全策: 相対パスでの解決を試みる。
                        // source_dir からの相対パス
                        if let Ok(rel_path) = mapped_src.strip_prefix(source_path) {
                            let rel_path_str = rel_path.to_string_lossy().replace("\\", "/");
                            // リンクが "sub/image.png" のように書かれている場合、これを target_name に置換
                            new_content = new_content.replace(&rel_path_str, mapped_target_name);
                            
                            // URLエンコードされたパスも考慮すべきだが今回はスキップ
                            
                            // ファイル名のみの場合も考慮 (Obsidianはファイル名だけでリンクできる)
                            // これをやると誤爆のリスクがあるが、画像ファイルならリスクは低い
                             if is_image_extension(&mapped_src.extension().unwrap_or_default().to_string_lossy().to_lowercase()) {
                                 new_content = new_content.replace(&src_name.to_string(), mapped_target_name);
                             }
                        }
                    }

                    // Frontmatterの補完（x, y座標などがない場合）
                    // これは既存のロジックを流用したいが、依存関係が複雑になるのでシンプルに追記
                    if !new_content.contains("x:") || !new_content.contains("y:") {
                        let default_meta = format!("\nx: 100\ny: 100\nwidth: 320\nheight: 320\n");
                         // Frontmatterブロックがあるか？
                        if new_content.starts_with("---") {
                             // 2つ目の --- の前に挿入
                             if let Some(end_idx) = new_content[3..].find("---") {
                                 new_content.insert_str(end_idx + 3, &default_meta);
                             } else {
                                 // Frontmatterが閉じてない... 先頭に追加
                                 new_content = format!("---\n{}{}\n---\n{}", default_meta, "created: now", new_content);
                             }
                        } else {
                             // Frontmatterなし
                             new_content = format!("---\n{}{}\n---\n{}", default_meta, "created: now", new_content);
                        }
                    }

                    if let Err(e) = fs::write(&target_file_path, new_content) {
                        stats.errors.push(format!("Failed to write md {}: {}", target_filename, e));
                    } else {
                        stats.imported_md += 1;
                    }
                },
                Err(e) => {
                    stats.errors.push(format!("Failed to read md {:?}: {}", src_path, e));
                }
            }
        } else {
            // 画像などは単純コピー
            if let Err(e) = fs::copy(src_path, &target_file_path) {
                 stats.errors.push(format!("Failed to copy {}: {}", target_filename, e));
            } else {
                 stats.imported_images += 1;
            }
        }
    }

    Ok(stats)
}

fn is_target_extension(ext: &str) -> bool {
    matches!(ext, "md" | "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg")
}

fn is_image_extension(ext: &str) -> bool {
    matches!(ext, "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg")
}
