//! Convert local Markdown image links to portable share image references.
//!
//! The caller supplies a map built from files it has already read and uploaded.
//! This pure layer never resolves or discloses a local path by itself.

use std::collections::HashMap;
use std::collections::HashSet;

use super::web_share_contract::{ShareImageManifest, SharePayload};

const SHARE_IMAGE_SCHEME: &str = "ore-fusen-image://";

pub fn rewrite_local_image_references(
    markdown: &str,
    local_path_to_image_id: &HashMap<String, String>,
) -> Result<String, String> {
    rewrite_local_image_references_with_ids(markdown, Some(local_path_to_image_id))
        .map(|(rewritten, _, _)| rewritten)
}

/// Converts a complete local note file into the share payload. Local frontmatter
/// is reduced to its title; the note body (including Markdown task checkboxes) is
/// preserved, while referenced local images become manifest-backed share URIs.
pub fn local_note_to_share_payload(
    note_file: &str,
    local_path_to_manifest: &HashMap<String, ShareImageManifest>,
) -> Result<SharePayload, String> {
    let (title, body) = split_note_frontmatter(note_file)?;
    let frontmatter = &note_file[..note_file.len() - body.len()];
    let (_, _, _, _, parsed_color, _, _, _) = crate::logic::extract_meta_from_content(frontmatter);
    let tags = extract_share_frontmatter_tags(frontmatter)?;
    let background_color = parsed_color
        .filter(|color| matches!(color.as_str(), "#f7e9b0" | "#ffcdd2" | "#80d8ff" | "#fafaf0" | "#cfd8dc"))
        .or_else(|| Some("#f7e9b0".to_string()));
    let path_to_id = local_path_to_manifest
        .iter()
        .map(|(path, manifest)| (path.clone(), manifest.image_id.clone()))
        .collect::<HashMap<_, _>>();
    let (markdown, used_ids, _) = rewrite_local_image_references_with_ids(body, Some(&path_to_id))?;

    let mut manifests = HashMap::<String, ShareImageManifest>::new();
    for manifest in local_path_to_manifest.values() {
        if !used_ids.contains(&manifest.image_id) {
            continue;
        }
        validate_share_image_manifest(manifest)?;
        if let Some(previous) = manifests.get(&manifest.image_id) {
            if previous != manifest {
                return Err("conflicting manifests use the same image ID".to_string());
            }
        } else {
            manifests.insert(manifest.image_id.clone(), manifest.clone());
        }
    }
    if manifests.len() != used_ids.len() {
        return Err("referenced image is missing its verified manifest".to_string());
    }
    let mut images = manifests.into_values().collect::<Vec<_>>();
    images.sort_by(|left, right| left.image_id.as_bytes().cmp(right.image_id.as_bytes()));
    Ok(SharePayload {
        schema_version: 2,
        title,
        markdown,
        images,
        background_color,
        tags,
    })
}

fn extract_share_frontmatter_tags(frontmatter: &str) -> Result<Vec<String>, String> {
    let mut lines = frontmatter.split_inclusive('\n');
    let first = lines.next().unwrap_or_default();
    if first.trim_end_matches(['\r', '\n']) != "---" {
        return Err("note frontmatter is missing while reading tags".into());
    }
    let mut raw_tags = None;
    let mut closed = false;
    for line in lines {
        let value = line.trim_end_matches(['\r', '\n']);
        if value == "---" {
            closed = true;
            break;
        }
        if let Some(value) = value.strip_prefix("tags:") {
            if raw_tags.is_some() {
                return Err("duplicate tags in note frontmatter".into());
            }
            raw_tags = Some(value.trim());
        }
    }
    if !closed {
        return Err("note frontmatter is not closed while reading tags".into());
    }
    let Some(value) = raw_tags else { return Ok(Vec::new()) };
    if value.contains(['\"', '\'', '#']) {
        return Err("quoted tags and YAML comments are unsupported for web sharing".into());
    }
    let list = if value == "[]" { return Ok(Vec::new()) }
    else if value.starts_with('[') && value.ends_with(']') { &value[1..value.len() - 1] }
    else if value.starts_with('[') || value.ends_with(']') { return Err("ambiguous tags syntax is unsupported".into()) }
    else { value };
    if list.trim().is_empty() { return Ok(Vec::new()) }

    let mut tags = Vec::new();
    let mut seen = HashSet::new();
    for tag in list.split(',') {
        let tag = tag.trim();
        if tag.is_empty() || tag.len() > 256 || tag.chars().any(char::is_control) {
            return Err("invalid tag in note frontmatter".into());
        }
        if crate::logic::is_reserved_tag(tag) {
            continue;
        }
        if seen.insert(tag.to_lowercase()) {
            tags.push(tag.to_string());
        }
    }
    if tags.len() > 64 {
        return Err("too many tags to share".into());
    }
    Ok(tags)
}

