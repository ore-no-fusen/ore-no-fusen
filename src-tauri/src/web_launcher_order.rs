//! Independent, per-PC display metadata. Never edits note content or deletes files.
use crate::{gdrive, web_share_snapshot::ShareDrive};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Entry {
    pub note_id: String,
    pub generation: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LauncherOrder {
    pub schema_version: u32,
    pub account_subject: String,
    pub pc_id: String,
    pub name: String,
    pub entries: Vec<Entry>,
}

impl LauncherOrder {
    fn validate(&self, expected: &Self) -> Result<(), String> {
        if self.schema_version != 1 || self.account_subject != expected.account_subject
            || self.pc_id != expected.pc_id || uuid::Uuid::parse_str(&self.pc_id).map(|id| id.to_string()).ok().as_deref() != Some(self.pc_id.as_str())
            || self.name.trim().is_empty() || self.name.len() > 512 || self.name.chars().any(char::is_control)
            || self.entries.len() > 10_000
        { return Err("ランチャーの表示順の端末・アカウントを確認できません".into()); }
        let mut seen = HashSet::new();
        for entry in &self.entries {
            if entry.note_id.is_empty() || entry.note_id.len() > 256 || entry.note_id.chars().any(|c| c.is_control() || c == '/' || c == '\\')
                || entry.generation == 0 || !seen.insert(&entry.note_id)
            { return Err("ランチャーの表示順に不正または重複した付箋があります".into()); }
        }
        Ok(())
    }
}

/// Reserve a physical Drive ID locally before the first upload. A retry always
/// addresses that same file. Existing files are updated only with their ETag.
pub(crate) async fn publish<D: ShareDrive>(
    drive: D, folder: &str, order: &LauncherOrder, reserved: Option<&str>,
    mut reserve: impl FnMut(&str) -> Result<(), String>,
) -> Result<(), String> {
    order.validate(order)?;
    let name = format!("web-order-{}.json", order.pc_id);
    let matches = drive.list_named_files(folder, &name, true).await?.into_iter()
        .filter(|(_, n)| n == &name).collect::<Vec<_>>();
    if matches.len() > 1 { return Err("同じPCの表示順が複数あります。前回の順を保持しました".into()); }
    let id = if let Some((id, _)) = matches.first() {
        if reserved.is_some_and(|old| old != id) { return Err("表示順の保存先が変わりました。上書きせず保留しました".into()); }
        id.clone()
    } else if let Some(id) = reserved {
        if drive.file_exists(id).await? { return Err("表示順の保存場所を確認できません".into()); }
        id.to_owned()
    } else { drive.generate_id().await? };
    let desired = serde_json::to_value(order).map_err(|e| e.to_string())?;
    if matches.is_empty() {
        reserve(&id)?;
        let bytes = serde_json::to_vec(order).map_err(|e| e.to_string())?;
        match drive.create_at_id(folder, &id, &name, bytes, "application/json").await? {
            gdrive::CreateAtId::Created => {},
            gdrive::CreateAtId::AlreadyExists => return Err("表示順の作成結果を確認できません。次回同期で再確認します".into()),
        }
    } else {
        let (old, etag) = drive.read_cas(&id, folder).await?;
        let previous: LauncherOrder = serde_json::from_value(old.clone()).map_err(|_| "保存済みの表示順が不正です")?;
        previous.validate(order)?;
        reserve(&id)?;
        if old != desired { drive.write_cas(&id, &etag, &desired).await?; }
    }
    let (verified, _) = drive.read_cas(&id, folder).await?;
    if verified != desired { return Err("表示順の保存結果が変わりました。次回同期で確認してください".into()); }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;
    use std::sync::{Arc, Mutex};
    #[derive(Default)]
    struct State { value: Option<Value>, id: String, duplicates: bool, conflict: bool, writes: usize, creates: usize, lose_reply: bool }
    #[derive(Clone, Default)]
    struct Fake(Arc<Mutex<State>>);
    impl ShareDrive for Fake {
        async fn read_cas(&self, _: &str, _: &str) -> Result<(Value,String),String> { Ok((self.0.lock().unwrap().value.clone().ok_or("missing")?, "etag".into())) }
        async fn write_cas(&self, _: &str, etag: &str, value: &Value) -> Result<(),String> {
            let mut s=self.0.lock().unwrap();if s.conflict || etag!="etag" {return Err("CAS conflict".into());}s.value=Some(value.clone());s.writes+=1;Ok(())
        }
        async fn list_named_files(&self, _: &str, name: &str, _: bool) -> Result<Vec<(String,String)>,String> {
            let s=self.0.lock().unwrap();if s.value.is_none(){return Ok(vec![]);}let mut v=vec![(s.id.clone(),name.to_owned())];if s.duplicates{v.push(("duplicate".into(),name.into()));}Ok(v)
        }
        async fn file_exists(&self, _: &str) -> Result<bool,String> { Ok(self.0.lock().unwrap().value.is_some()) }
        async fn generate_id(&self) -> Result<String,String> {Ok("fixed-id".into())}
        async fn create_at_id(&self, _: &str, id: &str, _: &str, bytes: Vec<u8>, _: &str) -> Result<gdrive::CreateAtId,String> {
            let mut s=self.0.lock().unwrap();if s.value.is_some(){return Ok(gdrive::CreateAtId::AlreadyExists);}s.value=Some(serde_json::from_slice(&bytes).unwrap());s.id=id.into();s.creates+=1;
            if s.lose_reply {s.lose_reply=false;return Err("lost reply".into());}Ok(gdrive::CreateAtId::Created)
        }
        async fn delete_cas(&self,_:&str,_:&str)->Result<(),String>{panic!("order must never delete")}
        async fn find_file(&self,_:&str,_:&str)->Result<Option<String>,String>{unreachable!()}
        async fn name_snapshot(&self,_:&str,_:&str)->Result<(),String>{unreachable!()}
        async fn delete_preview(&self,_:&str,_:&str,_:&str)->Result<(),String>{panic!("order must never delete images")}
        async fn available_bytes(&self)->Result<Option<u64>,String>{unreachable!()}
    }
    fn order()->LauncherOrder { LauncherOrder {schema_version:1,account_subject:"account".into(),pc_id:"11111111-1111-4111-8111-111111111111".into(),name:"PC".into(),entries:vec![Entry{note_id:"z".into(),generation:1},Entry{note_id:"a".into(),generation:1}]} }
    #[test]
    fn reordering_only_updates_metadata_and_unchanged_retry_does_not_write() { tauri::async_runtime::block_on(async {
        let d=Fake::default();let mut o=order();let mut reserved=None;
        publish(d.clone(),"folder",&o,None,|id|{reserved=Some(id.to_owned());Ok(())}).await.unwrap();
        assert_eq!(reserved.as_deref(),Some("fixed-id"));o.entries.reverse();
        publish(d.clone(),"folder",&o,reserved.as_deref(),|_|Ok(())).await.unwrap();
        publish(d.clone(),"folder",&o,reserved.as_deref(),|_|Ok(())).await.unwrap();
        let s=d.0.lock().unwrap();assert_eq!(s.creates,1);assert_eq!(s.writes,1);assert_eq!(s.value,Some(serde_json::to_value(o).unwrap()));
    }); }
    #[test]
    fn lost_create_reply_reuses_the_reserved_file_and_cas_failure_keeps_previous_order() { tauri::async_runtime::block_on(async {
        let d=Fake::default();d.0.lock().unwrap().lose_reply=true;let mut reserved=None;let mut o=order();
        assert!(publish(d.clone(),"folder",&o,None,|id|{reserved=Some(id.to_owned());Ok(())}).await.is_err());
        publish(d.clone(),"folder",&o,reserved.as_deref(),|_|Ok(())).await.unwrap();
        let before=d.0.lock().unwrap().value.clone();d.0.lock().unwrap().conflict=true;o.entries.reverse();
        assert!(publish(d.clone(),"folder",&o,reserved.as_deref(),|_|Ok(())).await.is_err());
        let s=d.0.lock().unwrap();assert_eq!(s.value,before);assert_eq!(s.creates,1);assert_eq!(s.writes,0);
    }); }
    #[test]
    fn duplicate_or_foreign_order_and_failed_local_reservation_never_overwrite() { tauri::async_runtime::block_on(async {
        let d=Fake::default();let o=order();
        assert!(publish(d.clone(),"folder",&o,None,|_|Err("disk full".into())).await.is_err());assert!(d.0.lock().unwrap().value.is_none());
        publish(d.clone(),"folder",&o,None,|_|Ok(())).await.unwrap();d.0.lock().unwrap().duplicates=true;
        assert!(publish(d.clone(),"folder",&o,None,|_|Ok(())).await.is_err());d.0.lock().unwrap().duplicates=false;
        d.0.lock().unwrap().value.as_mut().unwrap()["accountSubject"]=Value::String("other".into());
        assert!(publish(d.clone(),"folder",&o,None,|_|Ok(())).await.is_err());assert_eq!(d.0.lock().unwrap().writes,0);
    }); }
}
