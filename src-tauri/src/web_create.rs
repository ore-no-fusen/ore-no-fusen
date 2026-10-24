//! Text-only Web requests live outside the immutable shared-note operation log.
use crate::{gdrive, logic, storage};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, fs, path::Path};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    pub schema_version: u32,
    pub account_subject: String,
    pub target_pc_id: String,
    pub note_id: String,
    pub markdown: String,
}
#[derive(Serialize, Deserialize)]
struct Receipt {
    hash: String,
    path: String,
    base: String,
    complete: bool,
}

fn validate(request: &Request, account: &str) -> Result<(), String> {
    if request.schema_version != 1
        || request.account_subject != account
        || uuid::Uuid::parse_str(&request.note_id).is_err()
        || uuid::Uuid::parse_str(&request.target_pc_id).is_err()
        || request.markdown.trim().is_empty()
        || request.markdown.len() > 100_000
        || request.markdown.contains("ore-fusen-image:")
        || request.markdown.contains("![")
    {
        return Err("Web新規作成要求が不正です（文字のみ・100KB以内）".into());
    }
    Ok(())
}

fn import_once(base: &Path, ledger_path: &Path, request: &Request) -> Result<bool, String> {
    let mut ledger: BTreeMap<String, Receipt> = if ledger_path.exists() {
        serde_json::from_slice(&fs::read(ledger_path).map_err(|e| e.to_string())?)
            .map_err(|e| format!("作成台帳を読めません: {e}"))?
    } else {
        BTreeMap::new()
    };
    let key = format!("{}:{}", request.account_subject, request.note_id);
    let hash = format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(request).map_err(|e| e.to_string())?)
    );
    let mut first_attempt = false;
    if let Some(entry) = ledger.get(&key) {
        if entry.hash != hash {
            return Err("同じ作成IDの内容が異なるため保留しました".into());
        }
        if entry.complete {
            // A moved/deleted original must never be resurrected from the inbox.
            return Ok(false);
        }
        if entry.base != base.to_string_lossy() {
            return Err("取込途中に保存場所が変わりました。再作成せず保留しました".into());
        }
    } else {
        let seq = storage::get_next_seq(&base.to_string_lossy());
        let title = request
            .markdown
            .lines()
            .find(|line| !line.trim().is_empty())
            .unwrap_or("Web付箋")
            .trim()
            .chars()
            .take(50)
            .collect::<String>();
        let filename = logic::generate_filename(
            seq,
            &chrono::Local::now().format("%Y-%m-%d").to_string(),
            &title,
        );
        first_attempt = true;
        ledger.insert(
            key.clone(),
            Receipt {
                hash: hash.clone(),
                path: filename,
                base: base.to_string_lossy().to_string(),
                complete: false,
            },
        );
        storage::write_note(
            &ledger_path.to_string_lossy(),
            &serde_json::to_string(&ledger).map_err(|e| e.to_string())?,
        )?;
    }
    let entry = ledger.get_mut(&key).ok_or("作成台帳がありません")?;
    if Path::new(&entry.path).components().count() != 1 {
        return Err("作成台帳のパスが不正です".into());
    }
    let path = base.join(&entry.path);
    if path.exists() {
        let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        if logic::web_share_note_id(&text).as_deref() != Some(request.note_id.as_str()) {
            return Err("作成先に別の付箋があります".into());
        }
    } else {
        if !first_attempt {
            return Err(
                "取込途中の原本が見つかりません。重複を防ぐため再作成せず保留しました".into(),
            );
        }
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        let seq = entry
            .path
            .split('_')
            .next()
            .and_then(|s| s.parse::<i32>().ok())
            .ok_or("作成番号が不正です")?;
        let title = request
            .markdown
            .lines()
            .find(|line| !line.trim().is_empty())
            .unwrap_or("Web付箋")
            .trim()
            .chars()
            .take(50)
            .collect::<String>();
        let data = logic::build_create_note_data(&base.to_string_lossy(), &title, seq, &today);
        let with_id = logic::set_web_share_note_id(
            &format!("{}\n\n{}", data.frontmatter, request.markdown),
            &request.note_id,
        )?;
        let text = logic::update_frontmatter_value_for_web_share(&with_id, "tags", "[shortcut]");
        storage::write_note_if_absent(&path.to_string_lossy(), &text)?;
    }
    entry.complete = true;
    storage::write_note(
        &ledger_path.to_string_lossy(),
        &serde_json::to_string(&ledger).map_err(|e| e.to_string())?,
    )?;
    Ok(true)
}

