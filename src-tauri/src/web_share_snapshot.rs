//! Bounded current-state storage. Old operation files are removed only after
//! their contents have been captured by a verified, conditional snapshot write.
use crate::web_share_preview::{self as preview, ImageReservation, PreviewAsset};
use crate::{
    gdrive,
    web_share_contract::{self as contract, OperationKind, ShareOperation},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap, HashSet};

pub(crate) const MAX_SNAPSHOT_BYTES: usize = 4 * 1024 * 1024;
pub(crate) const MAX_ACCOUNT_BYTES: usize = 512 * 1024 * 1024;
type FileRecord = (String, String, Value);

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Cleanup {
    pub id: String,
    pub digest: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Snapshot {
    pub schema_version: u32,
    pub operation: ShareOperation,
    pub paused: bool,
    pub revoked: bool,
    pub sharing_id: String,
    pub images: BTreeMap<String, PreviewAsset>,
    pub published: bool,
    pub pending: Option<ImageReservation>,
    pub mutation_id: String,
    pub gc_nonce: String,
    pub managed_image_owners: Vec<String>,
    pub superseded_by: Option<String>,
    pub absorbed_snapshots: BTreeMap<String, String>,
    pub conflicts: Vec<ShareOperation>,
    pub cleanup: Vec<Cleanup>,
}
#[derive(Clone)]
pub(crate) struct Stored {
    pub id: String,
    pub etag: String,
    pub snapshot: Snapshot,
}
#[derive(Default)]
pub(crate) struct Store {
    pub notes: HashMap<String, Stored>,
    pub operations: Vec<ShareOperation>,
    pub paused: HashSet<String>,
    pub blocked: HashSet<String>,
    total_bytes: usize,
}

fn digest(value: &Value) -> String {
    format!("{:x}", Sha256::digest(serde_json::to_vec(value).unwrap()))
}
fn same_snapshot(left: &Snapshot, right: &Snapshot) -> bool {
    serde_json::to_value(left).unwrap() == serde_json::to_value(right).unwrap()
}
fn frozen_digest(snapshot: &Snapshot) -> String {
    let mut content = snapshot.clone();
    content.superseded_by = None;
    digest(&serde_json::to_value(content).unwrap())
}
fn root(operation: &ShareOperation) -> String {
    let s = &operation.scope;
    format!(
        "root:{}:{}:{}:{}:{}",
        s.account_subject.len(),
        s.account_subject,
        s.note_id.len(),
        s.note_id,
        s.generation
    )
}
fn normalized(mut operation: ShareOperation) -> Result<ShareOperation, String> {
    operation.kind = OperationKind::Edit;
    operation.parents = vec![root(&operation)];
    operation.resolved_ids.clear();
    operation.payload_hash = contract::calculate_payload_hash(&operation)
        .map_err(|e| format!("共有状態の検証失敗: {e:?}"))?;
    contract::validate_log(&operation.scope, &[operation.clone()])
        .map_err(|e| format!("共有状態が不正です: {e:?}"))?;
    Ok(operation)
}
impl Snapshot {
    pub fn validate(&self, account: &str) -> Result<(), String> {
        if self.schema_version != 2
            || self.operation.scope.account_subject != account
            || self.operation.scope.generation != 1
            || self.sharing_id.is_empty()
        {
            return Err("共有状態の形式またはアカウントが一致しません".into());
        }
        let identifier = |id: &str| {
            !id.is_empty()
                && id
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
        };
        if self.absorbed_snapshots.iter().any(|(id, hash)| {
            !identifier(id)
                || hash.len() != 64
                || !hash
                    .bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        }) {
            return Err("共有状態の保全証拠が不正です".into());
        }
        if self.managed_image_owners.is_empty()
            || self.managed_image_owners.iter().any(|id| !identifier(id))
            || self
                .superseded_by
                .as_ref()
                .is_some_and(|id| !identifier(id))
        {
            return Err("共有画像の管理範囲が不正です".into());
        }
        let mut expected = HashSet::new();
        for operation in std::iter::once(&self.operation).chain(self.conflicts.iter()) {
            if operation.scope != self.operation.scope
                || normalized(operation.clone())? != *operation
            {
                return Err("共有状態の基準が不正です".into());
            }
            for image in &operation.payload.images {
                self.images
                    .get(&image.sha256)
                    .ok_or("共有画像がありません")?
                    .validate(&image.sha256)?;
                expected.insert(image.sha256.clone());
            }
        }
        if expected.len() != self.images.len()
            || self.images.keys().any(|key| !expected.contains(key))
        {
            return Err("共有画像の参照が一致しません".into());
        }
        if let Some(pending) = &self.pending {
            if uuid::Uuid::parse_str(&pending.mutation_id).is_err() || pending.owner_pc.is_empty() {
                return Err("画像予約が不正です".into());
            }
            for (hash, asset) in &pending.assets {
                asset.validate(hash)?;
                if asset.legacy {
                    return Err("旧画像を新規予約しません".into());
                }
            }
        }
        if self
            .cleanup
            .iter()
            .any(|item| item.id.is_empty() || item.digest.len() != 64)
        {
            return Err("共有記録の整理情報が不正です".into());
        }
        if serde_json::to_vec(self).map_err(|e| e.to_string())?.len() > MAX_SNAPSHOT_BYTES {
            return Err("共有付箋の容量上限を超えています。元データは保持しています".into());
        }
        Ok(())
    }
}

async fn capture_images(
    client: &reqwest::Client,
    token: &str,
    folder: &str,
    snapshot: &mut Snapshot,
) -> Result<(), String> {
    for operation in std::iter::once(&snapshot.operation).chain(snapshot.conflicts.iter()) {
        for image in &operation.payload.images {
            if snapshot.images.contains_key(&image.sha256) {
                continue;
            }
            let id = gdrive::find_web_share_file(
                client,
                token,
                folder,
                &format!("image-{}", image.sha256),
            )
            .await?
            .ok_or("共有画像がありません。旧記録は削除していません")?;
            snapshot.images.insert(
                image.sha256.clone(),
                PreviewAsset {
                    file_id: id,
                    source_sha256: image.sha256.clone(),
                    sha256: image.sha256.clone(),
                    mime_type: image.mime_type.clone(),
                    size_bytes: image.size_bytes,
                    width: 0,
                    height: 0,
                    legacy: true,
                },
            );
        }
    }
    Ok(())
}

impl Store {
    pub async fn load(
        client: &reqwest::Client,
        token: &str,
        folder: &str,
        account: &str,
        files: Vec<(String, String)>,
        settings: Vec<FileRecord>,
    ) -> Result<Self, String> {
        let mut store = Self::default();
        let available: HashSet<_> = files
            .iter()
            .map(|r| r.0.clone())
            .chain(settings.iter().map(|r| r.0.clone()))
            .collect();
        for (_, name, value) in &settings {
            crate::web_sharing_state::parse(value.clone(), name)?;
            if value["scope"]["accountSubject"].as_str() != Some(account) {
                return Err("別アカウントの共有設定があります".into());
            }
        }
        let mut legacy = HashMap::<String, Vec<FileRecord>>::new();
        let mut snapshots = HashMap::<String, Vec<Stored>>::new();
        let read_files = crate::web_share_download::read_all(files, |(id, name)| {
            let (client, token, folder) = (client.clone(), token.to_owned(), folder.to_owned());
            async move {
                let (value, etag) =
                    gdrive::read_web_share_cas(&client, &token, &id, &folder).await?;
                Ok((id, name, value, etag))
            }
        })
        .await?;
        for (id, name, value, etag) in read_files {
            // One bounded, revision-consistent read, not raw JSON followed by
            // another download of the same base64 images.
            if value["schemaVersion"] == 2 {
                let snapshot: Snapshot =
                    serde_json::from_value(value).map_err(|_| "共有状態を読み取れません")?;
                snapshot.validate(account)?;
                let key = snapshot.operation.scope.note_id.clone();
                snapshots
                    .entry(key)
                    .or_default()
                    .push(Stored { id, etag, snapshot });
            } else {
                let operation: ShareOperation =
                    serde_json::from_value(value.clone()).map_err(|_| "共有記録が不正です")?;
                if operation.scope.account_subject != account {
                    return Err("別アカウントの共有記録があります".into());
                }
                legacy
                    .entry(operation.scope.note_id.clone())
                    .or_default()
                    .push((id, name, value));
            }
        }
        for (key, mut copies) in snapshots {
            copies.sort_by(|a, b| a.id.cmp(&b.id));
            let mut seen = HashMap::<String, ShareOperation>::new();
            let mut collision = false;
            let mut receipts = BTreeMap::<String, String>::new();
            for saved in &copies {
                for (id, hash) in &saved.snapshot.absorbed_snapshots {
                    if receipts.get(id).is_some_and(|prior| prior != hash) {
                        collision = true;
                    }
                    receipts.insert(id.clone(), hash.clone());
                }
            }
            for saved in &copies {
                if let Some(receipt) = receipts.get(&saved.id) {
                    if receipt != &frozen_digest(&saved.snapshot) {
                        collision = true;
                    }
                    continue;
                }
                if !saved.snapshot.published {
                    continue;
                }
                for operation in std::iter::once(&saved.snapshot.operation)
                    .chain(saved.snapshot.conflicts.iter())
                {
                    if seen
                        .get(&operation.operation_id)
                        .is_some_and(|prior| prior != operation)
                    {
                        collision = true;
                    }
                    seen.insert(operation.operation_id.clone(), operation.clone());
                }
            }
            if collision {
                store.blocked.insert(key.clone());
                store.paused.insert(key);
                store.operations.extend(
                    copies
                        .into_iter()
                        .filter(|s| s.snapshot.published)
                        .flat_map(|s| {
                            std::iter::once(s.snapshot.operation).chain(s.snapshot.conflicts)
                        }),
                );
                continue;
            }
            if copies.len() > 1
                && copies.iter().any(|s| {
                    s.snapshot
                        .pending
                        .as_ref()
                        .is_some_and(|p| p.expires_at >= chrono::Utc::now().timestamp())
                })
            {
                store.blocked.insert(key.clone());
                store.paused.insert(key);
                store.operations.extend(
                    copies
                        .into_iter()
                        .filter(|s| s.snapshot.published)
                        .map(|s| s.snapshot.operation),
                );
                continue;
            }
            let mut canonical = copies.remove(0);
            if canonical.snapshot.superseded_by.is_some() {
                return Err("共有状態の調停先を確認するため再同期します".into());
            }
            for mut loser in copies {
                if loser.snapshot.pending.is_some() {
                    let mut cancelled = loser.snapshot.clone();
                    cancelled.pending = None;
                    gdrive::write_web_share_cas(
                        client,
                        token,
                        &loser.id,
                        &loser.etag,
                        &serde_json::to_value(&cancelled).unwrap(),
                    )
                    .await?;
                    loser = Self::reload(client, token, folder, &loser.id, account).await?;
                }
                let mut frozen = loser.snapshot.clone();
                if frozen
                    .superseded_by
                    .as_ref()
                    .is_some_and(|id| id < &canonical.id)
                {
                    return Err("共有状態の調停先が変わりました。再同期で確認します".into());
                }
                frozen.superseded_by = Some(canonical.id.clone());
                gdrive::write_web_share_cas(
                    client,
                    token,
                    &loser.id,
                    &loser.etag,
                    &serde_json::to_value(&frozen).unwrap(),
                )
                .await?;
                loser = Self::reload(client, token, folder, &loser.id, account).await?;
                if !same_snapshot(&loser.snapshot, &frozen) {
                    return Err("共有状態の保全中に変更がありました".into());
                }
                let captured = frozen_digest(&frozen);
                if let Some(receipt) = canonical.snapshot.absorbed_snapshots.get(&loser.id) {
                    if receipt != &captured {
                        return Err("保全済み共有状態と内容が一致しません。両方を保持します".into());
                    }
                    // Its body may since have been edited or revoked at the
                    // canonical anchor. Do not resurrect the old frozen body.
                    gdrive::delete_web_share_cas(client, token, &loser.id, &loser.etag).await?;
                    continue;
                }
                // Adopt only currently referenced images of the frozen owner.
                // Its earlier GC cannot include these IDs, and future GC is
                // disabled. Newly uploaded orphan IDs are never reused.
                let mut merged = canonical.snapshot.clone();
                if loser.snapshot.published {
                    for operation in std::iter::once(&loser.snapshot.operation)
                        .chain(loser.snapshot.conflicts.iter())
                    {
                        if !merged.published {
                            merged.operation = operation.clone();
                            merged.published = true;
                        } else if std::iter::once(&merged.operation)
                            .chain(merged.conflicts.iter())
                            .any(|prior| prior.payload == operation.payload)
                        {
                            continue;
                        } else if std::iter::once(&merged.operation)
                            .chain(merged.conflicts.iter())
                            .any(|prior| prior.operation_id == operation.operation_id)
                        {
                            return Err("同じ変更IDの異なる内容を保持しています".into());
                        } else {
                            merged.conflicts.push(operation.clone());
                            merged.paused = true;
                        }
                    }
                    for operation in
                        std::iter::once(&merged.operation).chain(merged.conflicts.iter())
                    {
                        for image in &operation.payload.images {
                            if !merged.images.contains_key(&image.sha256) {
                                merged.images.insert(
                                    image.sha256.clone(),
                                    loser
                                        .snapshot
                                        .images
                                        .get(&image.sha256)
                                        .ok_or("統合する画像参照がありません")?
                                        .clone(),
                                );
                            }
                        }
                    }
                }
                merged.paused |= loser.snapshot.paused;
                merged.revoked |= loser.snapshot.revoked;
                for owner in &loser.snapshot.managed_image_owners {
                    if !merged.managed_image_owners.contains(owner) {
                        merged.managed_image_owners.push(owner.clone());
                    }
                }
                for item in &loser.snapshot.cleanup {
                    if !merged.cleanup.iter().any(|prior| prior.id == item.id) {
                        merged.cleanup.push(item.clone());
                    }
                }
                for (id, hash) in &loser.snapshot.absorbed_snapshots {
                    if merged
                        .absorbed_snapshots
                        .get(id)
                        .is_some_and(|prior| prior != hash)
                    {
                        return Err("共有状態の保全証拠が一致しません".into());
                    }
                    merged.absorbed_snapshots.insert(id.clone(), hash.clone());
                }
                merged.absorbed_snapshots.insert(loser.id.clone(), captured);
                merged.validate(account)?;
                gdrive::write_web_share_cas(
                    client,
                    token,
                    &canonical.id,
                    &canonical.etag,
                    &serde_json::to_value(&merged).unwrap(),
                )
                .await?;
                canonical = Self::reload(client, token, folder, &canonical.id, account).await?;
                if !same_snapshot(&canonical.snapshot, &merged) {
                    return Err("統合後に共有設定が変わりました。整理を次回へ延期します".into());
                }
                gdrive::delete_web_share_cas(client, token, &loser.id, &loser.etag).await?;
            }
            store.notes.insert(key, canonical);
        }
        let mut keys = legacy
            .keys()
            .chain(store.notes.keys())
            .cloned()
            .collect::<Vec<_>>();
        keys.sort();
        keys.dedup();
        for key in keys {
            let records = legacy.remove(&key).unwrap_or_default();
            if store.blocked.contains(&key) {
                continue;
            }
            let setting_files = settings
                .iter()
                .filter(|r| r.2["scope"]["noteId"].as_str() == Some(&key))
                .cloned()
                .collect::<Vec<_>>();
            if let Some(mut saved) = store.notes.remove(&key) {
                let included: HashSet<_> = saved
                    .snapshot
                    .cleanup
                    .iter()
                    .map(|item| item.id.clone())
                    .collect();
                let mut changed = false;
                for (id, name, value) in records
                    .iter()
                    .chain(setting_files.iter())
                    .filter(|r| !included.contains(&r.0))
                {
                    // A concurrent migration may already have removed this
                    // ancestor. Never resurrect a stale in-memory record.
                    if gdrive::web_share_file_exists(client, token, id).await? == false {
                        continue;
                    }
                    let (actual, _) = gdrive::read_web_share_cas(client, token, id, folder).await?;
                    if actual != *value {
                        return Err("旧記録が同期中に変更されました。再同期して確認します".into());
                    }
                    if value["scope"]
                        != serde_json::to_value(&saved.snapshot.operation.scope).unwrap()
                    {
                        return Err("別の共有世代の変更があります。記録を保持しました".into());
                    }
                    if value.get("action").is_some() {
                        crate::web_sharing_state::parse(value.clone(), name)?;
                        // Delayed stop wins. An old resume never clears a newer stop.
                        if value["action"] == "pause" {
                            saved.snapshot.paused = true;
                        }
                    } else {
                        let operation: ShareOperation = serde_json::from_value(value.clone())
                            .map_err(|_| "旧共有変更を読み取れません")?;
                        if contract::calculate_payload_hash(&operation)
                            .map_err(|_| "旧共有変更が不正です")?
                            != operation.payload_hash
                        {
                            return Err("旧共有変更の検証に失敗しました".into());
                        }
                        if operation.kind == OperationKind::Revoke {
                            saved.snapshot.revoked = true;
                        } else if matches!(
                            operation.kind,
                            OperationKind::Edit | OperationKind::Resolve
                        ) {
                            let operation = normalized(operation)?;
                            let same = std::iter::once(&saved.snapshot.operation)
                                .chain(saved.snapshot.conflicts.iter())
                                .find(|o| o.operation_id == operation.operation_id);
                            if let Some(previous) = same {
                                if previous != &operation {
                                    return Err(
                                        "同じ変更IDの異なる内容があります。両方を保持しました"
                                            .into(),
                                    );
                                }
                            } else {
                                saved.snapshot.conflicts.push(operation);
                                saved.snapshot.paused = true;
                            }
                        }
                    }
                    saved.snapshot.cleanup.push(Cleanup {
                        id: id.clone(),
                        digest: digest(value),
                    });
                    changed = true;
                }
                if changed {
                    capture_images(client, token, folder, &mut saved.snapshot).await?;
                    saved.snapshot.validate(account)?;
                    gdrive::write_web_share_cas(
                        client,
                        token,
                        &saved.id,
                        &saved.etag,
                        &serde_json::to_value(&saved.snapshot).unwrap(),
                    )
                    .await?;
                    saved = Self::reload(client, token, folder, &saved.id, account).await?;
                }
                store.notes.insert(key, saved);
                continue;
            }
            let operations = records
                .iter()
                .map(|r| {
                    serde_json::from_value::<ShareOperation>(r.2.clone()).map_err(|e| e.to_string())
                })
                .collect::<Result<Vec<_>, _>>()?;
            let scope = operations
                .first()
                .ok_or("共有記録がありません")?
                .scope
                .clone();
            let log = contract::validate_log(&scope, &operations)
                .map_err(|e| format!("共有履歴が不正です: {e:?}"))?;
            let setting_records = setting_files
                .iter()
                .map(|r| crate::web_sharing_state::parse(r.2.clone(), &r.1))
                .collect::<Result<Vec<_>, _>>()?;
            let paused =
                crate::web_sharing_state::paused_ids(&setting_records, account)?.contains(&key);
            if paused {
                store.paused.insert(key.clone());
            }
            let roots = records
                .iter()
                .filter(|r| {
                    operations
                        .iter()
                        .find(|o| o.operation_id == r.2["operationId"].as_str().unwrap_or(""))
                        .is_some_and(|o| o.parents == vec![root(o)])
                })
                .collect::<Vec<_>>();
            if log.content_heads.len() != 1 || roots.len() != 1 {
                store.blocked.insert(key);
                store.operations.extend(operations);
                continue; // Keep unresolved history intact.
            }
            let current = operations
                .iter()
                .find(|o| o.operation_id == log.content_heads[0])
                .unwrap();
            let anchor = roots[0];
            let mut snapshot = Snapshot {
                schema_version: 2,
                operation: normalized(current.clone())?,
                paused,
                revoked: operations.iter().any(|o| o.kind == OperationKind::Revoke),
                sharing_id: uuid::Uuid::new_v4().to_string(),
                images: BTreeMap::new(),
                published: true,
                pending: None,
                mutation_id: String::new(),
                gc_nonce: String::new(),
                managed_image_owners: vec![anchor.0.clone()],
                superseded_by: None,
                absorbed_snapshots: BTreeMap::new(),
                conflicts: vec![],
                cleanup: vec![],
            };
            for (id, _, value) in records
                .iter()
                .chain(setting_files.iter())
                .filter(|r| r.0 != anchor.0)
            {
                snapshot.cleanup.push(Cleanup {
                    id: id.clone(),
                    digest: digest(value),
                });
            }
            capture_images(client, token, folder, &mut snapshot).await?;
            snapshot.validate(account)?;
            let (actual, etag) =
                gdrive::read_web_share_cas(client, token, &anchor.0, folder).await?;
            if actual != anchor.2 {
                return Err("移行中に共有内容が変わりました。元の記録を保持しました".into());
            }
            gdrive::write_web_share_cas(
                client,
                token,
                &anchor.0,
                &etag,
                &serde_json::to_value(&snapshot).unwrap(),
            )
            .await?;
            // Naming is an optimization hint only; readers still validate the
            // complete document. A failed rename never authorizes deletion.
            let _ = gdrive::name_web_share_snapshot(client, token, &anchor.0, &key).await;
            let saved = Self::reload(client, token, folder, &anchor.0, account).await?;
            store.notes.insert(key, saved);
        }
        // Publish and read back first. Cleanup never includes new/unseen files.
        let managed_files =
            gdrive::list_web_share_named_files(client, token, folder, "web-image-", false).await?;
        for saved in store.notes.values_mut() {
            // Expiry needs a successful cancellation CAS before deletion.
            if saved
                .snapshot
                .pending
                .as_ref()
                .is_some_and(|p| p.expires_at < chrono::Utc::now().timestamp())
            {
                let mut cancelled = saved.snapshot.clone();
                cancelled.pending = None;
                gdrive::write_web_share_cas(
                    client,
                    token,
                    &saved.id,
                    &saved.etag,
                    &serde_json::to_value(&cancelled).unwrap(),
                )
                .await?;
                *saved = Self::reload(client, token, folder, &saved.id, account).await?;
            }
            if saved.snapshot.revoked
                && saved.snapshot.pending.is_none()
                && saved.snapshot.conflicts.is_empty()
                && (!saved.snapshot.images.is_empty()
                    || !saved.snapshot.operation.payload.markdown.is_empty())
            {
                let mut tombstone = saved.snapshot.clone();
                tombstone.operation.payload.images.clear();
                tombstone.operation.payload.markdown.clear();
                tombstone.operation.payload.title.clear();
                tombstone.operation = normalized(tombstone.operation)?;
                tombstone.images.clear();
                gdrive::write_web_share_cas(
                    client,
                    token,
                    &saved.id,
                    &saved.etag,
                    &serde_json::to_value(&tombstone).unwrap(),
                )
                .await?;
                *saved = Self::reload(client, token, folder, &saved.id, account).await?;
            }
            if saved.snapshot.superseded_by.is_some() {
                return Err("共有状態の自動整理中です。次の同期で再確認します".into());
            }
            let mut candidates = Vec::new();
            for owner in &saved.snapshot.managed_image_owners {
                let namespace = format!("{}-{owner}", saved.snapshot.operation.scope.note_id);
                candidates.extend(preview::orphan_candidates(
                    &namespace,
                    &managed_files,
                    &saved.snapshot.images,
                    saved.snapshot.pending.as_ref(),
                ));
            }
            if !candidates.is_empty() {
                let mut gated = saved.snapshot.clone();
                gated.gc_nonce = uuid::Uuid::new_v4().to_string();
                // A racing writer makes this CAS fail: zero image deletions.
                gdrive::write_web_share_cas(
                    client,
                    token,
                    &saved.id,
                    &saved.etag,
                    &serde_json::to_value(&gated).unwrap(),
                )
                .await?;
                *saved = Self::reload(client, token, folder, &saved.id, account).await?;
                for (id, name) in candidates {
                    if let Some(owner) = saved.snapshot.managed_image_owners.iter().find(|owner| {
                        preview::owned_preview_name(
                            &format!("{}-{owner}", saved.snapshot.operation.scope.note_id),
                            &name,
                        )
                    }) {
                        let _ = gdrive::delete_web_preview(
                            client,
                            token,
                            folder,
                            &id,
                            &format!("{}-{owner}", saved.snapshot.operation.scope.note_id),
                        )
                        .await;
                    }
                }
            }
            let mut remaining = Vec::new();
            for item in &saved.snapshot.cleanup {
                if item.id == saved.id {
                    return Err("共有状態自身は削除しません".into());
                }
                if !available.contains(&item.id) {
                    continue;
                }
                let result = gdrive::read_web_share_cas(client, token, &item.id, folder).await;
                if let Ok((value, etag)) = result {
                    let scope_matches = value["scope"]
                        == serde_json::to_value(&saved.snapshot.operation.scope).unwrap();
                    if scope_matches
                        && digest(&value) == item.digest
                        && gdrive::delete_web_share_cas(client, token, &item.id, &etag)
                            .await
                            .is_ok()
                    {
                        continue;
                    }
                }
                remaining.push(item.clone());
            }
            if remaining.len() != saved.snapshot.cleanup.len() {
                let mut updated = saved.snapshot.clone();
                updated.cleanup = remaining;
                if gdrive::write_web_share_cas(
                    client,
                    token,
                    &saved.id,
                    &saved.etag,
                    &serde_json::to_value(&updated).unwrap(),
                )
                .await
                .is_ok()
                {
                    *saved = Self::reload(client, token, folder, &saved.id, account).await?;
                }
            }
            store.total_bytes += serde_json::to_vec(&saved.snapshot).unwrap().len();
            if saved.snapshot.paused {
                store
                    .paused
                    .insert(saved.snapshot.operation.scope.note_id.clone());
            }
            if !saved.snapshot.published {
                continue;
            }
            store.operations.push(saved.snapshot.operation.clone());
            store.operations.extend(saved.snapshot.conflicts.clone());
            if saved.snapshot.revoked {
                let mut revoked = saved.snapshot.operation.clone();
                revoked.kind = OperationKind::Revoke;
                revoked.parents.clear();
                revoked.operation_id = format!("snapshot-revoke-{}", revoked.scope.note_id);
                revoked.payload_hash = contract::calculate_payload_hash(&revoked)
                    .map_err(|e| format!("解除状態の検証失敗: {e:?}"))?;
                store.operations.push(revoked);
            }
        }
        Ok(store)
    }
    async fn reload(
        client: &reqwest::Client,
        token: &str,
        folder: &str,
        id: &str,
        account: &str,
    ) -> Result<Stored, String> {
        let (value, etag) = gdrive::read_web_share_cas(client, token, id, folder).await?;
        let snapshot: Snapshot =
            serde_json::from_value(value).map_err(|_| "共有状態の再確認に失敗しました")?;
        snapshot.validate(account)?;
        if !snapshot
            .managed_image_owners
            .iter()
            .any(|owner| owner == id)
            || snapshot
                .superseded_by
                .as_ref()
                .is_some_and(|target| target.as_str() >= id)
        {
            return Err("共有状態の管理元または調停方向が不正です".into());
        }
        Ok(Stored {
            id: id.into(),
            etag,
            snapshot,
        })
    }
    pub async fn save(
        &mut self,
        client: &reqwest::Client,
        token: &str,
        folder: &str,
        operation: &ShareOperation,
        images: BTreeMap<String, Vec<u8>>,
        new_id: Option<&str>,
    ) -> Result<(), String> {
        let key = &operation.scope.note_id;
        if self.blocked.contains(key) {
            return Err("未確認の旧共有履歴は上書きしません".into());
        }
        let previous = self.notes.get(key).cloned();
        let mut snapshot = if let Some(saved) = &previous {
            if saved.snapshot.superseded_by.is_some()
                || !saved.snapshot.conflicts.is_empty()
                || (operation.kind != OperationKind::Revoke
                    && (saved.snapshot.paused || saved.snapshot.revoked))
            {
                return Err("停止中または競合中の共有内容は上書きしません".into());
            }
            saved.snapshot.clone()
        } else {
            let mut placeholder = operation.clone();
            placeholder.payload.images.clear();
            placeholder.payload.markdown.clear();
            Snapshot {
                schema_version: 2,
                operation: normalized(placeholder)?,
                paused: false,
                revoked: false,
                sharing_id: uuid::Uuid::new_v4().to_string(),
                images: BTreeMap::new(),
                published: false,
                pending: None,
                mutation_id: String::new(),
                gc_nonce: String::new(),
                managed_image_owners: vec![new_id.ok_or("新規共有IDがありません")?.into()],
                superseded_by: None,
                absorbed_snapshots: BTreeMap::new(),
                conflicts: vec![],
                cleanup: vec![],
            }
        };
        if snapshot.pending.is_some() {
            return Err("画像の同期が進行中です。元の内容を保持して次の同期で再確認します".into());
        }
        let id = previous
            .as_ref()
            .map(|s| s.id.as_str())
            .or(new_id)
            .ok_or("共有状態の保存IDがありません")?
            .to_owned();
        if previous.is_none() {
            let value = serde_json::to_value(&snapshot).unwrap();
            let result = gdrive::create_web_share_file_at_id(
                client,
                token,
                folder,
                &id,
                &format!("op-state-{key}.json"),
                serde_json::to_vec(&value).unwrap(),
                "application/json",
            )
            .await?;
            let saved =
                Self::reload(client, token, folder, &id, &operation.scope.account_subject).await?;
            if result == gdrive::CreateAtId::AlreadyExists
                || serde_json::to_value(&saved.snapshot).unwrap() != value
            {
                return Err("前回の保存結果があります。次の同期で読み直して確認します".into());
            }
            self.notes.insert(key.clone(), saved);
        }
        let mut saved = self.notes.get(key).ok_or("共有状態がありません")?.clone();
        let mut uploads = Vec::new();
        let mut next_images = BTreeMap::new();
        if operation.kind != OperationKind::Revoke {
            for manifest in &operation.payload.images {
                if let Some(asset) = snapshot.images.get(&manifest.sha256).filter(|a| !a.legacy) {
                    next_images.insert(manifest.sha256.clone(), asset.clone());
                    continue;
                }
                let bytes = images
                    .get(&manifest.sha256)
                    .ok_or("Web用画像を作る原本がありません")?
                    .clone();
                if bytes.len() != manifest.size_bytes as usize
                    || format!("{:x}", Sha256::digest(&bytes)) != manifest.sha256
                {
                    return Err("画像原本が同期中に変わりました".into());
                }
                let encoded = tokio::task::spawn_blocking(move || preview::encode_preview(&bytes))
                    .await
                    .map_err(|_| "画像の縮小処理が中断されました")??;
                let file_id = gdrive::generate_web_share_id(client, token).await?;
                let name = format!("web-image-{key}-{id}-{}.jpg", uuid::Uuid::new_v4());
                let asset = PreviewAsset {
                    file_id: file_id.clone(),
                    source_sha256: manifest.sha256.clone(),
                    sha256: encoded.sha256,
                    mime_type: "image/jpeg".into(),
                    size_bytes: encoded.bytes.len() as u32,
                    width: encoded.width,
                    height: encoded.height,
                    legacy: false,
                };
                next_images.insert(manifest.sha256.clone(), asset.clone());
                uploads.push((manifest.sha256.clone(), asset, name, encoded.bytes));
            }
        }
        let mutation = uuid::Uuid::new_v4().to_string();
        if !uploads.is_empty() {
            let bytes = uploads
                .iter()
                .map(|(_, a, _, _)| a.size_bytes as u64)
                .sum::<u64>();
            let current = self
                .notes
                .values()
                .flat_map(|s| {
                    s.snapshot
                        .images
                        .values()
                        .chain(s.snapshot.pending.iter().flat_map(|p| p.assets.values()))
                })
                .filter(|a| !a.legacy)
                .map(|a| (&a.file_id, a.size_bytes as u64))
                .collect::<HashMap<_, _>>();
            let existing = current.values().sum::<u64>();
            let others = self
                .notes
                .iter()
                .filter(|(note, _)| *note != key)
                .flat_map(|(_, s)| {
                    s.snapshot
                        .images
                        .values()
                        .chain(s.snapshot.pending.iter().flat_map(|p| p.assets.values()))
                })
                .filter(|a| !a.legacy)
                .map(|a| (a.file_id.clone(), a.size_bytes as u64));
            let retained = others
                .chain(
                    next_images
                        .values()
                        .filter(|a| !a.legacy)
                        .map(|a| (a.file_id.clone(), a.size_bytes as u64)),
                )
                .collect::<HashMap<_, _>>();
            let after = retained.values().sum::<u64>();
            if after > preview::PREVIEW_BUDGET_BYTES && after > existing {
                return Err("Web用画像の容量上限です。既存の付箋と原本は保持しています".into());
            }
            if gdrive::drive_available_bytes(client, token)
                .await?
                .is_some_and(|free| free < bytes + MAX_SNAPSHOT_BYTES as u64)
            {
                return Err(
                    "Driveの空き容量が不足しています。原本を保持して画像送信を見合わせます".into(),
                );
            }
            snapshot.pending = Some(ImageReservation {
                mutation_id: mutation.clone(),
                owner_pc: "windows".into(),
                expires_at: chrono::Utc::now().timestamp() + 600,
                assets: uploads
                    .iter()
                    .map(|(hash, a, _, _)| (hash.clone(), a.clone()))
                    .collect(),
            });
            snapshot.validate(&operation.scope.account_subject)?;
            gdrive::write_web_share_cas(
                client,
                token,
                &id,
                &saved.etag,
                &serde_json::to_value(&snapshot).unwrap(),
            )
            .await?;
            saved =
                Self::reload(client, token, folder, &id, &operation.scope.account_subject).await?;
            if !same_snapshot(&saved.snapshot, &snapshot) {
                return Err(
                    "画像予約後に本文または共有設定が変わりました。送信を止めました".into(),
                );
            }
            for (_, asset, name, bytes) in uploads {
                let status = gdrive::create_web_share_file_at_id(
                    client,
                    token,
                    folder,
                    &asset.file_id,
                    &name,
                    bytes,
                    "image/jpeg",
                )
                .await?;
                if status != gdrive::CreateAtId::Created {
                    return Err("同じ画像IDの保存結果を確認できないため確定しません".into());
                }
            }
        }
        if operation.kind == OperationKind::Revoke {
            snapshot.revoked = true;
        } else {
            snapshot.operation = normalized(operation.clone())?;
            snapshot.images = next_images;
            snapshot.published = true;
        }
        snapshot.pending = None;
        snapshot.mutation_id = mutation;
        snapshot.validate(&operation.scope.account_subject)?;
        let size = serde_json::to_vec(&snapshot).unwrap().len();
        let old_size = previous
            .as_ref()
            .map(|s| serde_json::to_vec(&s.snapshot).unwrap().len())
            .unwrap_or(0);
        if self.total_bytes.saturating_sub(old_size) + size > MAX_ACCOUNT_BYTES && size > old_size {
            return Err("共有全体の容量上限です。原本と既存の共有は保持しています".into());
        }
        let value = serde_json::to_value(&snapshot).unwrap();
        // Commit against the reservation's exact revision; never rebase a stale body.
        gdrive::write_web_share_cas(client, token, &id, &saved.etag, &value).await?;
        let saved =
            Self::reload(client, token, folder, &id, &operation.scope.account_subject).await?;
        if serde_json::to_value(&saved.snapshot).unwrap() != value {
            return Err("保存後に別の変更がありました。原本を保持して再同期してください".into());
        }
        self.total_bytes = self.total_bytes.saturating_sub(old_size) + size;
        self.notes.insert(key.clone(), saved);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn operation(note: &str, bytes: &[u8]) -> ShareOperation {
        let hash = format!("{:x}", Sha256::digest(bytes));
        let value = serde_json::json!({"scope":{"accountSubject":"snapshot-test@example.test","noteId":note,"generation":1},"operationId":uuid::Uuid::new_v4().to_string(),"kind":"edit","parents":[],"resolvedIds":[],"payloadHash":"","payload":{"title":"検証用","markdown":format!("![写真](ore-fusen-image://img-{hash})"),"images":[{"imageId":format!("img-{hash}"),"sha256":hash,"mimeType":"image/png","sizeBytes":bytes.len()}]}});
        normalized(serde_json::from_value(value).unwrap()).unwrap()
    }
    fn png(color: u8) -> Vec<u8> {
        let mut cursor = std::io::Cursor::new(Vec::new());
        image::DynamicImage::ImageRgb8(image::RgbImage::from_pixel(
            32,
            16,
            image::Rgb([color, 50, 100]),
        ))
        .write_to(&mut cursor, image::ImageFormat::Png)
        .unwrap();
        cursor.into_inner()
    }
    #[test]
    fn reservation_readback_must_match_all_control_and_content_fields() {
        let bytes = png(1);
        let op = operation("note", &bytes);
        let hash = op.payload.images[0].sha256.clone();
        let asset = PreviewAsset {
            file_id: "file".into(),
            source_sha256: hash.clone(),
            sha256: hash.clone(),
            mime_type: "image/png".into(),
            size_bytes: bytes.len() as u32,
            width: 32,
            height: 16,
            legacy: true,
        };
        let original = Snapshot {
            schema_version: 2,
            operation: op,
            paused: false,
            revoked: false,
            sharing_id: "sharing".into(),
            images: BTreeMap::from([(hash, asset)]),
            published: true,
            pending: None,
            mutation_id: "mutation".into(),
            gc_nonce: String::new(),
            managed_image_owners: vec!["owner".into()],
            superseded_by: None,
            absorbed_snapshots: BTreeMap::new(),
            conflicts: vec![],
            cleanup: vec![],
        };
        assert!(same_snapshot(&original, &original.clone()));
        for kind in 0..4 {
            let mut changed = original.clone();
            match kind {
                0 => changed.paused = true,
                1 => changed.revoked = true,
                2 => changed.operation.payload.title = "別端末の編集".into(),
                _ => changed.sharing_id = "new sharing".into(),
            };
            assert!(!same_snapshot(&original, &changed));
        }
    }
    #[test]
    #[ignore = "requires explicitly authorized temporary Google Drive fixtures"]
    fn live_drive_snapshot_reuses_images_and_collects_only_obsolete_previews() {
        tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap().block_on(async {
        let token=std::env::var("ONF_TEST_DRIVE_TOKEN").expect("temporary test token required");
        let parent=std::env::var("ONF_TEST_DRIVE_PARENT").expect("fixture parent required");
        let client=reqwest::Client::new();
        let response:Value=client.post("https://www.googleapis.com/drive/v3/files").bearer_auth(&token).json(&serde_json::json!({"name":format!("onf-storage-fixture-{}",uuid::Uuid::new_v4()),"mimeType":"application/vnd.google-apps.folder","parents":[parent]})).send().await.unwrap().error_for_status().unwrap().json().await.unwrap();
        let folder=response["id"].as_str().unwrap().to_owned();
        let (fixture_client,fixture_token,fixture_folder)=(client.clone(),token.clone(),folder.clone());
        let result=tokio::spawn(async move {
          let (client,token,folder)=(fixture_client,fixture_token,fixture_folder);
          let result:Result<(),String>=async {
            let note=uuid::Uuid::new_v4().to_string();let first=png(1);let op=operation(&note,&first);let account=&op.scope.account_subject;
            let id=gdrive::generate_web_share_id(&client,&token).await?;
            let mut store=Store::default();
            store.save(&client,&token,&folder,&op,BTreeMap::from([(op.payload.images[0].sha256.clone(),first.clone())]),Some(&id)).await?;
            let initial=store.notes[&note].snapshot.clone();assert!(initial.published);assert!(!initial.images.values().next().unwrap().legacy);
            let image_id=initial.images.values().next().unwrap().file_id.clone();
            let mut text_edit=op.clone();text_edit.operation_id=uuid::Uuid::new_v4().to_string();text_edit.payload.title="本文だけ更新".into();text_edit=normalized(text_edit)?;
            store.save(&client,&token,&folder,&text_edit,BTreeMap::new(),None).await?;
            assert_eq!(store.notes[&note].snapshot.images.values().next().unwrap().file_id,image_id);
            let images=gdrive::list_web_share_named_files(&client,&token,&folder,"web-image-",false).await?;assert_eq!(images.len(),1);
            let second=png(2);let next=operation(&note,&second);
            store.save(&client,&token,&folder,&next,BTreeMap::from([(next.payload.images[0].sha256.clone(),second)]),None).await?;
            assert_eq!(gdrive::list_web_share_named_files(&client,&token,&folder,"web-image-",false).await?.len(),2);
            let files=gdrive::list_web_share_records(&client,&token,&folder).await?;
            let mut store=Store::load(&client,&token,&folder,account,files,vec![]).await?;
            assert_eq!(store.notes[&note].snapshot.operation,next);
            let images=gdrive::list_web_share_named_files(&client,&token,&folder,"web-image-",false).await?;assert_eq!(images.len(),1);assert_ne!(images[0].0,image_id);
            println!("Drive fixture: initial image=1; text edit image=1; replacement before cleanup=2; after cleanup=1; original bytes preserved");
            // Two PCs can independently create the initial physical anchor.
            // Reconcile identical content automatically and retain one image.
            let duplicate_id=gdrive::generate_web_share_id(&client,&token).await?;
            let second=png(2);let mut other_pc=Store::default();
            other_pc.save(&client,&token,&folder,&next,BTreeMap::from([(next.payload.images[0].sha256.clone(),second)]),Some(&duplicate_id)).await?;
            let files=gdrive::list_web_share_records(&client,&token,&folder).await?;assert_eq!(files.len(),2);
            store=Store::load(&client,&token,&folder,account,files,vec![]).await?;
            assert_eq!(gdrive::list_web_share_records(&client,&token,&folder).await?.len(),1);
            assert_eq!(gdrive::list_web_share_named_files(&client,&token,&folder,"web-image-",false).await?.len(),1);
            assert!(!store.notes[&note].snapshot.paused);assert_eq!(store.notes[&note].snapshot.managed_image_owners.len(),2);
            println!("Two-PC identical initial creation: two physical anchors reconciled to one; current photo retained");
            // A pause after reservation must invalidate the original commit.
            let original=store.notes[&note].clone();let mut reserved=original.snapshot.clone();
            let late_id=gdrive::generate_web_share_id(&client,&token).await?;
            let encoded=preview::encode_preview(&png(3))?;let late_source=format!("{:x}",Sha256::digest(png(3)));
            let asset=PreviewAsset{file_id:late_id.clone(),source_sha256:late_source.clone(),sha256:encoded.sha256,mime_type:"image/jpeg".into(),size_bytes:encoded.bytes.len() as u32,width:encoded.width,height:encoded.height,legacy:false};
            reserved.pending=Some(ImageReservation{mutation_id:uuid::Uuid::new_v4().to_string(),owner_pc:"fixture".into(),expires_at:0,assets:BTreeMap::from([(late_source,asset)])});
            gdrive::write_web_share_cas(&client,&token,&original.id,&original.etag,&serde_json::to_value(&reserved).unwrap()).await?;
            let reservation=Store::reload(&client,&token,&folder,&original.id,account).await?;
            let mut paused=reservation.snapshot.clone();paused.paused=true;
            gdrive::write_web_share_cas(&client,&token,&reservation.id,&reservation.etag,&serde_json::to_value(&paused).unwrap()).await?;
            assert!(gdrive::write_web_share_cas(&client,&token,&reservation.id,&reservation.etag,&serde_json::to_value(&reserved).unwrap()).await.is_err());
            let files=gdrive::list_web_share_records(&client,&token,&folder).await?;
            store=Store::load(&client,&token,&folder,account,files,vec![]).await?;
            assert!(store.notes[&note].snapshot.paused);assert!(store.notes[&note].snapshot.pending.is_none());
            // Simulate a request completing after its reservation was cancelled.
            let name=format!("web-image-{note}-{}-{}.jpg",original.id,uuid::Uuid::new_v4());
            gdrive::create_web_share_file_at_id(&client,&token,&folder,&late_id,&name,encoded.bytes,"image/jpeg").await?;
            let files=gdrive::list_web_share_records(&client,&token,&folder).await?;
            store=Store::load(&client,&token,&folder,account,files,vec![]).await?;
            assert!(store.notes[&note].snapshot.paused);
            assert_eq!(gdrive::list_web_share_named_files(&client,&token,&folder,"web-image-",false).await?.len(),1);
            println!("Interrupted upload: pause preserved; stale commit rejected; expired reservation cancelled by CAS; late orphan removed on next sync");
            // C was captured by B but its deletion response was lost. B then
            // received an edit, and a smaller initial anchor A appeared.
            let three_note=uuid::Uuid::new_v4().to_string();let original_bytes=png(4);let initial_op=operation(&three_note,&original_bytes);
            let mut ids=Vec::new();for _ in 0..3 {ids.push(gdrive::generate_web_share_id(&client,&token).await?);}ids.sort();
            let (a,b,c)=(&ids[0],&ids[1],&ids[2]);
            let mut b_pc=Store::default();let mut c_pc=Store::default();
            let original_images=BTreeMap::from([(initial_op.payload.images[0].sha256.clone(),original_bytes.clone())]);
            b_pc.save(&client,&token,&folder,&initial_op,original_images.clone(),Some(b)).await?;
            c_pc.save(&client,&token,&folder,&initial_op,original_images.clone(),Some(c)).await?;
            let c_saved=c_pc.notes[&three_note].clone();let mut c_frozen=c_saved.snapshot.clone();c_frozen.superseded_by=Some(b.clone());
            gdrive::write_web_share_cas(&client,&token,c,&c_saved.etag,&serde_json::to_value(&c_frozen).unwrap()).await?;
            let b_saved=b_pc.notes[&three_note].clone();let mut b_captured=b_saved.snapshot.clone();
            b_captured.absorbed_snapshots.insert(c.clone(),frozen_digest(&c_frozen));b_captured.managed_image_owners.push(c.clone());
            gdrive::write_web_share_cas(&client,&token,b,&b_saved.etag,&serde_json::to_value(&b_captured).unwrap()).await?;
            b_pc.notes.insert(three_note.clone(),Store::reload(&client,&token,&folder,b,account).await?);
            let mut edited=initial_op.clone();edited.operation_id=uuid::Uuid::new_v4().to_string();edited.payload.title="保全後の新しい本文".into();edited=normalized(edited)?;
            b_pc.save(&client,&token,&folder,&edited,BTreeMap::new(),None).await?;
            let mut a_pc=Store::default();a_pc.save(&client,&token,&folder,&edited,original_images,Some(a)).await?;
            let files=gdrive::list_web_share_records(&client,&token,&folder).await?;
            store=Store::load(&client,&token,&folder,account,files,vec![]).await?;
            let recovered=&store.notes[&three_note];assert_eq!(&recovered.id,a);assert!(!recovered.snapshot.paused);assert!(recovered.snapshot.conflicts.is_empty());assert_eq!(recovered.snapshot.operation.payload.title,"保全後の新しい本文");
            assert!(!gdrive::web_share_file_exists(&client,&token,b).await?);assert!(!gdrive::web_share_file_exists(&client,&token,c).await?);
            // An interrupted placeholder with the same operation ID is not an
            // alternative published body and must not block forever.
            let placeholder_id=gdrive::generate_web_share_id(&client,&token).await?;
            let mut placeholder=recovered.snapshot.clone();placeholder.published=false;placeholder.operation.payload.images.clear();placeholder.operation.payload.markdown.clear();placeholder.operation=normalized(placeholder.operation)?;placeholder.images.clear();placeholder.managed_image_owners=vec![placeholder_id.clone()];placeholder.absorbed_snapshots.clear();
            gdrive::create_web_share_file_at_id(&client,&token,&folder,&placeholder_id,&format!("op-state-{three_note}.json"),serde_json::to_vec(&placeholder).unwrap(),"application/json").await?;
            let files=gdrive::list_web_share_records(&client,&token,&folder).await?;
            store=Store::load(&client,&token,&folder,account,files,vec![]).await?;
            assert!(!store.blocked.contains(&three_note));assert!(!store.notes[&three_note].snapshot.paused);assert!(store.notes[&three_note].snapshot.conflicts.is_empty());assert_eq!(store.notes[&three_note].snapshot.operation,edited);
            println!("Three-PC interrupted reconciliation recovered; absorbed old content did not resurrect; unpublished placeholder reconciled without false conflict");
            Ok(())
          }.await;result
        }).await;
        let cleanup=client.delete(format!("https://www.googleapis.com/drive/v3/files/{folder}")).bearer_auth(&token).send().await.unwrap();
        assert!(cleanup.status().is_success(),"fixture folder cleanup failed");
        println!("Dedicated Drive fixture folder removed");
        result.expect("fixture task failed; dedicated folder was removed").unwrap();
        });
    }
}