/// Returns only image destinations that the same Markdown scanner treats as live
/// image references, excluding frontmatter, fenced code, inline code, and escapes.
pub fn local_note_image_references(note_file: &str) -> Result<HashSet<String>, String> {
    let (_, body) = split_note_frontmatter(note_file)?;
    rewrite_local_image_references_with_ids(body, None).map(|(_, _, paths)| paths)
}

fn split_note_frontmatter(note_file: &str) -> Result<(String, &str), String> {
    let mut offset = 0;
    let mut lines = note_file.split_inclusive('\n');
    let first = lines
        .next()
        .ok_or_else(|| "note is empty; cannot find frontmatter".to_string())?;
    if first.trim_end_matches(['\r', '\n']) != "---" {
        return Err(
            "note frontmatter is missing; refusing to share local file content".to_string(),
        );
    }
    offset += first.len();
    let mut title = None;
    let mut closed = false;
    for line in lines {
        let value = line.trim_end_matches(['\r', '\n']);
        if value == "---" {
            closed = true;
            offset += line.len();
            break;
        }
        if let Some(value) = value.strip_prefix("title:") {
            if title.is_some() {
                return Err("duplicate title in note frontmatter".to_string());
            }
            title = Some(parse_share_title(value)?);
        }
        offset += line.len();
    }
    if !closed {
        return Err("note frontmatter is not closed".to_string());
    }
    let title = title.ok_or_else(|| "note title is missing from frontmatter".to_string())?;
    let body = &note_file[offset..];
    Ok((title, body))
}

pub fn local_note_has_frontmatter_tag(note_file: &str, expected: &str) -> Result<bool, String> {
    let mut lines = note_file.split_inclusive('\n');
    let first = lines
        .next()
        .ok_or_else(|| "note is empty; cannot find frontmatter".to_string())?;
    if first.trim_end_matches(['\r', '\n']) != "---" {
        return Err("note frontmatter is missing".to_string());
    }
    let mut tags_value = None;
    let mut closed = false;
    for line in lines {
        let value = line.trim_end_matches(['\r', '\n']);
        if value == "---" {
            closed = true;
            break;
        }
        if let Some(value) = value.strip_prefix("tags:") {
            if tags_value.is_some() {
                return Err("duplicate tags in note frontmatter".to_string());
            }
            tags_value = Some(value.trim());
        }
    }
    if !closed {
        return Err("note frontmatter is not closed".to_string());
    }
    let Some(value) = tags_value else {
        return Ok(false);
    };
    if value.contains(['"', '\'']) {
        return Err("quoted tag syntax is unsupported for share registration checks".to_string());
    }
    if value.contains('#') {
        return Err("YAML comments are unsupported in share registration tags".to_string());
    }
    let list = if value.starts_with('[') && value.ends_with(']') {
        &value[1..value.len() - 1]
    } else if value.starts_with('[') || value.ends_with(']') {
        return Err("ambiguous tags syntax is unsupported".to_string());
    } else {
        value
    };
    Ok(list.split(',').any(|tag| {
        tag.trim()
            .trim_matches(['"', '\''])
            .eq_ignore_ascii_case(expected)
    }))
}

fn parse_share_title(raw: &str) -> Result<String, String> {
    let value = raw.trim();
    if value.starts_with('"') {
        if value.len() < 2 || !value.ends_with('"') {
            return Err("unsupported quoted title syntax".to_string());
        }
        let inner = &value[1..value.len() - 1];
        if inner.contains(['"', '\\', '\r', '\n']) {
            return Err("escaped or multiline quoted titles are unsupported".to_string());
        }
        return Ok(inner.to_string());
    }
    if value.starts_with('\'') {
        if value.len() < 2 || !value.ends_with('\'') {
            return Err("unsupported quoted title syntax".to_string());
        }
        let inner = &value[1..value.len() - 1];
        if inner.contains(['\'', '\r', '\n']) {
            return Err("escaped or multiline quoted titles are unsupported".to_string());
        }
        return Ok(inner.to_string());
    }
    let bytes = value.as_bytes();
    let has_inline_yaml_comment = bytes.iter().enumerate().any(|(index, byte)| {
        *byte == b'#' && index > 0 && matches!(bytes[index - 1], b' ' | b'\t')
    });
    if value.starts_with('#')
        || has_inline_yaml_comment
        || value.contains(": ")
        || value.starts_with(['&', '*', '[', '{', '!', '|', '>'])
        || value.contains(['\r', '\n'])
    {
        return Err("ambiguous YAML title syntax is unsupported".to_string());
    }
    Ok(value.to_string())
}

