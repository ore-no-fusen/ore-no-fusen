use crate::state::{AppState, NoteMeta};

// ロジック層: 副作用なし、純粋関数のみ

pub enum Effect {
    None,
    WriteNote { path: String, content: String },
    RenameNote { old_path: String, new_path: String },
    Batch(Vec<Effect>), 
}

pub fn parse_filename(filename: &str) -> (i32, String, String) {
    let parts: Vec<&str> = filename.split('_').collect();
    if parts.len() >= 3 {
        let seq = parts[0].parse::<i32>().unwrap_or(0);
        let updated = parts[1].to_string();
        let context = parts[2..].join("_").trim_end_matches(".md").to_string();
        (seq, updated, context)
    } else {
        (0, "unknown".to_string(), filename.to_string())
    }
}

pub fn sanitize_context(context: &str) -> String {
    let safe_context: String = context.chars()
        .map(|c| if ['\\', '/', ':', '*', '?', '"', '<', '>', '|'].contains(&c) { ' ' } else { c })
        .collect();
    safe_context.trim().to_string()
}

pub fn generate_filename(seq: i32, date: &str, context: &str) -> String {
    format!("{:04}_{}_{}.md", seq, date, context)
}

pub fn generate_frontmatter(seq: i32, context: &str, created: &str, updated: &str, background_color: Option<&str>) -> String {
    let color_line = if let Some(c) = background_color {
        format!("\nbackgroundColor: {}", c)
    } else {
        "\nbackgroundColor: #f7e9b0".to_string()
    };
    
    // Δ0.7: Complete frontmatter with all fields including geometry defaults
    format!(
        "---\ntype: sticky\nseq: {}\ncontext: {}\ncreated: {}\nupdated: {}{}\nx: 100\ny: 100\nwidth: 400\nheight: 300\nfontFamily: BIZ UDGothic\nfontSize: 8\nlineHeight: 1.0\n---\n",
        seq, context, created, updated, color_line
    )
}

pub fn extract_meta_from_content(content: &str) -> (Option<f64>, Option<f64>, Option<f64>, Option<f64>, Option<String>, Option<bool>) {
    let re_x = regex::Regex::new(r"x:\s*([\d\.]+)").unwrap();
    let re_y = regex::Regex::new(r"y:\s*([\d\.]+)").unwrap();
    let re_w = regex::Regex::new(r"(?:width|w):\s*([\d\.]+)").unwrap();
    let re_h = regex::Regex::new(r"(?:height|h):\s*([\d\.]+)").unwrap();
    let re_color = regex::Regex::new(r#"backgroundColor:\s*["']?([^"'\s]+)["']?"#).unwrap();
    let re_aot = regex::Regex::new(r"alwaysOnTop:\s*(true|false)").unwrap();

    let x = re_x.captures(content).and_then(|c| c[1].parse().ok());
    let y = re_y.captures(content).and_then(|c| c[1].parse().ok());
    let width = re_w.captures(content).and_then(|c| c[1].parse().ok());
    let height = re_h.captures(content).and_then(|c| c[1].parse().ok());
    let color = re_color.captures(content).map(|c| c[1].to_string());
    let always_on_top = re_aot.captures(content).and_then(|c| c[1].parse().ok());

    (x, y, width, height, color, always_on_top)
}

pub fn update_updated_field(frontmatter: &str, new_date: &str) -> String {
    let re = regex::Regex::new(r"updated: \d{4}-\d{2}-\d{2}").unwrap();
    re.replace(frontmatter, format!("updated: {}", new_date)).to_string()
}

// --- High-Level Logic Handlers (Returns Effect) ---

pub fn handle_save_note(
    state: &mut AppState, 
    current_path: &str, 
    body: &str, 
    frontmatter_raw: &str
) -> Result<(String, Effect), String> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    
    // 1. Filename & Path Logic
    let current_path_obj = std::path::Path::new(current_path);
    let parent = current_path_obj.parent().ok_or("No parent")?;
    let filename = current_path_obj.file_name().ok_or("Invalid path")?.to_string_lossy().to_string();
    
    let (seq, _, old_context) = parse_filename(&filename);
    
    let first_line = body.lines().next().unwrap_or("").trim();
    let safe_context = sanitize_context(first_line);
    let new_context = if safe_context.is_empty() { old_context } else { safe_context };
    
    let new_filename = generate_filename(seq, &today, &new_context);
    let should_rename = new_filename != filename;
    
    let final_path = if should_rename {
        parent.join(&new_filename)
    } else {
        current_path_obj.to_path_buf()
    };
    let final_path_str = final_path.to_string_lossy().to_string();
    
    let mut final_frontmatter = frontmatter_raw.to_string();
    if should_rename {
        final_frontmatter = update_updated_field(frontmatter_raw, &today);
    }
    
    let content = format!("{}\n\n{}", final_frontmatter, body);
    
    // 2. Prepare Effect
    let mut effects = Vec::new();
    if should_rename {
        effects.push(Effect::RenameNote {
            old_path: current_path.to_string(),
            new_path: final_path_str.clone(),
        });
    }
    effects.push(Effect::WriteNote {
        path: final_path_str.clone(),
        content: content.clone(),
    });
    
    // 3. Update State
    let (x, y, w, h, bg, aot) = extract_meta_from_content(&content);
    
    let new_meta = NoteMeta {
        path: final_path_str.clone(),
        seq,
        context: new_context,
        updated: today,
        x, y, width: w, height: h,
        background_color: bg,
        always_on_top: aot,
    };
    
    apply_update_note(state, current_path, new_meta);
    
    Ok((final_path_str, Effect::Batch(effects)))
}

