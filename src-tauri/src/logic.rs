use crate::state::{AppState, NoteMeta};

// ロジック層: 副作用なし、純粋関数のみ

pub enum Effect {

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

pub fn split_frontmatter(src: &str) -> (&str, &str) {
    if !src.starts_with("---") {
        return ("", src);
    }
    // Find second ---
    if let Some(end) = src[3..].find("---") {
        let fence_end = 3 + end + 3;
        let front = &src[..fence_end];
        let body = &src[fence_end..].trim_start();
        return (front, body);
    }
    ("", src)
}

pub fn generate_frontmatter(seq: i32, context: &str, created: &str, updated: &str, background_color: Option<&str>, tags: &[String]) -> String {
    let color_line = if let Some(c) = background_color {
        format!("\nbackgroundColor: {}", c)
    } else {
        "\nbackgroundColor: #f7e9b0".to_string()
    };
    
    let tags_line = if !tags.is_empty() {
        format!("\ntags: [{}]", tags.join(", "))
    } else {
        "".to_string()
    };
    
    // Δ0.7: Complete frontmatter with all fields including geometry defaults
    format!(
        "---\ntype: sticky\nseq: {}\ncontext: {}\ncreated: {}\nupdated: {}{}{}\nx: 100\ny: 100\nwidth: 400\nheight: 300\nfontFamily: BIZ UDGothic\nfontSize: 8\nlineHeight: 1.0\n---\n",
        seq, context, created, updated, color_line, tags_line
    )
}

pub fn extract_meta_from_content(content: &str) -> (Option<f64>, Option<f64>, Option<f64>, Option<f64>, Option<String>, Option<bool>, Vec<String>) {
    // \b (単語境界) を使い、他フィールドの末尾文字にマッチしないよう安全に抽出
    let re_x = regex::Regex::new(r"\bx:\s*([\d\.]+)").unwrap();
    let re_y = regex::Regex::new(r"\by:\s*([\d\.]+)").unwrap();
    let re_w = regex::Regex::new(r"\b(?:width|w):\s*([\d\.]+)").unwrap();
    let re_h = regex::Regex::new(r"\b(?:height|h):\s*([\d\.]+)").unwrap();
    let re_color = regex::Regex::new(r#"backgroundColor:\s*["']?([^"'\s]+)["']?"#).unwrap();
    let re_aot = regex::Regex::new(r"alwaysOnTop:\s*(true|false)").unwrap();
    let re_tags = regex::Regex::new(r"(?m)^tags:\s*(.*)$").unwrap();

    let x = re_x.captures(content).and_then(|c| c[1].parse().ok());
    let y = re_y.captures(content).and_then(|c| c[1].parse().ok());
    let width = re_w.captures(content).and_then(|c| c[1].parse().ok());
    let height = re_h.captures(content).and_then(|c| c[1].parse().ok());
    let color = re_color.captures(content).map(|c| c[1].to_string());
    let always_on_top = re_aot.captures(content).and_then(|c| c[1].parse().ok());
    
    let tags_val = re_tags.captures(content).map(|c| c[1].trim().to_string()).unwrap_or_default();
    let tags = if tags_val.starts_with('[') && tags_val.ends_with(']') {
        tags_val[1..tags_val.len()-1].split(',')
            .map(|s| s.trim().trim_matches('"').trim_matches('\'').to_string())
            .filter(|s| !s.is_empty())
            .collect()
    } else if !tags_val.is_empty() {
        tags_val.split(',')
            .map(|s| s.trim().trim_matches('"').trim_matches('\'').to_string())
            .filter(|s| !s.is_empty())
            .collect()
    } else {
        Vec::new()
    };

    (x, y, width, height, color, always_on_top, tags)
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
    old_body: &str,
    frontmatter_raw: &str,
    allow_rename: bool
) -> Result<(String, Effect), String> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    
    // 1. Filename & Path Logic
    let current_path_obj = std::path::Path::new(current_path);
    let parent = current_path_obj.parent().ok_or("No parent")?;
    let filename = current_path_obj.file_name().ok_or("Invalid path")?.to_string_lossy().to_string();
    
    // Parse current filename to get fixed params (seq, created)
    let (seq, created_date, old_context) = parse_filename(&filename);
    let first_line = body.lines().next().unwrap_or("").trim();

    // Find old meta for comparison
    let old_meta = state.notes.iter().find(|n| n.path == current_path).cloned();
    let old_updated = old_meta.as_ref().map(|m| m.updated.clone()).unwrap_or_else(|| today.clone());

    // Extract content fields from NEW frontmatter_raw
    let (_, _, _, _, new_color, new_aot, new_tags) = extract_meta_from_content(frontmatter_raw);

    // Check if "Content-related" fields changed
    let content_changed = body != old_body 
        || old_meta.as_ref().map_or(true, |m| m.background_color != new_color 
            || m.always_on_top != new_aot 
            || m.tags != new_tags);

    // Determine final updated date
    let final_updated = if content_changed { today } else { old_updated };

    // Rule A: If allow_rename is false, skip ALL rename logic
    if !allow_rename {
        println!("[DEBUG logic] allowRename=false. Skipping rename check. Path={}", current_path);
        
        let final_frontmatter = update_updated_field(frontmatter_raw, &final_updated);
        let content = format!("{}\n\n{}", final_frontmatter, body);

        // Update State (Metadata)
        let (x, y, w, h, bg, aot, tags) = extract_meta_from_content(&content);
        let new_meta = NoteMeta {
            path: current_path.to_string(),
            seq,
            context: old_context, // Use old context
            updated: final_updated,
            x, y, width: w, height: h,
            background_color: bg,
            always_on_top: aot,
            tags,
        };

        // WRITE GUARD: If content is IDENTICAL to what logic expects (meaning no changes at all, inclusive of geometry)
        // Note: content as assembled above vs what was theoretically there. 
        // More robust: Compare new_meta with old_meta AND body with old_body.
        let nothing_changed = !content_changed 
            && old_meta.as_ref().map_or(false, |m| m.x == x && m.y == y && m.width == w && m.height == h);

        let effect = if nothing_changed {
            Effect::Batch(vec![]) // No write
        } else {
            Effect::WriteNote {
                path: current_path.to_string(),
                content: content.clone(),
            }
        };

        apply_update_note(state, current_path, new_meta);
        return Ok((current_path.to_string(), effect));
    }

    // Rule B: allow_rename is true
    let mut should_rename = false;
    let mut new_context = old_context.clone();
    let safe_context = sanitize_context(first_line);

    // strictly check first line
    if !first_line.is_empty() {
         if !safe_context.is_empty() && safe_context != old_context {
             new_context = safe_context.clone();
             should_rename = true;
         }
    }

    println!("[DEBUG logic] allowRename=true. first_line='{}', old_ctx='{}', new_ctx='{}', should_rename={}", 
             first_line, old_context, new_context, should_rename);

    let final_path_str = if should_rename {
        // Rule C: Use created_date from filename (FIXED)
        let new_filename = generate_filename(seq, &created_date, &new_context);
        parent.join(&new_filename).to_string_lossy().to_string()
    } else {
        current_path.to_string()
    };
    
    let final_frontmatter = update_updated_field(frontmatter_raw, &final_updated);
    let content = format!("{}\n\n{}", final_frontmatter, body);
    
    // Prepare Effect
    let mut effects = Vec::new();
    if should_rename {
        effects.push(Effect::RenameNote {
            old_path: current_path.to_string(),
            new_path: final_path_str.clone(),
        });
    }

    // Update State
    let (x, y, w, h, bg, aot, tags) = extract_meta_from_content(&content);

    let nothing_changed = !should_rename && !content_changed 
        && old_meta.as_ref().map_or(false, |m| m.x == x && m.y == y && m.width == w && m.height == h);

    if !nothing_changed {
        effects.push(Effect::WriteNote {
            path: final_path_str.clone(),
            content: content.clone(),
        });
    }
    let new_meta = NoteMeta {
        path: final_path_str.clone(),
        seq,
        context: new_context,
        updated: final_updated,
        x, y, width: w, height: h,
        background_color: bg,
        always_on_top: aot,
        tags,
    };
    
    apply_update_note(state, current_path, new_meta);
    
    Ok((final_path_str, Effect::Batch(effects)))
}

// --- Builders (Deprecated/Legacy for other commands if needed, but updated for fields) ---

pub struct CreateNoteData {
    #[allow(dead_code)]
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
    