fn register_imported_note(state: &mut crate::state::AppState, path: &str) -> Result<(), String> {
    let note = storage::read_note(path)?;
    if !state.notes.iter().any(|existing| existing.path == note.meta.path) {
        state.notes.push(note.meta);
    }
    Ok(())
}

pub async fn receive(
    base: &Path,
    account: &str,
    client: &reqwest::Client,
    token: &str,
    folder: &str,
    state: &std::sync::Mutex<crate::state::AppState>,
    capabilities: Vec<(String,String)>,
    files: Vec<(String,String)>,
) -> Result<Vec<String>, String> {
    let pc = gdrive::local_pc_id()?;
    let capability = serde_json::json!({"schemaVersion":1,"accountSubject":account,"pcId":pc,"name":std::env::var("COMPUTERNAME").unwrap_or_else(|_|"Windows".into())});
    let capability_name = format!("web-pc-{}.json", pc);
    if capabilities
        .iter()
        .all(|(_, name)| name != &capability_name)
    {
        gdrive::create_web_share_file(
            client,
            token,
            folder,
            &capability_name,
            serde_json::to_vec(&capability).map_err(|e| e.to_string())?,
            "application/json",
        )
        .await?;
    }
    let mut requests = BTreeMap::<String, Request>::new();
    for (_, name, value) in gdrive::read_web_share_records(client, token, files).await? {
        let request: Request =
            serde_json::from_value(value)
                .map_err(|e| e.to_string())?;
        validate(&request, account)?;
        if name != format!("web-request-{}.json", request.note_id) {
            return Err("作成要求名が一致しません".into());
        }
        if request.target_pc_id != pc {
            continue;
        }
        if let Some(old) = requests.insert(request.note_id.clone(), request.clone()) {
            if old != request {
                return Err("重複した作成IDの内容が異なります".into());
            }
        }
    }
    let ledger = gdrive::get_token_path().with_file_name("web_create_receipts.json");
    let mut imported = Vec::new();
    {
        // Serialize sequence allocation with the regular Windows new-note path.
        let mut app_state = state.lock().map_err(|_| "付箋状態をロックできません")?;
        for request in requests.values() {
            if import_once(base, &ledger, request)? {
                let receipts: BTreeMap<String, Receipt> = serde_json::from_slice(
                    &fs::read(&ledger).map_err(|e| e.to_string())?
                ).map_err(|e| e.to_string())?;
                let key = format!("{}:{}", request.account_subject, request.note_id);
                let receipt = receipts.get(&key).ok_or("作成済み付箋の記録がありません")?;
                let path = base.join(&receipt.path).to_string_lossy().to_string();
                register_imported_note(&mut app_state, &path)?;
                imported.push(path);
            }
        }
    }
    Ok(imported)
}

