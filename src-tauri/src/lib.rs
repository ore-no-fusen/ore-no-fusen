use std::fs;
use std::path::Path;
use walkdir::WalkDir;

#[derive(serde::Serialize)]
struct NoteMeta {
    path: String,
    seq: i32,
    context: String,
    updated: String,
    x: Option<f64>,
    y: Option<f64>,
    width: Option<f64>,
    height: Option<f64>,
}

#[derive(serde::Serialize)]
struct Note {
    body: String,
    frontmatter: String,
    meta: NoteMeta,
}

#[tauri::command]
fn select_folder() -> Option<String> {
    let folder = rfd::FileDialog::new().pick_folder();
    folder.map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
fn select_file(default_path: Option<String>) -> Option<String> {
    let mut dialog = rfd::FileDialog::new();
    if let Some(path) = default_path {
         dialog = dialog.set_directory(path);
    }
    let file = dialog.add_filter("Markdown", &["md"]).pick_file();
    file.map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
fn list_notes(folder_path: String) -> Vec<NoteMeta> {
    println!("Listing notes in: {}", folder_path);
    let mut notes = Vec::new();
    let walker = WalkDir::new(&folder_path).max_depth(1).into_iter();

    // Regex for geometry parsing (supports width/w and height/h)
    let re_x = regex::Regex::new(r"x:\s*([\d\.]+)").unwrap();
    let re_y = regex::Regex::new(r"y:\s*([\d\.]+)").unwrap();
    let re_w = regex::Regex::new(r"(?:width|w):\s*([\d\.]+)").unwrap();
    let re_h = regex::Regex::new(r"(?:height|h):\s*([\d\.]+)").unwrap();

    for entry in walker.filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            if let Some(ext) = entry.path().extension() {
                if ext == "md" {
                   let path_str = entry.path().to_string_lossy().to_string();
                   // Parse filename for meta if possible, else dummy
                   // Name format: NNNN_YYYY-MM-DD_Context.md
                   let filename = entry.file_name().to_string_lossy().to_string();

                   let parts: Vec<&str> = filename.split('_').collect();
                   let (seq, updated, context) = if parts.len() >= 3 {
                       let s = parts[0].parse::<i32>().unwrap_or(0);
                       let u = parts[1].to_string();
                       // Context might contain underscores, join the rest
                       let c = parts[2..].join("_").trim_end_matches(".md").to_string();
                       (s, u, c)
                   } else {
                       (0, "unknown".to_string(), filename.clone())
                   };

                   // Read file content for geometry (partial read would be better but simple read_to_string for now)
                   let mut x = None;
                   let mut y = None;
                   let mut width = None;
                   let mut height = None;

                   if let Ok(content) = fs::read_to_string(entry.path()) {
                       // Use full content for regex matching to avoid character boundary panics
                       let header = &content;
                       if let Some(caps) = re_x.captures(header) {
                           x = caps[1].parse::<f64>().ok();
                       }
                       if let Some(caps) = re_y.captures(header) {
                           y = caps[1].parse::<f64>().ok();
                       }
                       if let Some(caps) = re_w.captures(header) {
                           width = caps[1].parse::<f64>().ok();
                       }
                       if let Some(caps) = re_h.captures(header) {
                           height = caps[1].parse::<f64>().ok();
                       }
                   }

                    if x.is_some() || width.is_some() {
                        println!("Note {} parsed geometry: x={:?}, y={:?}, w={:?}, h={:?}", filename, x, y, width, height);
                    }

                   notes.push(NoteMeta {
                       path: path_str,
                       seq,
                       context,
                       updated,
                       x,
                       y,
                       width,
                       height,
                   });
                }
            }
        }
    }
    // Sort by path or seq? default sort by filename
    notes.sort_by(|a, b| a.path.cmp(&b.path));
    notes
}

#[tauri::command]
fn read_note(path: String) -> Note {
    // Return struct with body/meta. Or just Body as requested?
    // User said: "read_note(path): md file contents"
    // Front end expects a "Note" object with body property.
    // I will read file content.
    let content = fs::read_to_string(&path).unwrap_or_default();
    
    // For now, I'll return the full content in body, and front end handles split.
    // I will return empty frontmatter/meta in this struct to satisfy type expectation if I keep the struct.
    // But earlier I decided to stick to Frontend expectations.
    
    Note {
        body: content, // Contains frontmatter + body
        frontmatter: "".to_string(),
        meta: NoteMeta {
            path: path.clone(),
            seq: 0,
            context: "".to_string(),
            updated: "".to_string(),
            x: None,
            y: None,
            width: None,
            height: None,
        }
    }
}