    let frontmatter = generate_frontmatter(next_seq, context, today, today, Some("#f7e9b0"), &[]);
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
        return format!("---\n{}: {}\n---\n\n{}", key, value, content);
    }
    
    // Find closing ---
    // skip first ---
    let start_idx = content.find("---").unwrap() + 3;
    let end_idx = match content[start_idx..].find("---") {
        Some(i) => start_idx + i,
        None => return format!("---\n{}: {}\n---\n\n{}", key, value, content),
    };
    
    let frontmatter = &content[..end_idx];
    let body = &content[end_idx..]; // Keep the closing fence in 'body' for easy replacement
    
    let re = regex::Regex::new(&format!(r"(?m)^{}:\s*.*$", regex::escape(key))).unwrap();
    if re.is_match(frontmatter) {
        let new_fm = re.replace(frontmatter, format!("{}: {}", key, value)).to_string();
        format!("{}{}", new_fm, body)
    } else {
        // Insert before closing ---
        // Ensure the last line of frontmatter has a newline
        let mut new_fm = frontmatter.to_string();
        if !new_fm.ends_with('\n') {
            new_fm.push('\n');
        }
        new_fm.push_str(&format!("{}: {}\n", key, value));
        format!("{}{}", new_fm, body)
    }
}



pub fn handle_add_tag(
    state: &mut AppState,
    path: &str,
    current_content: &str,
    tag: &str
) -> Result<Effect, String> {
    let (_, _, _, _, _, _, mut tags) = extract_meta_from_content(current_content);
    if !tags.contains(&tag.to_string()) {
        tags.push(tag.to_string());
        tags.sort();
    }
    
    let new_content = update_frontmatter_value(current_content, "tags", format!("[{}]", tags.join(", ")));
    
    // State update
    if let Some(index) = state.notes.iter().position(|n| n.path == path) {
        state.notes[index].tags = tags;
    }
    
    Ok(Effect::WriteNote { path: path.to_string(), content: new_content })
}