fn validate_share_image_manifest(manifest: &ShareImageManifest) -> Result<(), String> {
    if manifest.image_id.trim().is_empty()
        || manifest
            .image_id
            .contains(['/', '\\', ')', ' ', '\n', '\r'])
        || manifest.mime_type.trim().is_empty()
        || manifest.size_bytes == 0
        || manifest.sha256.len() != 64
        || !manifest
            .sha256
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err("invalid verified image manifest".to_string());
    }
    Ok(())
}

fn rewrite_local_image_references_with_ids(
    markdown: &str,
    local_path_to_image_id: Option<&HashMap<String, String>>,
) -> Result<(String, HashSet<String>, HashSet<String>), String> {
    reject_multiline_inline_code_spans(markdown)?;
    let mut output = String::with_capacity(markdown.len());
    let mut used_image_ids = HashSet::new();
    let mut used_image_paths = HashSet::new();
    let mut fence: Option<(u8, usize)> = None;

    for line in markdown.split_inclusive('\n') {
        if let Some((marker, length)) = fence {
            if is_closing_fence(line, marker, length) {
                fence = None;
            }
            output.push_str(line);
            continue;
        }
        if let Some(opening) = opening_fence(line) {
            fence = Some(opening);
            output.push_str(line);
            continue;
        }
        output.push_str(&rewrite_image_line(
            line,
            local_path_to_image_id,
            &mut used_image_ids,
            &mut used_image_paths,
        )?);
    }
    if fence.is_some() {
        return Err(
            "unclosed Markdown code fence; refusing to share ambiguous content".to_string(),
        );
    }
    Ok((output, used_image_ids, used_image_paths))
}

// Inline code spans can cross line endings. This deliberately rejects such spans
// until the converter has a document-wide CommonMark parser, so code examples
// are never accidentally rewritten as live image links.
fn reject_multiline_inline_code_spans(markdown: &str) -> Result<(), String> {
    let mut in_fence: Option<(u8, usize)> = None;
    let mut unmatched_runs = HashMap::<usize, usize>::new();
    for line in markdown.split_inclusive('\n') {
        if let Some((marker, length)) = in_fence {
            if is_closing_fence(line, marker, length) {
                in_fence = None;
            }
            continue;
        }
        if let Some(opening) = opening_fence(line) {
            in_fence = Some(opening);
            continue;
        }
        let bytes = line.as_bytes();
        let mut index = 0;
        while index < bytes.len() {
            if bytes[index] == b'\\' {
                let slashes = bytes[index..]
                    .iter()
                    .take_while(|byte| **byte == b'\\')
                    .count();
                index += slashes;
                if slashes % 2 == 1 && bytes.get(index) == Some(&b'`') {
                    index += 1;
                }
                continue;
            }
            if bytes[index] != b'`' {
                index += 1;
                continue;
            }
            let run = bytes[index..]
                .iter()
                .take_while(|byte| **byte == b'`')
                .count();
            let tail = &line[index + run..];
            if has_matching_backtick_run(tail, run) {
                let relative = tail.find('`').unwrap();
                let matching = &tail[relative..];
                index += run + relative + matching.bytes().take_while(|byte| *byte == b'`').count();
            } else {
                *unmatched_runs.entry(run).or_default() += 1;
                index += run;
            }
        }
    }
    if unmatched_runs.values().any(|count| *count >= 2) {
        return Err(
            "multiline inline code spans are unsupported; refusing ambiguous conversion"
                .to_string(),
        );
    }
    Ok(())
}