// --- Builders (Deprecated/Legacy for other commands if needed, but updated for fields) ---

pub struct CreateNoteData {
    pub filename: String,
    pub content: String,
    pub frontmatter: String,
    pub body: String,
    pub path_str: String,
    pub meta: NoteMeta,
}

pub fn build_create_note_data(folder_path: &str, context: &str, next_seq: i32, today: &str) -> CreateNoteData {
    let filename = generate_filename(next_seq, today, context);
    let path = std::path::Path::new(folder_path).join(&filename);
    let path_str = path.to_string_lossy().to_string();
    
    let frontmatter = generate_frontmatter(next_seq, context, today, today, Some("#f7e9b0"));
    let body = "ここにコンテキストを書く！".to_string();
    let content = format!("{}\n\n{}", frontmatter, body);
    
    let meta = NoteMeta {
        path: path_str.clone(),
        seq: next_seq,
        context: context.to_string(),
        updated: today.to_string(),
        ..Default::default()
    };
    
    CreateNoteData {
        filename, content, frontmatter, body, path_str, meta
    }
}

// `SaveNoteData` and `build_save_note_data` removed or kept?
// User asked to Integrate calculation logic into handle_save_note.
// So we can remove `SaveNoteData` struct and `build_save_note_data` function to avoid confusion.

// --- AppState Helpers ---

pub fn apply_set_folder(state: &mut AppState, folder: String, notes: Vec<NoteMeta>) {
    state.folder_path = Some(folder);
    state.notes = notes;
}

pub fn apply_select_note(state: &mut AppState, path: String) {
    state.selected_path = Some(path);
}

pub fn apply_add_note(state: &mut AppState, note: NoteMeta) {
    state.notes.push(note);
    state.notes.sort_by(|a, b| a.path.cmp(&b.path));
}

pub fn apply_update_note(state: &mut AppState, old_path: &str, note: NoteMeta) {
    if let Some(index) = state.notes.iter().position(|n| n.path == old_path) {
        state.notes[index] = note;
    }
    state.notes.sort_by(|a, b| a.path.cmp(&b.path));
}

pub fn apply_remove_note(state: &mut AppState, path: &str) {
    state.notes.retain(|n| n.path != path);
}

// Geometry Update Logic

pub fn update_frontmatter_value(content: &str, key: &str, value: String) -> String {
    // Determine Frontmatter area
    if !content.trim_start().starts_with("---") {
        return format!("---\n{}: {}\n---\n{}", key, value, content);
    }
    
    // Find closing ---
    // skip first ---
    let start_idx = content.find("---").unwrap() + 3;
    let end_idx = match content[start_idx..].find("---") {
        Some(i) => start_idx + i,
        None => return format!("---\n{}: {}\n---\n{}", key, value, content),
    };
    
    let frontmatter = &content[..end_idx+3];
    let body = &content[end_idx+3..];
    
    let re = regex::Regex::new(&format!(r"(?m)^{}:\s*.*$", regex::escape(key))).unwrap();
    let new_fm = if re.is_match(frontmatter) {
        re.replace(frontmatter, format!("{}: {}", key, value)).to_string()
    } else {
        // Insert before closing ---
        let (head, tail) = frontmatter.split_at(end_idx);
        format!("{}{}: {}\n{}", head, key, value, tail)
    };
    
    format!("{}{}", new_fm, body)
}

pub fn handle_update_geometry(
    state: &mut AppState,
    path: &str,
    current_content: &str,
    x: f64, y: f64, w: f64, h: f64
) -> Result<Effect, String> {
    let mut new_content = current_content.to_string();
    new_content = update_frontmatter_value(&new_content, "x", x.round().to_string());
    new_content = update_frontmatter_value(&new_content, "y", y.round().to_string());
    new_content = update_frontmatter_value(&new_content, "width", w.round().to_string());
    new_content = update_frontmatter_value(&new_content, "height", h.round().to_string());
    
    // State update (Single Source of Truth)
    if let Some(index) = state.notes.iter().position(|n| n.path == path) {
        state.notes[index].x = Some(x);
        state.notes[index].y = Some(y);
        state.notes[index].width = Some(w);
        state.notes[index].height = Some(h);
    }
    
    Ok(Effect::WriteNote { path: path.to_string(), content: new_content })
}

pub fn handle_toggle_always_on_top(
    state: &mut AppState,
    path: &str,
    current_content: &str,
    enable: bool
) -> Result<Effect, String> {
    let new_content = update_frontmatter_value(current_content, "alwaysOnTop", enable.to_string());
    
    // State update
    if let Some(index) = state.notes.iter().position(|n| n.path == path) {
        state.notes[index].always_on_top = Some(enable);
    }
    
    Ok(Effect::WriteNote { path: path.to_string(), content: new_content })
}
