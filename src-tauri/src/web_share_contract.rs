//! Pure validation for the Web-share operation log.
//!
//! This module deliberately does not read Drive, write Markdown, or apply changes.
//! It validates one already-complete page set before any future apply path can use it.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareScope {
    pub account_subject: String,
    pub note_id: String,
    /// Monotonically increasing share generation; u32 is exact in JavaScript Numbers.
    pub generation: u32,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum OperationKind {
    Edit,
    Resolve,
    Acknowledge,
    Revoke,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareImageManifest {
    pub image_id: String,
    pub mime_type: String,
    /// Limited to u32 to remain an exact integer in JavaScript.
    pub size_bytes: u32,
    /// Lowercase hexadecimal SHA-256 of the image bytes.
    pub sha256: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SharePayload {
    /// Version 1 is the original payload; version 2 includes display metadata.
    #[serde(default = "default_share_payload_schema", skip_serializing_if = "is_legacy_share_payload_schema")]
    pub schema_version: u32,
    pub title: String,
    /// Markdown body; local filesystem paths must be replaced with manifest image IDs.
    pub markdown: String,
    #[serde(default)]
    pub images: Vec<ShareImageManifest>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background_color: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
}

fn default_share_payload_schema() -> u32 { 1 }
fn is_legacy_share_payload_schema(value: &u32) -> bool { *value == 1 }

impl OperationKind {
    fn is_content(self) -> bool {
        matches!(self, Self::Edit | Self::Resolve)
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareOperation {
    pub scope: ShareScope,
    pub operation_id: String,
    pub kind: OperationKind,
    pub parents: Vec<String>,
    pub payload_hash: String,
    pub payload: SharePayload,
    #[serde(default)]
    pub resolved_ids: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ValidatedLog {
    /// Root is a locally derived scope-bound identifier, never an arbitrary Drive value.
    pub root_id: String,
    /// Only Edit/Resolve records can appear here. ACK and Revoke are control records.
    pub content_heads: Vec<String>,
    pub control_records: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ValidationError {
    UnsupportedPayloadSchema { operation_id: String },
    InvalidDisplayMetadata { operation_id: String },
    InvalidScope,
    WrongScope {
        operation_id: String,
    },
    EmptyOperationId,
    ReservedRootId {
        operation_id: String,
    },
    EmptyPayloadHash {
        operation_id: String,
    },
    HashFieldTooLarge {
        operation_id: String,
    },
    InvalidImageManifest {
        operation_id: String,
    },
    PayloadHashMismatch {
        operation_id: String,
    },
    DuplicateIdDifferentPayload {
        operation_id: String,
    },
    InvalidRootParent {
        operation_id: String,
    },
    MissingParent {
        operation_id: String,
        parent_id: String,
    },
    ControlRecordAsParent {
        operation_id: String,
        parent_id: String,
    },
    InvalidResolvedId {
        operation_id: String,
        resolved_id: String,
    },
    Cycle,
}

fn append_bytes(
    out: &mut Vec<u8>,
    value: &[u8],
    operation_id: &str,
) -> Result<(), ValidationError> {
    let len = u32::try_from(value.len()).map_err(|_| ValidationError::HashFieldTooLarge {
        operation_id: operation_id.to_string(),
    })?;
    out.extend_from_slice(&len.to_be_bytes());
    out.extend_from_slice(value);
    Ok(())
}

/// Hash protocol `ore-no-fusen-share-v1`: fixed field order, UTF-8 strings with u32 big-endian
/// byte lengths, u32 big-endian integers, and sorted parent/resolution/image-ID arrays. It does
/// not depend on JSON number rendering, object key order, Drive metadata, or download order.
pub fn calculate_payload_hash(record: &ShareOperation) -> Result<String, ValidationError> {
    if !matches!(record.payload.schema_version, 1 | 2) {
        return Err(ValidationError::UnsupportedPayloadSchema { operation_id: record.operation_id.clone() });
    }
    if record.payload.schema_version == 1
        && (record.payload.background_color.is_some() || !record.payload.tags.is_empty())
    {
        return Err(ValidationError::InvalidDisplayMetadata { operation_id: record.operation_id.clone() });
    }
    if record.payload.schema_version == 2 && record.payload.background_color.as_deref().is_some_and(|color| {
        !matches!(color, "#f7e9b0" | "#ffcdd2" | "#80d8ff" | "#fafaf0" | "#cfd8dc")
    }) {
        return Err(ValidationError::InvalidDisplayMetadata { operation_id: record.operation_id.clone() });
    }
    let mut seen_tags = HashSet::new();
    if record.payload.tags.len() > 64 || record.payload.tags.iter().any(|tag| {
        let trimmed = tag.trim();
        trimmed.is_empty() || trimmed != tag || tag.as_bytes().len() > 256 || tag.chars().any(char::is_control)
            || crate::logic::is_reserved_tag(tag) || !seen_tags.insert(tag.to_lowercase())
    }) {
        return Err(ValidationError::InvalidDisplayMetadata { operation_id: record.operation_id.clone() });
    }
    let mut parents = record.parents.clone();
    parents.sort();
    let mut resolved_ids = record.resolved_ids.clone();
    resolved_ids.sort();
    let mut images = record.payload.images.clone();
    images.sort_by(|a, b| a.image_id.cmp(&b.image_id));

    let mut bytes = if record.payload.schema_version == 1 {
        b"ore-no-fusen-share-v1\0".to_vec()
    } else {
        b"ore-no-fusen-share-v2\0".to_vec()
    };
    append_bytes(
        &mut bytes,
        record.scope.account_subject.as_bytes(),
        &record.operation_id,
    )?;
    append_bytes(
        &mut bytes,
        record.scope.note_id.as_bytes(),
        &record.operation_id,
    )?;
    bytes.extend_from_slice(&record.scope.generation.to_be_bytes());
    bytes.push(match record.kind {
        OperationKind::Edit => 1,
        OperationKind::Resolve => 2,
        OperationKind::Acknowledge => 3,
        OperationKind::Revoke => 4,
    });
    for ids in [&parents, &resolved_ids] {
        let count = u32::try_from(ids.len()).map_err(|_| ValidationError::HashFieldTooLarge {
            operation_id: record.operation_id.clone(),
        })?;
        bytes.extend_from_slice(&count.to_be_bytes());
        for id in ids {
            append_bytes(&mut bytes, id.as_bytes(), &record.operation_id)?;
        }
    }
    append_bytes(
        &mut bytes,
        record.payload.title.as_bytes(),
        &record.operation_id,
    )?;
    append_bytes(
        &mut bytes,
        record.payload.markdown.as_bytes(),
        &record.operation_id,
    )?;
    let image_count =
        u32::try_from(images.len()).map_err(|_| ValidationError::HashFieldTooLarge {
            operation_id: record.operation_id.clone(),
        })?;
    bytes.extend_from_slice(&image_count.to_be_bytes());
    for image in images {
        append_bytes(&mut bytes, image.image_id.as_bytes(), &record.operation_id)?;
        append_bytes(&mut bytes, image.mime_type.as_bytes(), &record.operation_id)?;
        bytes.extend_from_slice(&image.size_bytes.to_be_bytes());
        append_bytes(&mut bytes, image.sha256.as_bytes(), &record.operation_id)?;
    }
    if record.payload.schema_version == 2 {
        append_bytes(
            &mut bytes,
            record.payload.background_color.as_deref().unwrap_or("").as_bytes(),
            &record.operation_id,
        )?;
        let mut tags = record.payload.tags.clone();
        tags.sort_by(|a, b| a.as_bytes().cmp(b.as_bytes()));
        let tag_count = u32::try_from(tags.len()).map_err(|_| ValidationError::HashFieldTooLarge {
            operation_id: record.operation_id.clone(),
        })?;
        bytes.extend_from_slice(&tag_count.to_be_bytes());
        for tag in tags {
            append_bytes(&mut bytes, tag.as_bytes(), &record.operation_id)?;
        }
    }
    Ok(format!("{:x}", Sha256::digest(bytes)))
}

fn same_logical_operation(a: &ShareOperation, b: &ShareOperation) -> bool {
    let mut a_parents = a.parents.clone();
    let mut b_parents = b.parents.clone();
    a_parents.sort();
    b_parents.sort();
    let mut a_resolved = a.resolved_ids.clone();
    let mut b_resolved = b.resolved_ids.clone();
    a_resolved.sort();
    b_resolved.sort();
    let mut a_images = a.payload.images.clone();
    let mut b_images = b.payload.images.clone();
    a_images.sort_by(|left, right| left.image_id.cmp(&right.image_id));
    b_images.sort_by(|left, right| left.image_id.cmp(&right.image_id));
    a.scope == b.scope
        && a.kind == b.kind
        && a_parents == b_parents
        && a_resolved == b_resolved
        && a.payload.title == b.payload.title
        && a.payload.markdown == b.payload.markdown
        && a_images == b_images
        && a.payload_hash == b.payload_hash
}

fn scope_root(scope: &ShareScope) -> String {
    // Length-prefix fields to avoid ambiguous concatenation. This ID is local contract state;
    // the Drive copy must still be checked against these exact fields.
    format!(
        "root:{}:{}:{}:{}:{}",
        scope.account_subject.len(),
        scope.account_subject,
        scope.note_id.len(),
        scope.note_id,
        scope.generation
    )
}

pub fn validate_log(
    expected: &ShareScope,
    records: &[ShareOperation],
) -> Result<ValidatedLog, ValidationError> {
    if expected.account_subject.trim().is_empty() || expected.note_id.trim().is_empty() {
        return Err(ValidationError::InvalidScope);
    }
    let root_id = scope_root(expected);
    let mut by_id: HashMap<&str, &ShareOperation> = HashMap::new();
    let mut control_records = Vec::new();

    for record in records {
        if record.scope != *expected {
            return Err(ValidationError::WrongScope {
                operation_id: record.operation_id.clone(),
            });
        }
        if record.operation_id.trim().is_empty() {
            return Err(ValidationError::EmptyOperationId);
        }
        if record.operation_id == root_id || record.operation_id.starts_with("root:") {
            return Err(ValidationError::ReservedRootId {
                operation_id: record.operation_id.clone(),
            });
        }
        if record.payload_hash.trim().is_empty() {
            return Err(ValidationError::EmptyPayloadHash {
                operation_id: record.operation_id.clone(),
            });
        }
        let mut image_ids = HashSet::new();
        if record.payload.images.iter().any(|image| {
            image.image_id.trim().is_empty()
                || image.mime_type.trim().is_empty()
                || image.size_bytes == 0
                || image.sha256.len() != 64
                || !image.sha256.bytes().all(|byte| byte.is_ascii_hexdigit())
                || image.sha256.bytes().any(|byte| byte.is_ascii_uppercase())
                || !image_ids.insert(image.image_id.as_str())
        }) {
            return Err(ValidationError::InvalidImageManifest {
                operation_id: record.operation_id.clone(),
            });
        }
        if record.payload_hash != calculate_payload_hash(record)? {
            return Err(ValidationError::PayloadHashMismatch {
                operation_id: record.operation_id.clone(),
            });
        }
        if let Some(previous) = by_id.insert(&record.operation_id, record) {
            if !same_logical_operation(previous, record) {
                return Err(ValidationError::DuplicateIdDifferentPayload {
                    operation_id: record.operation_id.clone(),
                });
            }
        }
        if !record.kind.is_content() {
            control_records.push(record.operation_id.clone());
        }
    }

    for record in records {
        if record.kind.is_content() && record.parents.is_empty() {
            return Err(ValidationError::InvalidRootParent {
                operation_id: record.operation_id.clone(),
            });
        }
        if record.kind == OperationKind::Edit && record.parents.len() != 1 {
            return Err(ValidationError::InvalidRootParent {
                operation_id: record.operation_id.clone(),
            });
        }
        for parent_id in &record.parents {
            if parent_id == &root_id {
                if record.kind != OperationKind::Edit || record.parents.len() != 1 {
                    return Err(ValidationError::InvalidRootParent {
                        operation_id: record.operation_id.clone(),
                    });
                }
                continue;
            }
            let Some(parent) = by_id.get(parent_id.as_str()) else {
                return Err(ValidationError::MissingParent {
                    operation_id: record.operation_id.clone(),
                    parent_id: parent_id.clone(),
                });
            };
            if !parent.kind.is_content() {
                return Err(ValidationError::ControlRecordAsParent {
                    operation_id: record.operation_id.clone(),
                    parent_id: parent_id.clone(),
                });
            }
        }
        for resolved_id in &record.resolved_ids {
            if !record.parents.contains(resolved_id)
                || !by_id
                    .get(resolved_id.as_str())
                    .is_some_and(|resolved| resolved.kind.is_content())
            {
                return Err(ValidationError::InvalidResolvedId {
                    operation_id: record.operation_id.clone(),
                    resolved_id: resolved_id.clone(),
                });
            }
        }
        match record.kind {
            OperationKind::Resolve => {
                let mut parents = record.parents.clone();
                let mut resolved = record.resolved_ids.clone();
                parents.sort();
                resolved.sort();
                if parents.len() < 2
                    || parents.windows(2).any(|pair| pair[0] == pair[1])
                    || resolved.windows(2).any(|pair| pair[0] == pair[1])
                    || parents != resolved
                {
                    return Err(ValidationError::InvalidResolvedId {
                        operation_id: record.operation_id.clone(),
                        resolved_id: "resolution must name every parent head".to_string(),
                    });
                }
            }
            _ if !record.resolved_ids.is_empty() => {
                return Err(ValidationError::InvalidResolvedId {
                    operation_id: record.operation_id.clone(),
                    resolved_id: "only resolve records may resolve heads".to_string(),
                });
            }
            _ => {}
        }
    }

    // Cycle check applies only to content edges. Control records never define note content.
    let content: HashMap<&str, &ShareOperation> = by_id
        .iter()
        .filter(|(_, record)| record.kind.is_content())
        .map(|(id, record)| (*id, *record))
        .collect();
    let mut visiting = HashSet::new();
    let mut visited = HashSet::new();
    fn visit<'a>(
        id: &'a str,
        content: &HashMap<&'a str, &'a ShareOperation>,
        root_id: &str,
        visiting: &mut HashSet<&'a str>,
        visited: &mut HashSet<&'a str>,
    ) -> Result<(), ValidationError> {
        if visited.contains(id) {
            return Ok(());
        }
        if !visiting.insert(id) {
            return Err(ValidationError::Cycle);
        }
        if let Some(record) = content.get(id) {
            for parent in &record.parents {
                if parent != root_id {
                    visit(parent, content, root_id, visiting, visited)?;
                }
            }
        }
        visiting.remove(id);
        visited.insert(id);
        Ok(())
    }
    for id in content.keys() {
        visit(id, &content, &root_id, &mut visiting, &mut visited)?;
    }

    let mut has_content_child = HashSet::new();
    for record in records.iter().filter(|r| r.kind.is_content()) {
        for parent_id in &record.parents {
            if parent_id != &root_id {
                has_content_child.insert(parent_id.as_str());
            }
        }
    }
    let mut content_heads: Vec<String> = content
        .keys()
        .filter(|id| !has_content_child.contains(**id))
        .map(|id| (*id).to_string())
        .collect();
    content_heads.sort();
    control_records.sort();
    control_records.dedup();
    Ok(ValidatedLog {
        root_id,
        content_heads,
        control_records,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scope() -> ShareScope {
        ShareScope {
            account_subject: "acct-1".into(),
            note_id: "note-1".into(),
            generation: 4,
        }
    }

    fn op(id: &str, kind: OperationKind, parents: &[&str]) -> ShareOperation {
        let mut record = ShareOperation {
            scope: scope(),
            operation_id: id.into(),
            kind,
            parents: parents.iter().map(|s| (*s).into()).collect(),
            payload_hash: String::new(),
            payload: SharePayload {
                schema_version: 1,
                title: format!("title-{id}"),
                markdown: format!("body-{id}"),
                images: Vec::new(),
                background_color: None,
                tags: Vec::new(),
            },
            resolved_ids: Vec::new(),
        };
        record.payload_hash = calculate_payload_hash(&record).unwrap();
        record
    }

    fn rehash(record: &mut ShareOperation) {
        record.payload_hash = calculate_payload_hash(record).unwrap();
    }

    #[test]
    fn only_scope_bound_root_can_start_a_change() {
        let s = scope();
        let root = scope_root(&s);
        let valid = op("a", OperationKind::Edit, &[&root]);
        assert_eq!(validate_log(&s, &[valid]).unwrap().content_heads, ["a"]);
        let arbitrary = op("b", OperationKind::Edit, &["root:somebody-elses-note"]);
        assert!(matches!(
            validate_log(&s, &[arbitrary]),
            Err(ValidationError::MissingParent { .. })
        ));
        let rootless = op("c", OperationKind::Edit, &[]);
        assert!(matches!(
            validate_log(&s, &[rootless]),
            Err(ValidationError::InvalidRootParent { .. })
        ));
    }

    #[test]
    fn ack_and_revoke_are_never_content_heads_or_parents() {
        let s = scope();
        let root = scope_root(&s);
        let edit = op("edit", OperationKind::Edit, &[&root]);
        let ack = op("ack", OperationKind::Acknowledge, &["edit"]);
        let revoke = op("revoke", OperationKind::Revoke, &[]);
        let log = validate_log(&s, &[edit.clone(), ack, revoke]).unwrap();
        assert_eq!(log.content_heads, ["edit"]);
        assert_eq!(log.control_records, ["ack", "revoke"]);
        let duplicate_controls = validate_log(
            &s,
            &[
                edit.clone(),
                op("ack", OperationKind::Acknowledge, &["edit"]),
                op("ack", OperationKind::Acknowledge, &["edit"]),
                op("revoke", OperationKind::Revoke, &[]),
                op("revoke", OperationKind::Revoke, &[]),
            ],
        )
        .unwrap();
        assert_eq!(duplicate_controls.control_records, ["ack", "revoke"]);
        let invalid = op("next", OperationKind::Edit, &["ack"]);
        assert!(matches!(
            validate_log(
                &s,
                &[edit, op("ack", OperationKind::Acknowledge, &[]), invalid]
            ),
            Err(ValidationError::ControlRecordAsParent { .. })
        ));
    }

    #[test]
    fn records_from_another_note_account_or_generation_are_rejected() {
        let expected = scope();
        for mutate in [0, 1, 2] {
            let mut bad = op("foreign", OperationKind::Edit, &[]);
            match mutate {
                0 => bad.scope.account_subject = "acct-2".into(),
                1 => bad.scope.note_id = "note-2".into(),
                _ => bad.scope.generation += 1,
            }
            assert!(matches!(
                validate_log(&expected, &[bad]),
                Err(ValidationError::WrongScope { .. })
            ));
        }
    }

    #[test]
    fn parent_from_wrong_scope_and_unknown_parent_are_held() {
        let expected = scope();
        let root = scope_root(&expected);
        let parent = op("parent", OperationKind::Edit, &[&root]);
        let mut wrong_parent = parent.clone();
        wrong_parent.scope.note_id = "other-note".into();
        let child = op("child", OperationKind::Edit, &["parent"]);
        assert!(matches!(
            validate_log(&expected, &[wrong_parent, child]),
            Err(ValidationError::WrongScope { .. })
        ));
        let orphan = op("orphan", OperationKind::Edit, &["missing"]);
        assert!(matches!(
            validate_log(&expected, &[orphan]),
            Err(ValidationError::MissingParent { .. })
        ));
    }

    #[test]
    fn duplicate_ids_are_idempotent_only_for_identical_records() {
        let s = scope();
        let root = scope_root(&s);
        let first = op("same", OperationKind::Edit, &[&root]);
        assert_eq!(
            validate_log(&s, &[first.clone(), first.clone()])
                .unwrap()
                .content_heads,
            ["same"]
        );
        let mut changed = first.clone();
        changed.payload.markdown = "different".into();
        changed.payload_hash = calculate_payload_hash(&changed).unwrap();
        assert!(matches!(
            validate_log(&s, &[first, changed]),
            Err(ValidationError::DuplicateIdDifferentPayload { .. })
        ));
    }

    #[test]
    fn payload_hash_is_verified_and_parent_order_is_canonical() {
        let s = scope();
        let root = scope_root(&s);
        let mut record = op("hash-test", OperationKind::Edit, &[&root]);
        record.payload_hash = calculate_payload_hash(&record).unwrap();
        assert!(validate_log(&s, &[record.clone()]).is_ok());

        let mut tampered = record.clone();
        tampered.payload.markdown = "tampered".into();
        assert!(matches!(
            validate_log(&s, &[tampered]),
            Err(ValidationError::PayloadHashMismatch { .. })
        ));

        let a = op("a", OperationKind::Edit, &[&root]);
        let b = op("b", OperationKind::Edit, &[&root]);
        let mut merge1 = op("merge1", OperationKind::Resolve, &["a", "b"]);
        merge1.resolved_ids = vec!["a".into(), "b".into()];
        rehash(&mut merge1);
        let mut merge2 = merge1.clone();
        merge2.parents.reverse();
        merge2.resolved_ids.reverse();
        assert_eq!(
            calculate_payload_hash(&merge1).unwrap(),
            calculate_payload_hash(&merge2).unwrap()
        );
        assert!(validate_log(&s, &[a, b, merge1, merge2]).is_ok());
    }

    #[test]
    fn payload_hash_matches_the_cross_language_v1_test_vector() {
        let record = ShareOperation {
            scope: ShareScope {
                account_subject: "acct-1".into(),
                note_id: "note-1".into(),
                generation: 4,
            },
            operation_id: "ignored-by-hash".into(),
            kind: OperationKind::Edit,
            parents: vec!["root-x".into()],
            payload_hash: String::new(),
            payload: SharePayload {
                schema_version: 1,
                title: "Title".into(),
                markdown: "Body".into(),
                images: Vec::new(),
                background_color: None,
                tags: Vec::new(),
            },
            resolved_ids: Vec::new(),
        };
        assert_eq!(
            calculate_payload_hash(&record).unwrap(),
            "cd61431fd0c445347a2aa80ea31f7c4480f28c52bef9285238851ac6f54fd742"
        );
    }

    #[test]
    fn schema_v2_hash_covers_display_color_and_tags_canonically() {
        let scope = scope();
        let root = scope_root(&scope);
        let mut record = op("op-v2-fixed", OperationKind::Edit, &[&root]);
        record.payload.schema_version = 2;
        record.payload.title = "Title".into();
        record.payload.markdown = "Body".into();
        record.payload.background_color = Some("#80d8ff".into());
        record.payload.tags = vec!["旅行".into(), "予定".into()];
        let first = calculate_payload_hash(&record).unwrap();
        record.payload.tags.reverse();
        assert_eq!(calculate_payload_hash(&record).unwrap(), first);
        record.payload.background_color = Some("#ffcdd2".into());
        assert_ne!(calculate_payload_hash(&record).unwrap(), first);
        record.payload.background_color = Some("".into());
        assert!(matches!(calculate_payload_hash(&record), Err(ValidationError::InvalidDisplayMetadata { .. })));
        record.payload.background_color = Some("url(javascript:bad)".into());
        assert!(matches!(calculate_payload_hash(&record), Err(ValidationError::InvalidDisplayMetadata { .. })));
        record.payload.background_color = Some("#80d8ff".into());
        record.payload.tags = vec!["shortcut".into()];
        assert!(matches!(calculate_payload_hash(&record), Err(ValidationError::InvalidDisplayMetadata { .. })));
    }

    #[test]
    fn rust_and_web_share_the_same_nested_json_fixture() {
        let fixture: ShareOperation = serde_json::from_str(include_str!(
            "../../test-fixtures/web-share-operation-v1.json"
        ))
        .expect("shared wire fixture must deserialize like a Drive record");
        let result = validate_log(&scope(), &[fixture]).expect("shared wire fixture must validate");
        assert_eq!(result.content_heads, vec!["op-fixed"]);
    }

    #[test]
    fn rust_validates_the_shared_v2_color_and_tag_hash_fixture() {
        let fixture: ShareOperation = serde_json::from_str(include_str!(
            "../../test-fixtures/web-share-operation-v2.json"
        ))
        .expect("shared v2 fixture must deserialize");
        let result = validate_log(&scope(), &[fixture]).expect("shared v2 fixture hash must validate");
        assert_eq!(result.content_heads, vec!["op-v2-fixed"]);
    }

    #[test]
    fn image_manifest_rejects_duplicate_ids_and_noncanonical_hashes() {
        let s = scope();
        let root = scope_root(&s);
        let mut duplicate = op("duplicate-image", OperationKind::Edit, &[&root]);
        let image = ShareImageManifest {
            image_id: "image-1".into(),
            mime_type: "image/png".into(),
            size_bytes: 10,
            sha256: "a".repeat(64),
        };
        duplicate.payload.images = vec![image.clone(), image];
        rehash(&mut duplicate);
        assert!(matches!(
            validate_log(&s, &[duplicate]),
            Err(ValidationError::InvalidImageManifest { .. })
        ));

        let mut uppercase = op("uppercase-image-hash", OperationKind::Edit, &[&root]);
        uppercase.payload.images.push(ShareImageManifest {
            image_id: "image-2".into(),
            mime_type: "image/png".into(),
            size_bytes: 10,
            sha256: "A".repeat(64),
        });
        rehash(&mut uppercase);
        assert!(matches!(
            validate_log(&s, &[uppercase]),
            Err(ValidationError::InvalidImageManifest { .. })
        ));
    }

    #[test]
    fn duplicate_operation_accepts_reordered_equivalent_image_manifest() {
        let s = scope();
        let root = scope_root(&s);
        let mut first = op("same-with-images", OperationKind::Edit, &[&root]);
        first.payload.images = vec![
            ShareImageManifest {
                image_id: "image-a".into(),
                mime_type: "image/png".into(),
                size_bytes: 10,
                sha256: "a".repeat(64),
            },
            ShareImageManifest {
                image_id: "image-b".into(),
                mime_type: "image/jpeg".into(),
                size_bytes: 20,
                sha256: "b".repeat(64),
            },
        ];
        rehash(&mut first);
        let mut reordered = first.clone();
        reordered.payload.images.reverse();
        assert_eq!(first.payload_hash, reordered.payload_hash);
        assert_eq!(
            validate_log(&s, &[first, reordered]).unwrap().content_heads,
            ["same-with-images"]
        );
    }

    #[test]
    fn edit_cannot_merge_branches_without_an_explicit_resolution() {
        let s = scope();
        let root = scope_root(&s);
        let a = op("a", OperationKind::Edit, &[&root]);
        let b = op("b", OperationKind::Edit, &[&root]);
        let accidental_merge = op("merge-without-resolution", OperationKind::Edit, &["a", "b"]);
        assert!(matches!(
            validate_log(&s, &[a, b, accidental_merge]),
            Err(ValidationError::InvalidRootParent { .. })
        ));
    }

    #[test]
    fn operation_id_cannot_impersonate_the_scope_root() {
        let s = scope();
        let root = scope_root(&s);
        let collision = op(&root, OperationKind::Edit, &[&root]);
        assert!(matches!(
            validate_log(&s, &[collision]),
            Err(ValidationError::ReservedRootId { .. })
        ));
        let foreign_root_name = op("root:other-scope", OperationKind::Edit, &[]);
        assert!(matches!(
            validate_log(&s, &[foreign_root_name]),
            Err(ValidationError::ReservedRootId { .. })
        ));
    }

    #[test]
    fn resolution_requires_a_distinct_complete_parent_set() {
        let s = scope();
        let root = scope_root(&s);
        let a = op("a", OperationKind::Edit, &[&root]);
        let b = op("b", OperationKind::Edit, &[&root]);
        let mut missing = op("resolve-missing", OperationKind::Resolve, &["a", "b"]);
        missing.resolved_ids = vec!["a".into()];
        rehash(&mut missing);
        assert!(matches!(
            validate_log(&s, &[a.clone(), b.clone(), missing]),
            Err(ValidationError::InvalidResolvedId { .. })
        ));
        let mut duplicate = op("resolve-duplicate", OperationKind::Resolve, &["a", "a"]);
        duplicate.resolved_ids = vec!["a".into(), "a".into()];
        rehash(&mut duplicate);
        assert!(matches!(
            validate_log(&s, &[a, b, duplicate]),
            Err(ValidationError::InvalidResolvedId { .. })
        ));
    }

    #[test]
    fn resolution_merges_all_heads_but_a_late_old_branch_remains_visible() {
        let s = scope();
        let root = scope_root(&s);
        let a = op("a", OperationKind::Edit, &[&root]);
        let b = op("b", OperationKind::Edit, &[&root]);
        let mut resolve = op("resolve", OperationKind::Resolve, &["a", "b"]);
        resolve.resolved_ids = vec!["a".into(), "b".into()];
        rehash(&mut resolve);
        assert_eq!(
            validate_log(&s, &[a.clone(), b.clone(), resolve.clone()])
                .unwrap()
                .content_heads,
            ["resolve"]
        );
        let late = op("late", OperationKind::Edit, &["a"]);
        assert_eq!(
            validate_log(&s, &[a, b, resolve, late])
                .unwrap()
                .content_heads,
            ["late", "resolve"]
        );
    }

    #[test]
    fn cyclic_parent_graph_is_rejected() {
        let s = scope();
        let a = op("a", OperationKind::Edit, &["b"]);
        let b = op("b", OperationKind::Edit, &["a"]);
        assert_eq!(validate_log(&s, &[a, b]), Err(ValidationError::Cycle));
    }
}