fn opening_fence(line: &str) -> Option<(u8, usize)> {
    let bytes = line.as_bytes();
    let indent = bytes.iter().take_while(|byte| **byte == b' ').count();
    if indent > 3 {
        return None;
    }
    let marker = *bytes.get(indent)?;
    if marker != b'`' && marker != b'~' {
        return None;
    }
    let length = bytes[indent..]
        .iter()
        .take_while(|byte| **byte == marker)
        .count();
    (length >= 3).then_some((marker, length))
}

fn is_closing_fence(line: &str, marker: u8, opening_length: usize) -> bool {
    let indent = line
        .as_bytes()
        .iter()
        .take_while(|byte| **byte == b' ')
        .count();
    if indent > 3 {
        return false;
    }
    let bytes = &line.as_bytes()[indent..];
    let length = bytes.iter().take_while(|byte| **byte == marker).count();
    length >= opening_length
        && bytes[length..]
            .iter()
            .all(|byte| byte.is_ascii_whitespace())
}

fn rewrite_image_line(
    line: &str,
    local_path_to_image_id: Option<&HashMap<String, String>>,
    used_image_ids: &mut HashSet<String>,
    used_image_paths: &mut HashSet<String>,
) -> Result<String, String> {
    let mut result = String::with_capacity(line.len());
    let mut cursor = 0;
    let mut inline_code_ticks: Option<usize> = None;

    while cursor < line.len() {
        let rest = &line[cursor..];
        if inline_code_ticks.is_none() && rest.starts_with('\\') {
            let slashes = rest.bytes().take_while(|byte| *byte == b'\\').count();
            result.push_str(&rest[..slashes]);
            cursor += slashes;
            if slashes % 2 == 1
                && line[cursor..]
                    .chars()
                    .next()
                    .is_some_and(|ch| ch == '!' || ch == '`')
            {
                let escaped = line[cursor..].chars().next().unwrap();
                result.push(escaped);
                cursor += 1;
            }
            continue;
        }
        if rest.starts_with('`') {
            let ticks = rest.chars().take_while(|ch| *ch == '`').count();
            if let Some(active_ticks) = inline_code_ticks {
                result.push_str(&rest[..ticks]);
                if active_ticks == ticks {
                    inline_code_ticks = None;
                }
            } else if has_matching_backtick_run(&rest[ticks..], ticks) {
                result.push_str(&rest[..ticks]);
                inline_code_ticks = Some(ticks);
            } else {
                result.push_str(&rest[..ticks]);
            }
            cursor += ticks;
            continue;
        }

        if inline_code_ticks.is_none() && is_unsupported_html_image_at(rest) {
            return Err("HTML/data image syntax requires a verified share manifest".to_string());
        }

        if inline_code_ticks.is_none() && rest.starts_with("![") {
            let label_end = rest.find("](").ok_or_else(|| {
                "unsupported Markdown image syntax; refusing to share local paths".to_string()
            })?;
            if rest[2..label_end].contains(['[', '\\']) {
                return Err(
                    "nested or escaped characters in image labels are unsupported".to_string(),
                );
            }
            let destination_start = label_end + 2;
            let after_open = &rest[destination_start..];
            let (destination, suffix, consumed) = parse_destination(after_open)?;
            used_image_paths.insert(destination.to_string());
            let Some(local_path_to_image_id) = local_path_to_image_id else {
                let end = destination_start + consumed;
                result.push_str(&rest[..end]);
                cursor += end;
                continue;
            };
            let image_id = local_path_to_image_id.get(destination).ok_or_else(|| {
                "image is not included in the verified share manifest".to_string()
            })?;
            if image_id.trim().is_empty() || image_id.contains(['/', '\\', ')', ' ', '\n', '\r']) {
                return Err("invalid share image ID".to_string());
            }
            used_image_ids.insert(image_id.clone());
            result.push_str(&rest[..destination_start]);
            result.push_str(SHARE_IMAGE_SCHEME);
            result.push_str(image_id);
            result.push_str(suffix);
            result.push(')');
            cursor += destination_start + consumed;
            continue;
        }

        let ch = rest.chars().next().unwrap();
        result.push(ch);
        cursor += ch.len_utf8();
    }
    Ok(result)
}

