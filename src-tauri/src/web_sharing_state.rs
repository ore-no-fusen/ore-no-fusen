//! Web visibility is independent of launcher membership and note content.
use std::collections::{HashMap, HashSet};
use serde::{Deserialize, Serialize};
use crate::web_share_contract::ShareScope;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SharingRecord {
    schema_version: u32,
    scope: ShareScope,
    id: String,
    action: SharingAction,
    parents: Vec<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum SharingAction { Pause, Resume }

fn valid_uuid(id: &str) -> bool {
    uuid::Uuid::parse_str(id).is_ok_and(|value| value.to_string() == id)
}
pub(crate) fn parse(value: serde_json::Value, name: &str) -> Result<SharingRecord, String> {
    let record: SharingRecord = serde_json::from_value(value).map_err(|e| format!("Web共有設定を読めません: {e}"))?;
    if record.schema_version != 1 || record.scope.account_subject.trim().is_empty() || record.scope.note_id.trim().is_empty()
        || !valid_uuid(&record.id) || name != format!("web-sharing-{}.json", record.id)
        || record.parents.iter().any(|id| !valid_uuid(id))
        || record.parents.iter().collect::<HashSet<_>>().len() != record.parents.len() {
        return Err("Web共有設定が不正です".into());
    }
    Ok(record)
}

/// Concurrent pause wins. A resume must observe all pause heads to clear them.
pub(crate) fn paused_ids(records: &[SharingRecord], account: &str) -> Result<HashSet<String>, String> {
    let mut by_id = HashMap::new();
    for record in records {
        if record.scope.account_subject != account { return Err("別アカウントのWeb共有設定があります".into()); }
        if let Some(previous) = by_id.insert(record.id.as_str(), record) {
            let mut left = previous.clone(); let mut right = record.clone();
            left.parents.sort(); right.parents.sort();
            if left != right { return Err("Web共有設定のIDが重複しています".into()); }
        }
    }
    let mut remaining = HashMap::new();
    let mut children = HashMap::<&str, Vec<&str>>::new();
    for record in by_id.values() {
        remaining.insert(record.id.as_str(), record.parents.len());
        for parent in &record.parents {
            let previous = by_id.get(parent.as_str()).ok_or("Web共有設定の履歴が不足しています")?;
            if previous.scope != record.scope { return Err("別の付箋の共有設定が混在しています".into()); }
            children.entry(parent.as_str()).or_default().push(record.id.as_str());
        }
    }
    let mut ready = remaining.iter().filter(|(_, count)| **count == 0).map(|(id, _)| *id).collect::<Vec<_>>();
    let mut visited = 0;
    while let Some(id) = ready.pop() {
        visited += 1;
        for child in children.get(id).into_iter().flatten() {
            let count = remaining.get_mut(child).ok_or("Web共有設定の履歴が不足しています")?;
            *count -= 1;
            if *count == 0 { ready.push(child); }
        }
    }
    if visited != by_id.len() { return Err("Web共有設定が循環しています".into()); }
    let parents = records.iter().flat_map(|record| record.parents.iter().map(String::as_str)).collect::<HashSet<_>>();
    Ok(records.iter().filter(|record| record.scope.generation == 1 && !parents.contains(record.id.as_str()) && record.action == SharingAction::Pause)
        .map(|record| record.scope.note_id.clone()).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    const A: &str = "11111111-1111-4111-8111-111111111111";
    const B: &str = "22222222-2222-4222-8222-222222222222";
    fn record(id: &str, action: SharingAction, parents: Vec<String>) -> SharingRecord {
        SharingRecord { schema_version: 1, scope: ShareScope { account_subject: "test".into(), note_id: "note".into(), generation: 1 }, id: id.into(), action, parents }
    }
    #[test]
    fn pause_resume_keeps_launcher_and_body_out_of_the_protocol() {
        let pause = record(A, SharingAction::Pause, vec![]);
        assert!(paused_ids(&[pause.clone()], "test").unwrap().contains("note"));
        let resume = record(B, SharingAction::Resume, vec![A.into()]);
        assert!(paused_ids(&[resume, pause], "test").unwrap().is_empty());
    }
    #[test]
    fn concurrent_pause_wins_and_invalid_history_blocks_sync() {
        assert!(paused_ids(&[record(A, SharingAction::Pause, vec![]), record(B, SharingAction::Resume, vec![])], "test").unwrap().contains("note"));
        assert!(paused_ids(&[record(B, SharingAction::Resume, vec![A.into()])], "test").is_err());
        assert!(paused_ids(&[record(A, SharingAction::Pause, vec![B.into()]), record(B, SharingAction::Resume, vec![A.into()])], "test").is_err());
        assert!(paused_ids(&[record(A, SharingAction::Pause, vec![])], "other").is_err());
    }
}