/// Clear only requests whose exact content has a completed local receipt and a
/// published snapshot. Failed cleanup is retried; the receipt prevents replay.
pub(crate) async fn cleanup_published(client:&reqwest::Client,token:&str,folder:&str,account:&str,store:&crate::web_share_snapshot::Store,files:&[(String,String)])->Result<(),String>{
    let ledger=gdrive::get_token_path().with_file_name("web_create_receipts.json");
    if !ledger.exists() {return Ok(());}
    let receipts:BTreeMap<String,Receipt>=serde_json::from_slice(&fs::read(ledger).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
    let pc=gdrive::local_pc_id()?;
    for (id,name) in files {
        let (value,etag)=gdrive::read_web_share_cas(client,token,&id,folder).await?;
        let request:Request=serde_json::from_value(value).map_err(|e|e.to_string())?;
        validate(&request,account)?;
        if *name!=format!("web-request-{}.json",request.note_id) || request.target_pc_id!=pc {continue;}
        let Some(saved)=store.notes.get(&request.note_id) else {continue;};
        // A successful read-back of the snapshot is required, not merely a
        // local attempt to publish it.
        let (current,_)=gdrive::read_web_share_cas(client,token,&saved.id,folder).await?;
        let snapshot:crate::web_share_snapshot::Snapshot=serde_json::from_value(current).map_err(|e|e.to_string())?;
        snapshot.validate(account)?;
        if snapshot.operation.scope.note_id!=request.note_id || !snapshot.published || snapshot.superseded_by.is_some() {continue;}
        let hash=format!("{:x}",Sha256::digest(serde_json::to_vec(&request).map_err(|e|e.to_string())?));
        if receipts.get(&format!("{}:{}",account,request.note_id)).is_some_and(|r|r.complete && r.hash==hash) {
            if gdrive::delete_web_share_cas(client,token,&id,&etag).await.is_err() {crate::logger::log_info("[Web同期] 作成済み要求の整理は次回再試行します");}
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn imported_note_is_available_to_visibility_filters_without_duplicates() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("received.md");
        fs::write(&path, "---\ntype: sticky\nseq: 1\ntags: [shortcut]\n---\n\nWeb本文").unwrap();
        let mut state = crate::state::AppState::default();
        state.notes.push(crate::state::NoteMeta { path: "existing.md".into(), ..Default::default() });
        register_imported_note(&mut state, &path.to_string_lossy()).unwrap();
        register_imported_note(&mut state, &path.to_string_lossy()).unwrap();
        assert_eq!(state.notes.len(), 2);
        assert_eq!(state.notes[0].path, "existing.md");
        assert!(state.notes[1].tags.iter().any(|tag| tag == "shortcut"));
        assert!(register_imported_note(&mut state, &dir.path().join("missing.md").to_string_lossy()).is_err());
        assert_eq!(state.notes.len(), 2);
    }
    #[test]
    fn incomplete_missing_original_is_held_instead_of_recreated() {
        let dir = tempfile::tempdir().unwrap();
        let base = dir.path().join("notes");
        fs::create_dir(&base).unwrap();
        let ledger = dir.path().join("ledger.json");
        let req = Request {
            schema_version: 1,
            account_subject: "a@test".into(),
            target_pc_id: uuid::Uuid::new_v4().to_string(),
            note_id: uuid::Uuid::new_v4().to_string(),
            markdown: "試験".into(),
        };
        let key = format!("{}:{}", req.account_subject, req.note_id);
        let entry = Receipt {
            hash: format!("{:x}", Sha256::digest(serde_json::to_vec(&req).unwrap())),
            path: "0001_2026-10-19_Web.md".into(),
            base: base.to_string_lossy().into(),
            complete: false,
        };
        let mut entries = BTreeMap::new();
        entries.insert(key, entry);
        fs::write(&ledger, serde_json::to_vec(&entries).unwrap()).unwrap();
        assert!(import_once(&base, &ledger, &req).is_err());
        assert_eq!(fs::read_dir(&base).unwrap().count(), 0);
    }
    #[test]
    fn retries_and_deleted_originals_do_not_duplicate() {
        let dir = tempfile::tempdir().unwrap();
        let base = dir.path().join("notes");
        fs::create_dir(&base).unwrap();
        let ledger = dir.path().join("ledger.json");
        let req = Request {
            schema_version: 1,
            account_subject: "test@example.com".into(),
            target_pc_id: uuid::Uuid::new_v4().to_string(),
            note_id: uuid::Uuid::new_v4().to_string(),
            markdown: "Web試験\n**強調**".into(),
        };
        validate(&req, "test@example.com").unwrap();
        assert!(import_once(&base, &ledger, &req).unwrap());
        assert!(!import_once(&base, &ledger, &req).unwrap());
        let files = fs::read_dir(&base).unwrap().collect::<Vec<_>>();
        assert_eq!(files.len(), 1);
        fs::remove_file(files[0].as_ref().unwrap().path()).unwrap();
        assert!(!import_once(&base, &ledger, &req).unwrap());
        assert_eq!(fs::read_dir(&base).unwrap().count(), 0);
        let mut other = req.clone();
        other.markdown = "別内容".into();
        assert!(import_once(&base, &ledger, &other).is_err());
        assert!(validate(&req, "other@example.com").is_err());
    }
}