fn is_unsupported_html_image_at(input: &str) -> bool {
    if !matches!(
        input.as_bytes().first(),
        Some(b'<' | b'd' | b'D' | b'u' | b'U')
    ) {
        return false;
    }
    for tag in ["<img", "<picture", "<source", "<svg", "<image"] {
        if starts_ascii_case_insensitive(input, tag) {
            let after_name = &input[tag.len()..];
            if after_name.chars().next().map_or(true, |ch| {
                ch.is_ascii_whitespace() || ch == '/' || ch == '>'
            }) {
                return true;
            }
        }
    }
    starts_ascii_case_insensitive(input, "data:image/")
        || starts_ascii_case_insensitive(input, "url(")
}

fn starts_ascii_case_insensitive(input: &str, prefix: &str) -> bool {
    input
        .get(..prefix.len())
        .is_some_and(|candidate| candidate.eq_ignore_ascii_case(prefix))
}

fn has_matching_backtick_run(input: &str, run_length: usize) -> bool {
    let bytes = input.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'`' {
            let run = bytes[index..]
                .iter()
                .take_while(|byte| **byte == b'`')
                .count();
            if run == run_length {
                return true;
            }
            index += run;
        } else {
            index += 1;
        }
    }
    false
}

/// Returns destination, trailing title/whitespace suffix, and consumed bytes up to `)`.
fn parse_destination(input: &str) -> Result<(&str, &str, usize), String> {
    let bytes = input.as_bytes();
    let mut index = 0;
    let mut angle = false;
    if bytes.first() == Some(&b'<') {
        angle = true;
        index = 1;
    }
    let destination_start = index;
    let mut escaped = false;
    while index < bytes.len() {
        let byte = bytes[index];
        if escaped {
            escaped = false;
            index += 1;
            continue;
        }
        if byte == b'\\' {
            escaped = true;
            index += 1;
            continue;
        }
        if angle && byte == b'>' {
            let destination = &input[destination_start..index];
            index += 1;
            let close = input[index..]
                .find(')')
                .map(|relative| index + relative)
                .ok_or_else(|| "unterminated Markdown image link".to_string())?;
            let suffix = &input[index..close];
            return Ok((destination, suffix, close + 1));
        }
        if !angle && (byte == b')' || byte.is_ascii_whitespace()) {
            let destination = &input[destination_start..index];
            if byte == b')' {
                return Ok((destination, "", index + 1));
            }
            let close = input[index..]
                .find(')')
                .map(|relative| index + relative)
                .ok_or_else(|| "unterminated Markdown image link".to_string())?;
            let suffix = &input[index..close];
            return Ok((destination, suffix, close + 1));
        }
        index += 1;
    }
    Err("unterminated Markdown image link".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn paths() -> HashMap<String, String> {
        HashMap::from([
            ("images/photo.png".to_string(), "img-1".to_string()),
            ("images/other.png".to_string(), "img-2".to_string()),
        ])
    }

    fn image_manifest(image_id: &str) -> ShareImageManifest {
        ShareImageManifest {
            image_id: image_id.to_string(),
            mime_type: "image/png".to_string(),
            size_bytes: 12,
            sha256: "a".repeat(64),
        }
    }

    #[test]
    fn local_note_conversion_keeps_title_body_and_checkbox_state_but_drops_frontmatter() {
        let note = "---\ntype: sticky\ntitle: 買い物リスト\ntags: [shortcut, 買い物, prompt, 買い物]\nwindow: { x: 1 }\n---\n\n牛乳を買う\n- [ ] 卵\n* [x] パン\n+ [X] 米\n";
        let payload = local_note_to_share_payload(note, &HashMap::new()).unwrap();
        assert_eq!(payload.title, "買い物リスト");
        assert_eq!(payload.schema_version, 2);
        assert_eq!(payload.background_color.as_deref(), Some("#f7e9b0"));
        assert_eq!(payload.tags, vec!["買い物", "prompt"]);
        assert_eq!(
            payload.markdown,
            "\n牛乳を買う\n- [ ] 卵\n* [x] パン\n+ [X] 米\n"
        );
        assert!(payload.images.is_empty());
        assert!(!payload.markdown.contains("window:"));
    }

    #[test]
    fn local_note_conversion_shares_only_supported_frontmatter_colors() {
        let blue = "---\ntitle: 青い付箋\nbackgroundColor: '#80d8ff'\n---\n本文";
        assert_eq!(local_note_to_share_payload(blue, &HashMap::new()).unwrap().background_color.as_deref(), Some("#80d8ff"));
        let invalid = "---\ntitle: 不正色\nbackgroundColor: 'url(javascript:bad)'\n---\n本文";
        assert_eq!(local_note_to_share_payload(invalid, &HashMap::new()).unwrap().background_color.as_deref(), Some("#f7e9b0"));
    }

    #[test]
    fn local_note_conversion_rejects_ambiguous_tags_instead_of_sharing_them() {
        for note in [
            "---\ntitle: Note\ntags: [買い物, shortcut\n---\nBody",
            "---\ntitle: Note\ntags: [買い物, # comment]\n---\nBody",
            "---\ntitle: Note\ntags: [買い物]\ntags: [家]\n---\nBody",
            "---\ntitle: Note\ntags: [買い物,]\n---\nBody",
        ] {
            assert!(local_note_to_share_payload(note, &HashMap::new()).is_err());
        }
    }

    #[test]
    fn local_note_conversion_rewrites_referenced_images_and_omits_unused_manifests() {
        let note = "---\ntitle: \"写真付き\"\n---\n本文\n![写真](assets/photo.png)\n";
        let image_map = HashMap::from([
            ("assets/photo.png".to_string(), image_manifest("img-1")),
            (
                "assets/unused.png".to_string(),
                image_manifest("img-unused"),
            ),
        ]);
        let payload = local_note_to_share_payload(note, &image_map).unwrap();
        assert_eq!(payload.title, "写真付き");
        assert_eq!(payload.markdown, "本文\n![写真](ore-fusen-image://img-1)\n");
        assert_eq!(payload.images, vec![image_manifest("img-1")]);
    }

    #[test]
    fn local_note_conversion_rejects_missing_or_malformed_frontmatter_and_images() {
        assert!(local_note_to_share_payload("# タイトル\n本文", &HashMap::new()).is_err());
        assert!(
            local_note_to_share_payload("---\ntype: sticky\n---\n本文", &HashMap::new()).is_err()
        );
        let note = "---\ntitle: 画像\n---\n![写真](assets/photo.png)";
        let invalid = ShareImageManifest {
            sha256: "ABC".to_string(),
            ..image_manifest("img-1")
        };
        assert!(local_note_to_share_payload(
            note,
            &HashMap::from([("assets/photo.png".to_string(), invalid)])
        )
        .is_err());
    }

    #[test]
    fn local_note_conversion_preserves_lf_and_crlf_body_prefix_exactly() {
        let lf = "---\ntitle: LF\n---\n\n\n本文";
        let crlf = "---\r\ntitle: CRLF\r\n---\r\n\r\n\r\n本文\r\n";
        assert_eq!(
            local_note_to_share_payload(lf, &HashMap::new())
                .unwrap()
                .markdown,
            "\n\n本文"
        );
        assert_eq!(
            local_note_to_share_payload(crlf, &HashMap::new())
                .unwrap()
                .markdown,
            "\r\n\r\n本文\r\n"
        );
    }

    #[test]
    fn local_note_conversion_rejects_ambiguous_or_duplicate_titles() {
        for note in [
            "---\ntitle: \"買い物\" # local comment\n---\nBody",
            "---\ntitle: \"escape \\\"quote\\\"\"\n---\nBody",
            "---\ntitle: first\ntitle: second\n---\nBody",
        ] {
            assert!(local_note_to_share_payload(note, &HashMap::new()).is_err());
        }
    }

    #[test]
    fn local_note_conversion_rejects_plain_title_yaml_comments() {
        for title in ["# local comment", "買い物\t# local comment"] {
            let note = format!("---\ntitle: {title}\n---\nBody");
            assert!(local_note_to_share_payload(&note, &HashMap::new()).is_err());
        }
    }

    #[test]
    fn shortcut_registration_is_read_only_from_frontmatter() {
        assert!(local_note_has_frontmatter_tag(
            "---\ntags: [home, shortcut]\n---\nBody",
            "shortcut"
        )
        .unwrap());
        assert!(!local_note_has_frontmatter_tag(
            "---\ntitle: Example\n---\nBody\ntags: [shortcut]",
            "shortcut"
        )
        .unwrap());
        assert!(local_note_has_frontmatter_tag(
            "---\ntags: [shortcut]\ntags: [home]\n---\nBody",
            "shortcut"
        )
        .is_err());
        assert!(local_note_has_frontmatter_tag(
            "---\ntags: [\"private,shortcut\"]\n---\nBody",
            "shortcut"
        )
        .is_err());
        assert!(
            local_note_has_frontmatter_tag("---\ntags: 'shortcut\n---\nBody", "shortcut").is_err()
        );
        assert!(local_note_has_frontmatter_tag(
            "---\ntags: # local comment, shortcut\n---\nBody",
            "shortcut"
        )
        .is_err());
    }

    #[test]
    fn image_reference_collection_uses_the_same_live_markdown_parser_as_rewriting() {
        let note = "---\ntitle: Note\nexample: ![front](assets/front.png)\n---\n```md\n![fenced](assets/fenced.png)\n```\n`![inline](assets/inline.png)`\n![angle](<assets/angle.png> \"caption\")\n";
        assert_eq!(
            local_note_image_references(note).unwrap(),
            HashSet::from(["assets/angle.png".to_string()])
        );
    }

    #[test]
    fn html_images_with_local_paths_are_rejected_outside_code() {
        for markdown in [
            "<img src=\"C:/private/photo.png\">",
            "<picture><source srcset=\"C:/private/photo.webp\"></picture>",
            "<svg><image href=\"file:///C:/private/photo.svg\"></image></svg>",
            "<div style=\"background: url(C:/private/photo.png)\"></div>",
            "data:image/png;base64,AAAA",
        ] {
            assert!(rewrite_local_image_references(markdown, &paths()).is_err());
        }
        let example = "```html\n<img src=\"C:/example.png\">\n```\n";
        assert_eq!(
            rewrite_local_image_references(example, &paths()).unwrap(),
            example
        );
    }

    #[test]
    fn rewrites_multiple_local_images_but_keeps_alt_text_and_formatting() {
        let source = "本文\n![写真](images/photo.png)\n![別](<images/other.png> \"title\")\n";
        assert_eq!(
            rewrite_local_image_references(source, &paths()).unwrap(),
            "本文\n![写真](ore-fusen-image://img-1)\n![別](ore-fusen-image://img-2 \"title\")\n"
        );
    }

    #[test]
    fn never_rewrites_examples_inside_code() {
        let source = "`![x](images/photo.png)`\n```md\n![x](images/photo.png)\n```\n";
        assert_eq!(
            rewrite_local_image_references(source, &paths()).unwrap(),
            source
        );
    }

    #[test]
    fn matches_fence_marker_and_length_and_rejects_unclosed_fence() {
        let source = "```\n~~~\n```\n![real](images/photo.png)\n~~~\n";
        assert!(rewrite_local_image_references(source, &paths()).is_err());
        assert!(
            rewrite_local_image_references("```md\n![x](images/photo.png)\n", &paths()).is_err()
        );
        assert_eq!(
            rewrite_local_image_references("````md\n![x](C:/example.png)\n```\n````\n", &paths())
                .unwrap(),
            "````md\n![x](C:/example.png)\n```\n````\n"
        );
        let indented_closer = "```md\n    ```\n![x](C:/private.png)\n```\n";
        assert_eq!(
            rewrite_local_image_references(indented_closer, &paths()).unwrap(),
            indented_closer
        );
    }

    #[test]
    fn unmatched_backticks_are_literal_and_escaped_images_are_untouched() {
        assert!(rewrite_local_image_references("` ![x](C:/private.png)", &paths()).is_err());
        let source = "\\![text](images/photo.png)\n\\\\![image](images/photo.png)\n";
        assert_eq!(
            rewrite_local_image_references(source, &paths()).unwrap(),
            "\\![text](images/photo.png)\n\\\\![image](ore-fusen-image://img-1)\n"
        );
        assert!(
            rewrite_local_image_references("`code\n![x](images/photo.png)\n`", &paths()).is_err()
        );
        assert!(rewrite_local_image_references("\\` ![x](C:/private.png) `", &paths()).is_err());
        assert!(rewrite_local_image_references("`code\\` ![x](C:/private.png)", &paths()).is_err());
        assert!(rewrite_local_image_references(
            "![alt [link](images/photo.png)](C:/private.png)",
            &paths()
        )
        .is_err());
        assert!(rewrite_local_image_references(
            "![alt \\](images/photo.png)](C:/private.png)",
            &paths()
        )
        .is_err());
    }

    #[test]
    fn refuses_unmapped_or_unsupported_image_links_instead_of_leaking_paths() {
        assert!(rewrite_local_image_references("![x](C:/private/photo.png)", &paths()).is_err());
        assert!(rewrite_local_image_references("![x][photo]", &paths()).is_err());
    }
}