pub fn handle_remove_tag(
    state: &mut AppState,
    path: &str,
    current_content: &str,
    tag: &str
) -> Result<Effect, String> {
    let (_, _, _, _, _, _, mut tags) = extract_meta_from_content(current_content);
    tags.retain(|t| t != tag);
    
    let new_content = update_frontmatter_value(current_content, "tags", format!("[{}]", tags.join(", ")));
    
    // State update
    if let Some(index) = state.notes.iter().position(|n| n.path == path) {
        state.notes[index].tags = tags;
    }
    
    Ok(Effect::WriteNote { path: path.to_string(), content: new_content })
}

pub fn get_all_unique_tags(state: &AppState) -> Vec<String> {
    let mut tags: std::collections::HashSet<String> = std::collections::HashSet::new();
    for note in &state.notes {
        for tag in &note.tags {
            tags.insert(tag.clone());
        }
    }
    let mut tags_vec: Vec<String> = tags.into_iter().collect();
    tags_vec.sort();
    tags_vec
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



#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_basic() {
        let out = sanitize_context("foo/bar");
        assert!(!out.contains("/"));
    }

    #[test]
    fn sanitize_removes_all_forbidden_chars() {
        // 全ての禁則文字が除去されることを確認
        // Windows禁則文字: \ / : * ? " < > |
        let input = "test/file\\name:with*forbidden?chars\"<>|end";
        let output = sanitize_context(input);
        
        // 禁則文字が1つも含まれていないことを確認
        assert!(!output.contains('/'));
        assert!(!output.contains('\\'));
        assert!(!output.contains(':'));
        assert!(!output.contains('*'));
        assert!(!output.contains('?'));
        assert!(!output.contains('"'));
        assert!(!output.contains('<'));
        assert!(!output.contains('>'));
        assert!(!output.contains('|'));
    }

    #[test]
    fn sanitize_preserves_japanese() {
        // 日本語（ひらがな、カタカナ、漢字）が保持されることを確認
        let input = "日本語のメモ";
        let output = sanitize_context(input);
        assert_eq!(output, "日本語のメモ");
    }

    #[test]
    fn sanitize_preserves_alphanumeric() {
        // 英数字が保持されることを確認
        let input = "Test123ABC";
        let output = sanitize_context(input);
        assert_eq!(output, "Test123ABC");
    }

    #[test]
    fn sanitize_trims_whitespace() {
        // 前後の空白が削除されることを確認
        let input = "  space around  ";
        let output = sanitize_context(input);
        assert_eq!(output, "space around");
    }

    #[test]
    fn sanitize_empty_string() {
        // 空文字列の処理
        let output = sanitize_context("");
        assert_eq!(output, "");
    }

    #[test]
    fn sanitize_real_world_example() {
        // 実際のユースケース: Windowsパスをファイル名に
        let input = "C:\\Users\\test\\Documents";
        let output = sanitize_context(input);
        
        // バックスラッシュがスペースに置換されている
        assert_eq!(output, "C  Users test Documents");
    }

    // #[test]
    // fn test_normalize_path() {
    //     assert_eq!(normalize_path("C:\\Users\\test"), "c:/users/test");
    //     assert_eq!(normalize_path("  /path//to/file/  "), "/path/to/file");
    // }

    // #[test]
    // fn test_get_window_label() {
    //     // Frontend logic check:
    //     // simpleHash("c:/users/test") 
    //     // c: 99, /: 47, u: 117, s: 115, e: 101, r: 114, s: 115, /: 47, t: 116, e: 101, s: 115, t: 116
    //     // Let's just trust the formula if it matches charCode-based hash.
    //     // let label = get_window_label("C:\\Users\\test");
    //     // assert!(label.starts_with("note-"));
    // }

    #[test]
    fn extract_meta_with_tags() {
        let content = "---\ntags: [work, personal,  hoge]\n---";
        let (_, _, _, _, _, _, tags) = extract_meta_from_content(content);
        assert_eq!(tags, vec!["work", "personal", "hoge"]);
    }

    #[test]
    fn generate_frontmatter_with_tags() {
        let fm = generate_frontmatter(1, "ctx", "2024-01-01", "2024-01-01", None, &vec!["tag1".to_string(), "tag2".to_string()]);
        assert!(fm.contains("tags: [tag1, tag2]"));
    }

    #[test]
    fn test_handle_add_tag() {
        let mut state = AppState::default();
        state.notes.push(NoteMeta { path: "/test.md".to_string(), ..Default::default() });
        let content = "---\ntags: [work]\n---";
        let res = handle_add_tag(&mut state, "/test.md", content, "personal");
        assert!(res.is_ok());
        if let Effect::WriteNote { content, .. } = res.unwrap() {
            assert!(content.contains("tags: [personal, work]"));
        }
        assert!(state.notes[0].tags.contains(&"personal".to_string()));
    }

    #[test]
    fn test_get_all_unique_tags() {
        let mut state = AppState::default();
        state.notes.push(NoteMeta { tags: vec!["a".to_string(), "b".to_string()], ..Default::default() });
        state.notes.push(NoteMeta { tags: vec!["b".to_string(), "c".to_string()], ..Default::default() });
        let tags = get_all_unique_tags(&state);
        assert_eq!(tags, vec!["a", "b", "c"]);
    }

    // === parse_filename のテスト ===
    // ファイル名から seq, date, context を抽出する
    
    #[test]
    fn parse_filename_standard_format() {
        // 標準的なファイル名: "0001_2026-01-12_メモタイトル.md"
        let (seq, date, context) = parse_filename("0001_2026-01-12_メモタイトル.md");
        
        assert_eq!(seq, 1);
        assert_eq!(date, "2026-01-12");
        assert_eq!(context, "メモタイトル");
    }

    #[test]
    fn parse_filename_large_seq_number() {
        // 大きなシーケンス番号
        let (seq, date, context) = parse_filename("9999_2026-01-12_テスト.md");
        assert_eq!(seq, 9999);
    }

    #[test]
    fn parse_filename_multi_word_context() {
        // コンテキストに複数のアンダースコアが含まれる場合
        let (seq, _date, context) = parse_filename("0042_2026-01-12_これは_複数語の_タイトル.md");
        
        assert_eq!(seq, 42);
        assert_eq!(context, "これは_複数語の_タイトル");
    }

    #[test]
    fn parse_filename_invalid_format() {
        // 不正なフォーマット（アンダースコアが足りない）
        let (seq, date, context) = parse_filename("invalid.md");
        
        // デフォルト値が返される
        assert_eq!(seq, 0);
        assert_eq!(date, "unknown");
        assert_eq!(context, "invalid.md");
    }

    // === generate_filename のテスト ===
    // seq, date, context からファイル名を生成する
    
    #[test]
    fn generate_filename_standard() {
        let filename = generate_filename(1, "2026-01-12", "テストメモ");
        assert_eq!(filename, "0001_2026-01-12_テストメモ.md");
    }

    #[test]
    fn generate_filename_zero_padding() {
        // シーケンス番号が4桁でゼロパディングされることを確認
        let filename = generate_filename(42, "2026-01-12", "メモ");
        assert_eq!(filename, "0042_2026-01-12_メモ.md");
    }

    #[test]
    fn generate_filename_large_number() {
        let filename = generate_filename(9999, "2026-01-12", "最後のメモ");
        assert_eq!(filename, "9999_2026-01-12_最後のメモ.md");
    }

    // === parse と generate の往復テスト ===
    // generate したファイル名を parse して、元の値に戻ることを確認
    
    #[test]
    fn roundtrip_parse_and_generate() {
        let original_seq = 123;
        let original_date = "2026-01-12";
        let original_context = "往復テスト";
        
        // generate → parse → 同じ値に戻る
        let filename = generate_filename(original_seq, original_date, original_context);
        let (parsed_seq, parsed_date, parsed_context) = parse_filename(&filename);
        
    assert_eq!(parsed_seq, original_seq);
        assert_eq!(parsed_date, original_date);
        assert_eq!(parsed_context, original_context);
    }

    // === generate_frontmatter のテスト ===
    // フロントマター（メタデータ）を生成する重要な関数
    
    #[test]
    fn generate_frontmatter_with_default_color() {
        // デフォルトカラー（指定なし）の場合
        let frontmatter = generate_frontmatter(1, "テストメモ", "2026-01-12", "2026-01-12", None, &[]);
        
        // 必須フィールドが含まれていることを確認
        assert!(frontmatter.contains("type: sticky"));
        assert!(frontmatter.contains("seq: 1"));
        assert!(frontmatter.contains("context: テストメモ"));
        assert!(frontmatter.contains("created: 2026-01-12"));
        assert!(frontmatter.contains("updated: 2026-01-12"));
        
        // デフォルトカラーが設定されている
        assert!(frontmatter.contains("backgroundColor: #f7e9b0"));
        
        // 初期ジオメトリが設定されている
        assert!(frontmatter.contains("x: 100"));
        assert!(frontmatter.contains("y: 100"));
        assert!(frontmatter.contains("width: 400"));
        assert!(frontmatter.contains("height: 300"));
    }

    #[test]
    fn generate_frontmatter_with_custom_color() {
        // カスタムカラーを指定
        let frontmatter = generate_frontmatter(42, "青いメモ", "2026-01-12", "2026-01-12", Some("#80d8ff"), &[]);
        
        assert!(frontmatter.contains("backgroundColor: #80d8ff"));
        assert!(frontmatter.contains("seq: 42"));
    }

    #[test]
    fn generate_frontmatter_format() {
        // フロントマターが正しいYAML形式であることを確認
        let frontmatter = generate_frontmatter(1, "test", "2026-01-12", "2026-01-12", None, &[]);
        
        // ---で開始・終了することを確認
        assert!(frontmatter.starts_with("---\n"));
        assert!(frontmatter.contains("---\n") && frontmatter.matches("---").count() == 2);
    }

    // === extract_meta_from_content のテスト ===
    // コンテンツからメタデータを抽出する関数
    
    #[test]
    fn extract_meta_all_fields_present() {
        // 全てのフィールドが存在する場合
        let content = r#"---
type: sticky
seq: 1
x: 150
y: 200
width: 500
height: 400
backgroundColor: #ffcdd2
alwaysOnTop: true
---

メモの本文
"#;
        
        let (x, y, width, height, color, aot, tags) = extract_meta_from_content(content);
        
        assert_eq!(x, Some(150.0));
        assert_eq!(y, Some(200.0));
        assert_eq!(width, Some(500.0));
        
        // 修正済み: height は正しく 400.0 を取得する
        assert_eq!(height, Some(400.0));
        
        assert_eq!(color, Some("#ffcdd2".to_string()));
        assert_eq!(aot, Some(true));
    }

    #[test]
    fn extract_meta_partial_fields() {
        // 一部のフィールドのみ存在する場合
        let content = r#"---
x: 100
backgroundColor: #f7e9b0
---"#;
        
        let (x, y, width, height, color, aot, tags) = extract_meta_from_content(content);
        
        assert_eq!(x, Some(100.0));
        assert_eq!(y, None);  // 存在しない
        assert_eq!(width, None);
        assert_eq!(height, None);
        assert_eq!(color, Some("#f7e9b0".to_string()));
        assert_eq!(aot, None);
    }

    #[test]
    fn extract_meta_no_frontmatter() {
        // フロントマターが存在しない場合
        let content = "ただのテキスト";
        
        let (x, y, width, height, color, aot, tags) = extract_meta_from_content(content);
        
        // 全てNone
        assert_eq!(x, None);
        assert_eq!(y, None);
        assert_eq!(width, None);
        assert_eq!(height, None);
        assert_eq!(color, None);
        assert_eq!(aot, None);
    }

    #[test]
    fn extract_meta_float_values() {
        // 小数点を含む座標
        let content = "x: 123.45\ny: 678.9";
        
        let (x, y, _, _, _, _, _) = extract_meta_from_content(content);
        
        assert_eq!(x, Some(123.45));
        assert_eq!(y, Some(678.9));
    }

    // === update_updated_field のテスト ===
    // フロントマター内の "updated" フィールドを更新する
    
    #[test]
    fn update_updated_field_replaces_date() {
        // 既存の日付を新しい日付に置き換える
        let frontmatter = "---\ncreated: 2026-01-10\nupdated: 2026-01-10\n---\n";
        let result = update_updated_field(frontmatter, "2026-01-12");
        
        assert!(result.contains("updated: 2026-01-12"));
        assert!(!result.contains("updated: 2026-01-10"));
    }

    #[test]
    fn update_updated_field_preserves_other_fields() {
        // 他のフィールドは変更されないことを確認
        let frontmatter = "---\nseq: 1\ncreated: 2026-01-10\nupdated: 2026-01-10\ncontext: test\n---\n";
        let result = update_updated_field(frontmatter, "2026-01-12");
        
        assert!(result.contains("seq: 1"));
        assert!(result.contains("created: 2026-01-10")); // createdは変わらない
        assert!(result.contains("context: test"));
        assert!(result.contains("updated: 2026-01-12")); // updatedだけ変わる
    }

    // === update_frontmatter_value のテスト ===
    // フロントマターの任意のフィールドを更新する汎用関数
    
    #[test]
    fn update_frontmatter_value_updates_existing_field() {
        // 既存フィールドの値を更新
        let content = "---\nx: 100\ny: 200\n---\n\n本文";
        let result = update_frontmatter_value(content, "x", "150".to_string());
        
        assert!(result.contains("x: 150"));
        assert!(!result.contains("x: 100"));
        assert!(result.contains("本文")); // 本文は保持
    }

    #[test]
    fn update_frontmatter_value_adds_new_field() {
        // 存在しないフィールドを追加
        let content = "---\nx: 100\n---\n\n本文";
        let result = update_frontmatter_value(content, "y", "200".to_string());
        
        assert!(result.contains("x: 100")); // 既存フィールドは保持
        assert!(result.contains("y: 200")); // 新しいフィールドが追加
        assert!(result.contains("本文"));
    }

    #[test]
    fn update_frontmatter_value_creates_frontmatter_if_missing() {
        // フロントマターが存在しない場合、新規作成
        let content = "ただの本文";
        let result = update_frontmatter_value(content, "x", "100".to_string());
        
        assert!(result.contains("---"));
        assert!(result.contains("x: 100"));
        assert!(result.contains("ただの本文"));
    }

    #[test]
    fn update_frontmatter_value_handles_multiline_body() {
        // 複数行の本文が正しく保持されるか
        let content = "---\nseq: 1\n---\n\n行1\n行2\n行3";
        let result = update_frontmatter_value(content, "x", "100".to_string());
        
        assert!(result.contains("x: 100"));
        assert!(result.contains("行1\n行2\n行3"));
    }

    #[test]
    fn update_frontmatter_value_with_special_chars_in_key() {
        // キーに特殊文字が含まれる場合（regex::escape でエスケープされる）
        let content = "---\ntest: 1\n---\n\n本文";
        let result = update_frontmatter_value(content, "backgroundColor", "#f7e9b0".to_string());
        
        assert!(result.contains("backgroundColor: #f7e9b0"));
    }

    // === build_create_note_data のテスト ===
    
    #[test]
    fn test_build_create_note_data() {
        let data = build_create_note_data("/test/folder", "テストメモ", 42, "2026-01-12");
        
        // ファイル名が正しく生成される
        assert_eq!(data.filename, "0042_2026-01-12_テストメモ.md");
        
        // パスが正しい
        assert!(data.path_str.contains("0042_2026-01-12_テストメモ.md"));
        
        // メタデータが設定されている
        assert_eq!(data.meta.seq, 42);
        assert_eq!(data.meta.context, "テストメモ");
        assert_eq!(data.meta.updated, "2026-01-12");
        
        // コンテンツにフロントマターと本文が含まれる
        assert!(data.content.contains("---"));
        assert!(data.content.contains("seq: 42"));
        assert!(data.content.contains("ここにコンテキストを書く！"));
    }

    // === AppState ヘルパー関数のテスト ===
    
    #[test]
    fn test_apply_set_folder() {
        let mut state = AppState::default();
        let notes = vec![
            NoteMeta { seq: 1, context: "Note1".to_string(), ..Default::default() },
            NoteMeta { seq: 2, context: "Note2".to_string(), ..Default::default() },
        ];
        
        apply_set_folder(&mut state, "/test/folder".to_string(), notes);
        
        assert_eq!(state.folder_path, Some("/test/folder".to_string()));
        assert_eq!(state.notes.len(), 2);
    }

    #[test]
    fn test_apply_add_note() {
        let mut state = AppState::default();
        let note = NoteMeta { 
            path: "/test/note.md".to_string(),
            seq: 1, 
            context: "Test".to_string(), 
            ..Default::default() 
        };
        
        apply_add_note(&mut state, note);
        
        assert_eq!(state.notes.len(), 1);
        assert_eq!(state.notes[0].seq, 1);
    }

    #[test]
    fn test_apply_add_note_sorts_by_path() {
        let mut state = AppState::default();
        
        // 逆順で追加
        apply_add_note(&mut state, NoteMeta { 
            path: "/z.md".to_string(),
            ..Default::default() 
        });
        apply_add_note(&mut state, NoteMeta { 
            path: "/a.md".to_string(),
            ..Default::default() 
        });
        
        // パスでソートされている
        assert_eq!(state.notes[0].path, "/a.md");
        assert_eq!(state.notes[1].path, "/z.md");
    }

    #[test]
    fn test_apply_update_note() {
        let mut state = AppState::default();
        
        // 既存のノートを追加
        apply_add_note(&mut state, NoteMeta { 
            path: "/test.md".to_string(),
            context: "Old".to_string(),
            ..Default::default() 
        });
        
        // 更新
        apply_update_note(&mut state, "/test.md", NoteMeta { 
            path: "/test_new.md".to_string(),
            context: "New".to_string(),
            ..Default::default() 
        });
        
        // 更新されている
        assert_eq!(state.notes.len(), 1);
        assert_eq!(state.notes[0].context, "New");
        assert_eq!(state.notes[0].path, "/test_new.md");
    }

    #[test]
    fn test_apply_remove_note() {
        let mut state = AppState::default();
        
        apply_add_note(&mut state, NoteMeta { 
            path: "/test1.md".to_string(),
            ..Default::default() 
        });
        apply_add_note(&mut state, NoteMeta { 
            path: "/test2.md".to_string(),
            ..Default::default() 
        });
        
        assert_eq!(state.notes.len(), 2);
        
        // 削除
        apply_remove_note(&mut state, "/test1.md");
        
        assert_eq!(state.notes.len(), 1);
        assert_eq!(state.notes[0].path, "/test2.md");
    }

    // === handle_update_geometry のテスト ===
    
    #[test]
    fn test_handle_update_geometry() {
        let mut state = AppState::default();
        
        // ノートを追加
        apply_add_note(&mut state, NoteMeta { 
            path: "/test.md".to_string(),
            x: Some(100.0),
            y: Some(200.0),
            ..Default::default() 
        });
        
        let content = "---\nseq: 1\nx: 100\ny: 200\n---\n\n本文";
        
        // 座標を更新
        let result = handle_update_geometry(&mut state, "/test.md", content, 150.0, 250.0, 400.0, 300.0);
        
        assert!(result.is_ok());
        
        // Effectが返される
        match result.unwrap() {
            Effect::WriteNote { path, content } => {
                assert_eq!(path, "/test.md");
                assert!(content.contains("x: 150"));
                assert!(content.contains("y: 250"));
                assert!(content.contains("width: 400"));
                assert!(content.contains("height: 300"));
            },
            _ => panic!("Expected WriteNote effect"),
        }
        
        // Stateが更新されている
        assert_eq!(state.notes[0].x, Some(150.0));
        assert_eq!(state.notes[0].y, Some(250.0));
        assert_eq!(state.notes[0].width, Some(400.0));
        assert_eq!(state.notes[0].height, Some(300.0));
    }

    // === handle_toggle_always_on_top のテスト ===
    
    #[test]
    fn test_handle_toggle_always_on_top_enable() {
        let mut state = AppState::default();
        
        apply_add_note(&mut state, NoteMeta { 
            path: "/test.md".to_string(),
            always_on_top: Some(false),
            ..Default::default() 
        });
        
        let content = "---\nseq: 1\nalwaysOnTop: false\n---\n\n本文";
        
        // 有効化
        let result = handle_toggle_always_on_top(&mut state, "/test.md", content, true);
        
        assert!(result.is_ok());
        
        // Effectが返される
        match result.unwrap() {
            Effect::WriteNote { content, .. } => {
                assert!(content.contains("alwaysOnTop: true"));
            },
            _ => panic!("Expected WriteNote effect"),
        }
        
        // Stateが更新されている
        assert_eq!(state.notes[0].always_on_top, Some(true));
    }

    #[test]
    fn test_handle_toggle_always_on_top_disable() {
        let mut state = AppState::default();
        
        apply_add_note(&mut state, NoteMeta { 
            path: "/test.md".to_string(),
            always_on_top: Some(true),
            ..Default::default() 
        });
        
        let content = "---\nalwaysOnTop: true\n---\n";
        
        // 無効化
        let result = handle_toggle_always_on_top(&mut state, "/test.md", content, false);
        
        assert!(result.is_ok());
        assert_eq!(state.notes[0].always_on_top, Some(false));
    }

    // =================================================================
    // 回帰テスト: 過去のバグが再発しないことを確認
    // =================================================================

    /// No.1バグ回帰テスト: width と height が正しく読み分けられる
    /// 
    /// 2026-01-14に発生したバグ:
    /// 正規表現 `(?:height|h):` が `width:` の末尾 `h` にマッチし、
    /// width=413 の値が height として誤読されていた。
    /// 修正: すべての正規表現に `\b` (単語境界) を追加。
    #[test]
    fn regression_no1_height_not_confused_with_width() {
        // 実際に問題が発生したデータ形式を再現
        let content = r#"---
type: sticky
seq: 28
context:
created: 2026-01-14
updated: 2026-01-14
backgroundColor: #ffcdd2
x: 1425
y: 551
width: 413
height: 241
fontFamily: BIZ UDGothic
fontSize: 8
lineHeight: 1.0
tags: [OreNoFusen, 開発プロセス]
---

ロードマップ"#;
        
        let (x, y, width, height, color, _, tags) = extract_meta_from_content(content);
        
        // ⚠️ 最重要: height が width の値で上書きされていないこと
        assert_eq!(width, Some(413.0), "width は 413.0 であるべき");
        assert_eq!(height, Some(241.0), "height は 241.0 であるべき (width の値ではない!)");
        
        // 他のフィールドも正しく読めている
        assert_eq!(x, Some(1425.0));
        assert_eq!(y, Some(551.0));
        assert_eq!(color, Some("#ffcdd2".to_string()));
        assert!(tags.contains(&"OreNoFusen".to_string()));
    }

    /// No.1バグ回帰テスト (追加): width/height の順序が逆でも正しく動作
    #[test]
    fn regression_no1_order_independent() {
        // height が width より前に来るケース
        let content = "---\nheight: 300\nwidth: 400\n---";
        
        let (_, _, width, height, _, _, _) = extract_meta_from_content(content);
        
        assert_eq!(width, Some(400.0));
        assert_eq!(height, Some(300.0));
    }

    /// No.1バグ回帰テスト (追加): 短縮形 w: と h: も正しく動作
    #[test]
    fn regression_no1_short_form_w_and_h() {
        let content = "---\nw: 500\nh: 250\n---";
        
        let (_, _, width, height, _, _, _) = extract_meta_from_content(content);
        
        assert_eq!(width, Some(500.0));
        assert_eq!(height, Some(250.0));
    }

    #[test]
    fn test_handle_remove_tag_logic() {
        // 1. Setup simulated state
        let mut state = AppState::default();
        let path1 = "/note1.md".to_string();
        let path2 = "/note2.md".to_string();
        
        let content1 = "---\ntags: [delete_me, keep_me]\n---\nBody1";
        let content2 = "---\ntags: [delete_me]\n---\nBody2";
        
        // Initial state population (simulation of storage read)
        state.notes.push(NoteMeta { 
            path: path1.clone(), 
            tags: vec!["delete_me".to_string(), "keep_me".to_string()],
            ..Default::default() 
        });
        state.notes.push(NoteMeta { 
            path: path2.clone(), 
            tags: vec!["delete_me".to_string()],
            ..Default::default() 
        });

        // 2. Execute removal
        let tag_to_remove = "delete_me";
        
        // Note 1
        let res1 = handle_remove_tag(&mut state, &path1, content1, tag_to_remove).unwrap();
        if let Effect::WriteNote { content, .. } = res1 {
            assert!(!content.contains("delete_me"));
            assert!(content.contains("keep_me"));
        }
        
        // Note 2
        let res2 = handle_remove_tag(&mut state, &path2, content2, tag_to_remove).unwrap();
        if let Effect::WriteNote { content, .. } = res2 {
            assert!(!content.contains("delete_me"));
        }

        // 3. Verify AppState update
        let updated_note1 = state.notes.iter().find(|n| n.path == path1).unwrap();
        assert_eq!(updated_note1.tags, vec!["keep_me"]); // check order or contents
        
        let updated_note2 = state.notes.iter().find(|n| n.path == path2).unwrap();
        assert!(updated_note2.tags.is_empty());
        
        // 4. Verify get_all_unique_tags
        let all_tags = get_all_unique_tags(&state);
        assert!(!all_tags.contains(&"delete_me".to_string()));
        assert!(all_tags.contains(&"keep_me".to_string()));
    }
}