#[tauri::command]
fn create_note(folder_path: String, context: String) -> Result<Note, String> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let dir = Path::new(&folder_path);
    
    // 最大の連番を探す
    let mut max_seq = 0;
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let name = entry.file_name().to_string_lossy().to_string();
            if let Some(seq_str) = name.split('_').next() {
                if let Ok(seq) = seq_str.parse::<i32>() {
                    if seq > max_seq {
                        max_seq = seq;
                    }
                }
            }
        }
    }
    
    let new_seq = max_seq + 1;
    let filename = format!("{:04}_{}_{}.md", new_seq, today, context);
    let path = dir.join(&filename);
    
    let body = "ここにコンテキストを書く！".to_string();
    let frontmatter = format!("---\ntype: sticky\nseq: {}\ncontext: {}\ncreated: {}\nupdated: {}\n---", new_seq, context, today, today);
    let content = format!("{}\n\n{}", frontmatter, body);
    
    fs::write(&path, content).map_err(|e| e.to_string())?;
    
    let path_str = path.to_string_lossy().to_string();
    Ok(Note {
        body,
        frontmatter,
        meta: NoteMeta {
            path: path_str,
            seq: new_seq,
            context,
            updated: today,
            x: None, // New notes start with default generic pos
            y: None,
            width: None,
            height: None,
        }
    })
}

#[tauri::command]
fn save_note(path: String, body: String, frontmatter_raw: String) -> Result<String, String> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let current_path = Path::new(&path);
    let filename = current_path.file_name().ok_or("Invalid path")?.to_string_lossy().to_string();
    
    // ファイル名から情報を抽出: SEQ_DATE_CONTEXT.md
    let parts: Vec<&str> = filename.split('_').collect();
    if parts.len() < 3 {
        // 標準フォーマットでない場合はリネームせず上書き保存のみ
        fs::write(&current_path, format!("{}\n\n{}", frontmatter_raw, body)).map_err(|e| e.to_string())?;
        return Ok(path);
    }
    
    let seq = parts[0];
    
    // 1行目をコンテキストとして取得
    let first_line = body.lines().next().unwrap_or("").trim();
    // コンテキストのサニタイズ（ファイル名に使えない文字を除去）
    let invalid_chars = ['\\', '/', ':', '*', '?', '"', '<', '>', '|'];
    let safe_context: String = first_line.chars()
        .map(|c| if invalid_chars.contains(&c) { ' ' } else { c })
        .collect();
    let safe_context = safe_context.trim();
    // 空なら元のコンテキスト維持、あるいは "No Title"
    let current_context_part = parts[2..].join("_");
    let current_context = current_context_part.trim_end_matches(".md");
    
    let new_context = if safe_context.is_empty() { current_context } else { safe_context };
    
    // 新しいファイル名を構築
    // 日付は常に更新（要件: 更新日）
    let new_filename = format!("{}_{}_{}.md", seq, today, new_context);
    let mut final_path = current_path.parent().ok_or("Invalid parent")?.join(&new_filename);
    
    let mut final_frontmatter = frontmatter_raw.clone();
    
    // ファイル名が変わる（日付更新 or コンテキスト変更）場合
    if new_filename != filename {
         // リネーム実行
         fs::rename(current_path, &final_path).map_err(|e| format!("Rename failed: {}", e))?;
         
         // frontmatter の updated を更新
         if final_frontmatter.contains("updated:") {
            let re = regex::Regex::new(r"updated: \d{4}-\d{2}-\d{2}").map_err(|e| e.to_string())?;
            final_frontmatter = re.replace(&final_frontmatter, format!("updated: {}", today)).to_string();
         }
    } else {
        final_path = current_path.to_path_buf();
    }
    
    let full_content = format!("{}\n\n{}", final_frontmatter, body);
    fs::write(&final_path, full_content).map_err(|e| e.to_string())?;
    
    Ok(final_path.to_string_lossy().to_string())
}

#[tauri::command]
fn move_to_trash(path: String) -> Result<String, String> {
    let current_path = Path::new(&path);
    let parent = current_path.parent().ok_or("Invalid parent")?;
    let trash_dir = parent.join("Trash");
    
    if !trash_dir.exists() {
        fs::create_dir(&trash_dir).map_err(|e| e.to_string())?;
    }
    
    let filename = current_path.file_name().ok_or("Invalid filename")?;
    let new_path = trash_dir.join(filename);
    
    fs::rename(current_path, &new_path).map_err(|e| e.to_string())?;
    
    Ok(new_path.to_string_lossy().to_string())
}

#[tauri::command]
fn rename_note(path: String, new_context: String) -> Result<String, String> {
    let current_path = Path::new(&path);
    let filename = current_path.file_name().ok_or("Invalid path")?.to_string_lossy().to_string();
    
    let parts: Vec<&str> = filename.split('_').collect();
    if parts.len() < 3 {
        return Err("Invalid filename format".to_string());
    }
    
    let new_filename = format!("{}_{}_{}.md", parts[0], parts[1], new_context);
    let new_path = current_path.parent().ok_or("Invalid parent")?.join(&new_filename);
    
    fs::rename(current_path, &new_path).map_err(|e| e.to_string())?;
    
    Ok(new_path.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
        select_folder,
        select_file,
        list_notes,
        read_note,
        create_note,
        save_note,
        move_to_trash,
        rename_note
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

