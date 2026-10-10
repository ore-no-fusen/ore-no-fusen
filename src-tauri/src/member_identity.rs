//! Membership identity and best-effort weekly feature counters.
//! Recording a feature never performs disk or network I/O.
use std::{collections::{BTreeMap, BTreeSet}, path::PathBuf, sync::Mutex, time::Instant};
use chrono::{Datelike, Duration, Utc};
use serde::{Deserialize, Serialize};
use tauri::{Emitter, State};
use crate::state::AppState;

const FEATURES: &[&str] = &["note_created", "note_edited", "tag_add", "alarm_set", "iphone_send", "iphone_receive", "search_open", "note_duplicate", "note_archive", "launcher_store", "outline_toggle", "image_attach"];

#[derive(Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FeatureCount { count: u64, active_days: BTreeSet<String>, last_used_day: String }

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeeklyUsage { week: String, schema: u8, app_version: String, features: BTreeMap<String, FeatureCount> }

#[derive(Clone, Serialize, Deserialize, Default)]
pub struct MemberLocal {
    member_id: String, secret: String, general_number: Option<u64>,
    #[serde(default)] analytics_subject: Option<String>,
    #[serde(default, rename="consent", skip_serializing)] legacy_consent: Option<bool>,
    #[serde(default, rename="consent_linked", skip_serializing)] legacy_consent_linked: bool,
    #[serde(default)] weeks: BTreeMap<String, WeeklyUsage>,
    #[serde(default)] read_announcement_ids: BTreeSet<String>,
    #[serde(default)] announcements: Vec<AnnouncementPayload>,
    #[serde(default)] last_heartbeat_date: Option<String>,
    #[serde(default)] last_heartbeat_at: Option<String>,
    #[serde(default)] last_heartbeat_version: Option<String>,
    #[serde(default)] open_seconds: u64,
    #[serde(default)] last_usage_sync_consent: bool,
    #[serde(default)] last_usage_sync_week: Option<String>,
    #[serde(default)] last_usage_sync_features: Vec<String>,
    #[serde(skip)] syncing: bool,
    #[serde(skip)] usage_syncing: bool,
    #[serde(skip)] open_time_tick: Option<Instant>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MemberView { general_number: Option<u64>, analytics_subject: Option<String>, environment: String }
impl MemberLocal {
    fn view(&self) -> MemberView { MemberView { general_number:self.general_number, analytics_subject:self.analytics_subject.clone(),  environment:environment().into() } }
}
fn week_key(now: chrono::DateTime<Utc>) -> String { let iso=now.iso_week(); format!("{}-W{:02}",iso.year(),iso.week()) }

fn environment() -> &'static str {
    #[cfg(windows)]
    if let Ok(name) = windows::ApplicationModel::Package::Current().and_then(|p| p.Id()).and_then(|id| id.Name()) {
        return match name.to_string().as_str() { "ONFStudios.FUSEN"=>"production", "ONFStudios.FUSEN.Dev"=>"development", _=>"disabled" };
    }
    option_env!("FUSEN_MEMBER_ENV").unwrap_or(if cfg!(debug_assertions) { "development" } else { "disabled" })
}
fn endpoint() -> Result<String,String> {
    let url=match environment() {
        "development"=>option_env!("FUSEN_MEMBER_DEV_API_URL").unwrap_or("https://ore-no-fusen-git-develop-uch54s-projects.vercel.app/api/members"),
        "production"=>option_env!("FUSEN_MEMBER_API_URL").unwrap_or("https://ore-no-fusen.vercel.app/api/members"),
        "test"=>option_env!("FUSEN_MEMBER_API_URL").ok_or("Member test service is not configured")?,
        _=>return Err("Member service is disabled".into()),
    };
    let parsed=url::Url::parse(url).map_err(|_|"Invalid member service URL")?;
    if parsed.scheme()!="https" || parsed.host_str().is_none() { return Err("Invalid member service URL".into()); }
    Ok(url.trim_end_matches('/').into())
}
fn identity_path() -> Result<PathBuf,String> {
    let base=std::env::var_os("LOCALAPPDATA").ok_or("Local application data unavailable")?;
    Ok(PathBuf::from(base).join("OreNoFusen").join("membership").join(environment()).join("identity.bin"))
}
fn persist(value:&MemberLocal)->Result<(),String>{
    let path=identity_path()?;
    std::fs::create_dir_all(path.parent().ok_or("Invalid member path")?).map_err(|_|"Cannot create member storage")?;
    let protected=protect(&serde_json::to_vec(value).map_err(|_|"Cannot encode member identity")?)?;
    let temp=path.with_extension("tmp"); use std::io::Write;
    let mut file=std::fs::File::create(&temp).map_err(|_|"Cannot save member identity")?;
    file.write_all(&protected).and_then(|_|file.sync_all()).map_err(|_|"Cannot save member identity")?; drop(file);
    replace_file(&temp,&path)
}
#[cfg(windows)]
fn replace_file(from:&std::path::Path,to:&std::path::Path)->Result<(),String>{
    use std::os::windows::ffi::OsStrExt;
    use windows::{core::PCWSTR,Win32::Storage::FileSystem::{MoveFileExW,MOVEFILE_REPLACE_EXISTING,MOVEFILE_WRITE_THROUGH}};
    let source:Vec<u16>=from.as_os_str().encode_wide().chain(Some(0)).collect();
    let target:Vec<u16>=to.as_os_str().encode_wide().chain(Some(0)).collect();
    unsafe{MoveFileExW(PCWSTR(source.as_ptr()),PCWSTR(target.as_ptr()),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH)}.map_err(|_|"Cannot replace member identity".into())
}
#[cfg(not(windows))]
fn replace_file(from:&std::path::Path,to:&std::path::Path)->Result<(),String>{std::fs::rename(from,to).map_err(|_|"Cannot replace member identity".into())}
fn load_member(state:&mut AppState)->Result<(),String>{
    if state.member.is_none(){
        let path=identity_path()?;
        let value=match std::fs::read(&path){
            Ok(bytes)=>serde_json::from_slice(&unprotect(&bytes)?).map_err(|_|"Member identity damaged; do not reissue")?,
            Err(e) if e.kind()==std::io::ErrorKind::NotFound=>{
                use rand_core::{OsRng,RngCore}; use base64::Engine;
                let mut secret=[0u8;32]; OsRng.fill_bytes(&mut secret);
                let value=MemberLocal{member_id:uuid::Uuid::new_v4().to_string(),secret:base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(secret),..Default::default()}; persist(&value)?; value
            },
            Err(_)=>return Err("Cannot read member identity".into()),
        }; state.member=Some(value);
    }
    Ok(())
}
fn ensure(state:&mut AppState)->Result<&mut MemberLocal,String>{
    load_member(state)?;
    let mut settings = crate::storage::load_settings()?;
    let member = state.member.as_mut().ok_or("Member identity unavailable")?;
    if !member.legacy_consent_linked && preserve_legacy_refusal(member.legacy_consent, settings.analytics_consent.as_deref()) {
        settings.analytics_consent = Some("denied".into());
        crate::storage::save_settings(&settings)?;
    }
    let next = choice(settings.analytics_consent.as_deref());
    if state.usage_consent != next { member.open_time_tick = None; }
    state.usage_consent = next;
    let migrated = member.legacy_consent.take().is_some() || member.legacy_consent_linked;
    member.legacy_consent_linked = false;
    let cleared = state.usage_consent != Some(true) && clear_usage(member);
    if migrated || cleared { persist(member)?; }
    Ok(member)
}

fn choice(value: Option<&str>) -> Option<bool> {
    match value { Some("granted") => Some(true), Some("denied") => Some(false), _ => None }
}

fn clear_usage(member: &mut MemberLocal) -> bool {
    let changed = !member.weeks.is_empty() || member.open_seconds != 0;
    member.weeks.clear(); member.open_seconds = 0; member.open_time_tick = None;
    changed
}

fn preserve_legacy_refusal(legacy: Option<bool>, analytics: Option<&str>) -> bool {
    legacy == Some(false) && analytics == Some("granted")
}

pub fn apply_usage_setting(state: &mut AppState, value: Option<&str>) -> Result<(), String> {
    load_member(state)?;
    let changed = state.usage_consent != choice(value);
    state.usage_consent = choice(value);
    let member = state.member.as_mut().ok_or("Member identity unavailable")?;
    if changed { member.open_time_tick = None; }
    let migrated = member.legacy_consent.take().is_some() || member.legacy_consent_linked;
    member.legacy_consent_linked = false;
    let cleared = state.usage_consent != Some(true) && clear_usage(member);
    if migrated || cleared { persist(member)?; }
    Ok(())
}

fn usage_enabled(state: &mut AppState) -> Result<bool,String> {
    ensure(state)?;
    Ok(state.usage_consent == Some(true))
}

#[tauri::command]
pub fn member_get(state:State<'_,Mutex<AppState>>)->Result<MemberView,String>{let mut g=state.lock().map_err(|_|"State unavailable")?;Ok(ensure(&mut g)?.view())}

/// Adds a UI-side batch to memory. It deliberately performs no persistence.
#[tauri::command]
pub fn member_record_batch(state:State<'_,Mutex<AppState>>,counts:BTreeMap<String,u64>)->Result<(),String>{
    if counts.is_empty(){return Ok(());} if counts.len()>FEATURES.len() || counts.iter().any(|(n,c)|!FEATURES.contains(&n.as_str())||*c==0||*c>1_000_000){return Err("Invalid feature batch".into());}
    let mut g=state.lock().map_err(|_|"State unavailable")?;
    record_counts(&mut g, counts, Utc::now());
    Ok(())
}
fn record_counts(g: &mut AppState, counts: BTreeMap<String,u64>, now: chrono::DateTime<Utc>) {
    if g.usage_consent != Some(true) { return; }
    let member=match g.member.as_mut(){Some(v)=>v,None=>return};
    let week=week_key(now); let day=now.format("%Y-%m-%d").to_string();
    let usage=member.weeks.entry(week.clone()).or_insert_with(||WeeklyUsage{week,schema:1,app_version:env!("CARGO_PKG_VERSION").into(),features:BTreeMap::new()});
    usage.schema = 2;
    for(name,increment)in counts{let f=usage.features.entry(name).or_default();f.count=f.count.saturating_add(increment);f.active_days.insert(day.clone());f.last_used_day=day.clone();}
}
pub(crate) fn record_launcher_store(state: &mut AppState) {
    record_counts(state, BTreeMap::from([("launcher_store".into(), 1)]), Utc::now());
}

#[tauri::command]
pub fn member_flush(state:State<'_,Mutex<AppState>>)->Result<(),String>{
    let snapshot={let g=state.lock().map_err(|_|"State unavailable")?;match g.member.as_ref(){Some(v)=>v.clone(),None=>return Ok(())}}; persist(&snapshot)
}

#[tauri::command]
pub fn member_open_time_tick(state:State<'_,Mutex<AppState>>)->Result<(),String>{
    let mut g=state.lock().map_err(|_|"State unavailable")?;
    let granted=usage_enabled(&mut g)?;
    let member=g.member.as_mut().ok_or("Member identity unavailable")?;
    let now=Instant::now();
    if let Some(previous)=member.open_time_tick {
        if granted {
            member.open_seconds=member.open_seconds.saturating_add(now.duration_since(previous).as_secs());
            persist(member)?;
        }
    }
    member.open_time_tick=Some(now);
    Ok(())
}

fn current_usage_snapshot(member:&MemberLocal,analytics_consent:bool,week:&str)->(Vec<String>,bool){
    let consent=analytics_consent;
    let features=if consent {member.weeks.get(week)
        .map(|usage|usage.features.keys().cloned().collect()).unwrap_or_default()} else {Vec::new()};
    (features,consent)
}

#[tauri::command]
pub async fn member_sync_usage(state:State<'_,Mutex<AppState>>)->Result<(),String>{
    let base=endpoint()?;
    let (snapshot,week,features,consent,open_seconds)={
        let mut g=state.lock().map_err(|_|"State unavailable")?;
        let analytics_consent=usage_enabled(&mut g)?;
        let member=g.member.as_mut().ok_or("Member identity unavailable")?;
        let week=week_key(Utc::now());
        let (features,consent)=current_usage_snapshot(&member,analytics_consent,&week);
        if member.usage_syncing || !should_sync_usage(member,consent,&week,&features) { return Ok(()); }
        member.usage_syncing=true;
        (member.clone(),week,features,consent,member.open_seconds)
    };
    let result=async {
        let client=reqwest::Client::builder().timeout(std::time::Duration::from_secs(15)).build().map_err(|_|"Cannot create member client")?;
        post(&client,&base,"usage",&snapshot,serde_json::json!({"week":week,"features":features,"consent":consent,"usageSchema":2,"openMinutes":open_seconds/60})).await?;
        Ok::<(),String>(())
    }.await;
    let mut g=state.lock().map_err(|_|"State unavailable")?;
    let member=ensure(&mut g)?;
    member.usage_syncing=false;
    result?;
    mark_usage_synced(member,consent,&week,&features);
    persist(member)
}

fn should_sync_usage(member:&MemberLocal,consent:bool,week:&str,features:&[String])->bool {
    if !consent && !member.last_usage_sync_consent { return false; }
    member.last_usage_sync_consent!=consent || (consent &&
        (member.last_usage_sync_week.as_deref()!=Some(week) || member.last_usage_sync_features!=features))
}

fn mark_usage_synced(member:&mut MemberLocal,consent:bool,week:&str,features:&[String]) {
    member.last_usage_sync_consent=consent;
    member.last_usage_sync_week=Some(week.into());
    member.last_usage_sync_features=features.to_vec();
}

#[tauri::command]
pub fn member_closed_summaries(state:State<'_,Mutex<AppState>>)->Result<Vec<WeeklyUsage>,String>{
    let current=week_key(Utc::now()); let mut g=state.lock().map_err(|_|"State unavailable")?; let granted=usage_enabled(&mut g)?; let member=g.member.as_mut().ok_or("Member identity unavailable")?;
    if !granted||member.analytics_subject.is_none(){return Ok(Vec::new());}
    Ok(member.weeks.iter().filter(|(week,_)|*week<&current).map(|(_,v)|v.clone()).collect())
}

#[tauri::command]
pub fn member_mark_summary_sent(state:State<'_,Mutex<AppState>>,week:String)->Result<(),String>{
    let mut g=state.lock().map_err(|_|"State unavailable")?; let member=ensure(&mut g)?; if member.weeks.remove(&week).is_some(){persist(member)?;} Ok(())
}

#[tauri::command]
pub fn member_needs_sync(state:State<'_,Mutex<AppState>>)->Result<bool,String>{let mut g=state.lock().map_err(|_|"State unavailable")?;let m=ensure(&mut g)?;Ok(m.general_number.is_none()||m.analytics_subject.is_none())}

async fn post(client:&reqwest::Client,base:&str,operation:&str,member:&MemberLocal,mut body:serde_json::Value)->Result<serde_json::Value,String>{
    body["memberId"]=member.member_id.clone().into();body["secretToken"]=member.secret.clone().into();body["environment"]=environment().into();
    let response=client.post(format!("{base}/{operation}")).json(&body).send().await.map_err(|_|"Member network unavailable")?;
    if !response.status().is_success(){return Err(format!("Member request failed ({})",response.status().as_u16()));}response.json().await.map_err(|_|"Invalid member response".into())
}

#[tauri::command]
pub async fn member_link_conversation(state:State<'_,Mutex<AppState>>,conversation_id:String,conversation_secret:String)->Result<(),String>{
    let base=endpoint()?;let snapshot={let mut g=state.lock().map_err(|_|"State unavailable")?;ensure(&mut g)?.clone()};if snapshot.general_number.is_none(){return Err("Member registration is pending".into());}
    let client=reqwest::Client::builder().timeout(std::time::Duration::from_secs(15)).build().map_err(|_|"Cannot create member client")?;
    post(&client,&base,"link-conversation",&snapshot,serde_json::json!({"conversationId":conversation_id,"conversationSecret":conversation_secret})).await?;Ok(())
}

#[tauri::command]
pub async fn member_sync(app:tauri::AppHandle,state:State<'_,Mutex<AppState>>)->Result<MemberView,String>{
    let base=endpoint()?;let snapshot={let mut g=state.lock().map_err(|_|"State unavailable")?;let value=ensure(&mut g)?;if value.syncing{return Ok(value.view());}value.syncing=true;value.clone()};
    let result=async{let client=reqwest::Client::builder().timeout(std::time::Duration::from_secs(15)).build().map_err(|_|"Cannot create member client")?;let registered=post(&client,&base,"register",&snapshot,serde_json::json!({})).await?;
        let number=registered["generalNumber"].as_u64().filter(|n|*n>=10000).ok_or("Invalid member number")?;
        let subject=registered["analyticsSubject"].as_str().filter(|s|s.len()>=32&&s.len()<=64).ok_or("Invalid analysis ID")?.to_string();Ok::<(u64,String),String>((number,subject))}.await;
    let (snapshot,view)={
        let mut g=state.lock().map_err(|_|"State unavailable")?;let value=ensure(&mut g)?;value.syncing=false;let(number,subject)=result?;value.general_number=Some(number);value.analytics_subject=Some(subject);
        (value.clone(),value.view())
    };
    persist(&snapshot)?;let _=app.emit("member_updated",view.clone());Ok(view)
}

// --- ハートビート（開発者ホットライン + 会員生存確認） ---

fn should_request_heartbeat(environment: &str, last_at: Option<&str>, last_date: Option<&str>, now: chrono::DateTime<Utc>) -> bool {
    if environment == "development" { return true; }
    if let Some(sent_at) = last_at.and_then(|value| chrono::DateTime::parse_from_rfc3339(value).ok()) {
        return now.signed_duration_since(sent_at.with_timezone(&Utc)) >= Duration::hours(24);
    }
    // Old installations only have a UTC date. Keep their previous daily limit until their next successful heartbeat.
    let today=now.format("%Y-%m-%d").to_string();
    last_date != Some(today.as_str())
}

fn heartbeat_due(environment: &str, last_at: Option<&str>, last_date: Option<&str>, last_version: Option<&str>, now: chrono::DateTime<Utc>) -> bool {
    last_version != Some(env!("CARGO_PKG_VERSION")) || should_request_heartbeat(environment, last_at, last_date, now)
}

fn matches_segment(segment: &str, member: &MemberLocal, current_week: &str, analytics_consent: bool) -> bool {
    match segment {
        "all" => true,
        "veteran" => member.general_number.map_or(false, |n| n < 10050),
        "newcomer" => member.general_number.map_or(false, |n| n >= 10100),
        "feature_active" => analytics_consent && member.weeks.get(current_week)
            .map_or(false, |w| !w.features.is_empty()),
        "feature_inactive" => analytics_consent
            && member.weeks.get(current_week)
                .map_or(true, |w| w.features.is_empty()),
        "iphone_week_unused" => analytics_consent
            && member.weeks.get(current_week).map_or(true, |w|
                !w.features.contains_key("iphone_send") && !w.features.contains_key("iphone_receive")),
        _ => {
            if let Some(feature) = segment.strip_prefix("feature_week_used:") {
                return analytics_consent && FEATURES.contains(&feature)
                    && member.weeks.get(current_week)
                        .map_or(false, |w| w.features.contains_key(feature));
            }
            if let Some(feature) = segment.strip_prefix("feature_week_unused:") {
                return analytics_consent && FEATURES.contains(&feature)
                    && member.weeks.get(current_week)
                        .map_or(true, |w| !w.features.contains_key(feature));
            }
            segment.strip_prefix("member:")
                .and_then(|number| number.parse::<u64>().ok())
                .map_or(false, |number| member.general_number == Some(number))
        },
    }
}

fn new_announcements(member: &MemberLocal, announcements: Vec<AnnouncementPayload>, current_week: &str, analytics_consent: bool) -> Vec<AnnouncementPayload> {
    announcements.into_iter()
        .filter(|a| matches_segment(&a.segment, member, current_week, analytics_consent)
                    && !member.announcements.iter().any(|saved| saved.id == a.id))
        .collect()
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AnnouncementPayload {
    id: String, title: String, body: String, segment: String, created_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HeartbeatResponse {
    #[allow(dead_code)] last_seen_at: String,
    announcements: Vec<AnnouncementPayload>,
}

#[tauri::command]
pub fn member_announcements(state: State<'_, Mutex<AppState>>) -> Result<Vec<AnnouncementPayload>, String> {
    let mut guard = state.lock().map_err(|_| "State unavailable")?;
    Ok(ensure(&mut guard)?.announcements.clone())
}

#[tauri::command]
pub async fn member_heartbeat(
    state: State<'_, Mutex<AppState>>,
 ) -> Result<Vec<AnnouncementPayload>, String> {
    let base = endpoint()?;
    let (snapshot, today, week, features, consent, open_seconds) = {
        let mut g = state.lock().map_err(|_| "State unavailable")?;
        let analytics_consent=usage_enabled(&mut g)?;
        let value=g.member.as_mut().ok_or("Member identity unavailable")?;
        let now = Utc::now();
        let today = now.format("%Y-%m-%d").to_string();

        // 開発環境は起動のたびに確認し、本番環境は1日1回に抑える。
        if !heartbeat_due(environment(), value.last_heartbeat_at.as_deref(), value.last_heartbeat_date.as_deref(), value.last_heartbeat_version.as_deref(), now) {
            return Ok(Vec::new());
        }
        let week = week_key(Utc::now());
        let (features, consent) = current_usage_snapshot(value, analytics_consent, &week);
        (value.clone(), today, week, features, consent, value.open_seconds)
    };

    // API呼び出し
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build().map_err(|_| "Cannot create client")?;
    let response: HeartbeatResponse = serde_json::from_value(
        post(&client, &base, "heartbeat", &snapshot, serde_json::json!({"week":week,"features":features,"consent":consent,"openMinutes":open_seconds/60,"appVersion":env!("CARGO_PKG_VERSION")})).await?
    ).map_err(|_| "Invalid heartbeat response")?;

    // 対象のお便りをローカルの会話画面へ保存する。
    let received_week = week_key(Utc::now());
    let latest_consent = crate::storage::load_settings()?.analytics_consent.as_deref() == Some("granted");
    let received = new_announcements(&snapshot, response.announcements, &received_week, latest_consent);

    // 状態更新: last_heartbeat_date + 受信履歴
    {
        let mut g = state.lock().map_err(|_| "State unavailable")?;
        let value = ensure(&mut g)?;
        value.last_heartbeat_date = Some(today);
        value.last_heartbeat_at = Some(Utc::now().to_rfc3339());
        value.last_heartbeat_version = Some(env!("CARGO_PKG_VERSION").into());
        mark_usage_synced(value,consent,&week,&features);
        for a in &received {
            value.read_announcement_ids.insert(a.id.clone());
        }
        value.announcements.extend(received.iter().cloned());
        if value.announcements.len() > 100 {
            let excess = value.announcements.len() - 100;
            value.announcements.drain(..excess);
        }
        persist(value)?;
    }

    Ok(received)
}

#[cfg(not(windows))] fn protect(_: &[u8])->Result<Vec<u8>,String>{Err("Protected member storage requires Windows".into())}
#[cfg(not(windows))] fn unprotect(_: &[u8])->Result<Vec<u8>,String>{Err("Protected member storage requires Windows".into())}
#[cfg(windows)]
fn protect(bytes:&[u8])->Result<Vec<u8>,String>{use windows::{core::PCWSTR,Win32::{Foundation::{LocalFree,HLOCAL},Security::Cryptography::{CryptProtectData,CRYPT_INTEGER_BLOB,CRYPTPROTECT_UI_FORBIDDEN}}};let input=CRYPT_INTEGER_BLOB{cbData:bytes.len().try_into().map_err(|_|"Identity too large")?,pbData:bytes.as_ptr()as*mut u8};let mut output=CRYPT_INTEGER_BLOB::default();unsafe{CryptProtectData(&input,PCWSTR::null(),None,None,None,CRYPTPROTECT_UI_FORBIDDEN,&mut output).map_err(|_|"Cannot protect member identity")?;let value=std::slice::from_raw_parts(output.pbData,output.cbData as usize).to_vec();let _=LocalFree(HLOCAL(output.pbData.cast()));Ok(value)}}
#[cfg(windows)]
fn unprotect(bytes:&[u8])->Result<Vec<u8>,String>{use windows::Win32::{Foundation::{LocalFree,HLOCAL},Security::Cryptography::{CryptUnprotectData,CRYPT_INTEGER_BLOB,CRYPTPROTECT_UI_FORBIDDEN}};let input=CRYPT_INTEGER_BLOB{cbData:bytes.len().try_into().map_err(|_|"Identity too large")?,pbData:bytes.as_ptr()as*mut u8};let mut output=CRYPT_INTEGER_BLOB::default();unsafe{CryptUnprotectData(&input,None,None,None,None,CRYPTPROTECT_UI_FORBIDDEN,&mut output).map_err(|_|"Cannot unlock member identity; do not reissue")?;let value=std::slice::from_raw_parts(output.pbData,output.cbData as usize).to_vec();let _=LocalFree(HLOCAL(output.pbData.cast()));Ok(value)}}

#[cfg(test)]
mod segment_tests {
    use super::*;
    #[test]
    fn launcher_store_records_counts_and_days_only_with_consent() {
        let now = chrono::DateTime::parse_from_rfc3339("2026-10-11T00:00:00Z").unwrap().with_timezone(&Utc);
        let mut state = AppState { member: Some(MemberLocal::default()), usage_consent: Some(false), ..Default::default() };
        record_counts(&mut state, BTreeMap::from([("launcher_store".into(), 1)]), now);
        assert!(state.member.as_ref().unwrap().weeks.is_empty());
        state.usage_consent = Some(true);
        record_counts(&mut state, BTreeMap::from([("launcher_store".into(), 1)]), now);
        record_counts(&mut state, BTreeMap::from([("launcher_store".into(), 1)]), now);
        let usage = &state.member.as_ref().unwrap().weeks["2026-W41"];
        assert_eq!(usage.schema, 2);
        let recorded = &usage.features["launcher_store"];
        assert_eq!(recorded.count, 2);
        assert_eq!(recorded.active_days.len(), 1);
        assert_eq!(recorded.last_used_day, "2026-10-11");
        assert!(!usage.features.contains_key("note_archive"));
        state.usage_consent = None;
        record_launcher_store(&mut state);
        assert_eq!(state.member.as_ref().unwrap().weeks["2026-W41"].features["launcher_store"].count, 2);
    }

    #[test]
    fn single_consent_enables_collection_and_stop_clears_local_usage() {
        let mut member = MemberLocal::default();
        assert!(current_usage_snapshot(&member, true, "2026-W41").1);
        member.open_seconds = 120;
        member.weeks.insert("2026-W41".into(), WeeklyUsage { week: "2026-W41".into(), schema: 1, app_version: "5.5.1".into(), features: BTreeMap::new() });
        clear_usage(&mut member);
        assert!(!current_usage_snapshot(&member, false, "2026-W41").1);
        assert!(member.weeks.is_empty());
        assert_eq!(member.open_seconds, 0);
    }

    #[test]
    fn migration_does_not_treat_unselected_as_refusal_or_override_explicit_refusal() {
        assert!(!preserve_legacy_refusal(None, Some("granted")));
        assert!(!preserve_legacy_refusal(Some(true), Some("granted")));
        assert!(preserve_legacy_refusal(Some(false), Some("granted")));
        assert!(!preserve_legacy_refusal(None, Some("denied")));
        assert!(!preserve_legacy_refusal(None, None));
    }

    #[test]
    fn production_waits_twenty_four_hours_while_development_rechecks() {
        use chrono::TimeZone;
        let now=Utc.with_ymd_and_hms(2026,9,24,0,1,0).unwrap();
        assert!(should_request_heartbeat("development",Some("2026-09-23T23:59:00Z"),Some("2026-09-23"),now));
        assert!(!should_request_heartbeat("production",Some("2026-09-23T23:59:00Z"),Some("2026-09-23"),now));
        assert!(!should_request_heartbeat("production",Some("2026-09-23T00:01:01Z"),Some("2026-09-23"),now));
        assert!(should_request_heartbeat("production",Some("2026-09-23T00:01:00Z"),Some("2026-09-23"),now));
        assert!(!should_request_heartbeat("production",None,Some("2026-09-24"),now));
        assert!(should_request_heartbeat("production",None,Some("2026-09-23"),now));
        assert!(should_request_heartbeat("production",None,None,now));
    }

    #[test]
    fn new_version_reports_at_next_start_even_within_twenty_four_hours() {
        use chrono::TimeZone;
        let now=Utc.with_ymd_and_hms(2026,9,24,0,1,0).unwrap();
        let last_at=Some("2026-09-23T23:59:00Z");
        assert!(heartbeat_due("production",last_at,Some("2026-09-23"),None,now));
        assert!(heartbeat_due("production",last_at,Some("2026-09-23"),Some("5.4.0"),now));
        assert!(!heartbeat_due("production",last_at,Some("2026-09-23"),Some(env!("CARGO_PKG_VERSION")),now));
    }

    #[test]
    fn received_announcements_stay_visible_and_do_not_duplicate() {
        let letter = AnnouncementPayload { id: "letter-1".into(), title: "題".into(), body: "本文".into(), segment: "veteran".into(), created_at: "2026-09-25T00:00:00Z".into() };
        let mut member = MemberLocal { general_number: Some(10001), ..Default::default() };
        member.read_announcement_ids.insert(letter.id.clone());
        let first = new_announcements(&member, vec![letter.clone()], "2026-W39", false);
        assert_eq!(first.len(), 1); // 旧版で既読扱いになったお便りも会話履歴へ移す。
        member.announcements = first;
        assert!(new_announcements(&member, vec![letter.clone()], "2026-W39", false).is_empty());
        member.general_number = Some(10101);
        member.announcements.clear();
        assert!(new_announcements(&member, vec![letter], "2026-W39", false).is_empty());
    }

    #[test]
    fn member_number_segment_matches_only_its_recipient() {
        let member = MemberLocal { general_number: Some(10123), ..Default::default() };
        assert!(matches_segment("member:10123", &member, "2026-W39", false));
        assert!(!matches_segment("member:10124", &member, "2026-W39", false));
        assert!(!matches_segment("member:invalid", &member, "2026-W39", false));
    }

    #[test]
    fn specific_weekly_features_require_consent_and_match_the_selected_feature() {
        let mut member = MemberLocal::default();
        let mut features = BTreeMap::new();
        features.insert("note_edited".to_string(), FeatureCount::default());
        member.weeks.insert("2026-W39".to_string(), WeeklyUsage {
            week: "2026-W39".into(), schema: 1, app_version: "5.4.0".into(), features,
        });
        assert!(matches_segment("feature_week_used:note_edited", &member, "2026-W39", true));
        assert!(!matches_segment("feature_week_unused:note_edited", &member, "2026-W39", true));
        assert!(matches_segment("feature_week_unused:iphone_send", &member, "2026-W39", true));
        assert!(!matches_segment("feature_week_used:iphone_send", &member, "2026-W39", true));
        assert!(!matches_segment("feature_week_unused:unknown", &member, "2026-W39", true));
        assert!(!matches_segment("feature_week_unused:iphone_send", &member, "2026-W39", false));
        assert!(!matches_segment("feature_week_used:note_edited", &member, "2026-W39", false));
        assert!(!matches_segment("feature_week_unused:iphone_send", &member, "2026-W39", false));
    }

    #[test]
    fn iphone_week_unused_requires_consent_and_no_send_or_receive_this_week() {
        let mut member = MemberLocal::default();
        assert!(matches_segment("iphone_week_unused", &member, "2026-W39", true));
        let mut features = BTreeMap::new();
        features.insert("iphone_send".to_string(), FeatureCount::default());
        member.weeks.insert("2026-W39".into(), WeeklyUsage {
            week: "2026-W39".into(), schema: 1, app_version: "5.4.0".into(), features,
        });
        assert!(!matches_segment("iphone_week_unused", &member, "2026-W39", true));
        assert!(matches_segment("iphone_week_unused", &member, "2026-W40", true));
        member.weeks.get_mut("2026-W39").unwrap().features.clear();
        member.weeks.get_mut("2026-W39").unwrap().features.insert("iphone_receive".into(), FeatureCount::default());
        assert!(!matches_segment("iphone_week_unused", &member, "2026-W39", true));
        assert!(!matches_segment("iphone_week_unused", &member, "2026-W39", false));
    }

    #[test]
    fn usage_snapshot_contains_only_this_week_and_respects_single_consent() {
        let mut member = MemberLocal::default();
        let mut features = BTreeMap::new();
        features.insert("iphone_send".into(), FeatureCount::default());
        member.weeks.insert("2026-W39".into(), WeeklyUsage {
            week: "2026-W39".into(), schema: 1, app_version: "5.4.0".into(), features,
        });
        assert_eq!(current_usage_snapshot(&member,true,"2026-W39"),(vec!["iphone_send".into()],true));
        assert_eq!(current_usage_snapshot(&member,true,"2026-W40"),(Vec::new(),true));
        assert_eq!(current_usage_snapshot(&member,false,"2026-W39"),(Vec::new(),false));
        assert_eq!(current_usage_snapshot(&member,false,"2026-W39"),(Vec::new(),false));
    }

    #[test]
    fn usage_api_syncs_changed_features_and_week_without_resending_unchanged_data() {
        let mut member=MemberLocal::default();
        let week="2026-W41";
        let features=vec!["note_edited".into()];
        assert!(!should_sync_usage(&member,false,week,&[]));
        assert!(should_sync_usage(&member,true,week,&[]));
        mark_usage_synced(&mut member,true,week,&[]);
        assert!(!should_sync_usage(&member,true,week,&[]));
        member.open_seconds=24*60*60;
        assert!(!should_sync_usage(&member,true,week,&[]));
        assert!(should_sync_usage(&member,true,week,&features));
        // Failed sends do not update the marker, so the next check retries.
        assert!(should_sync_usage(&member,true,week,&features));
        mark_usage_synced(&mut member,true,week,&features);
        assert!(!should_sync_usage(&member,true,week,&features));
        assert!(should_sync_usage(&member,true,"2026-W42",&[]));
        assert!(should_sync_usage(&member,false,week,&[]));
        mark_usage_synced(&mut member,false,week,&[]);
        assert!(!should_sync_usage(&member,false,week,&[]));
        assert!(should_sync_usage(&member,true,week,&features));
    }

    #[test]
    fn usage_consent_sync_progress_survives_restart() {
        let mut member=MemberLocal { open_seconds: 24*60*60, ..Default::default() };
        let features=vec!["note_duplicate".into(),"note_edited".into()];
        mark_usage_synced(&mut member,true,"2026-W41",&features);
        let restored:MemberLocal=serde_json::from_slice(&serde_json::to_vec(&member).unwrap()).unwrap();
        assert!(!should_sync_usage(&restored,true,"2026-W41",&features));
        assert_eq!(restored.open_seconds,24*60*60);
    }

    #[test]
    fn legacy_success_without_a_feature_marker_resends_retained_usage() {
        let member=MemberLocal { last_usage_sync_consent:true, ..Default::default() };
        assert!(should_sync_usage(&member,true,"2026-W41",&vec!["note_edited".into()]));
    }
}

#[cfg(all(test,windows))]
mod tests{use super::*;use chrono::TimeZone;#[test]fn iso_week_key_uses_monday_based_week_year(){assert_eq!(week_key(Utc.with_ymd_and_hms(2027,1,1,0,0,0).unwrap()),"2026-W53");}#[test]fn protected_identity_roundtrip(){let identity=MemberLocal{member_id:uuid::Uuid::new_v4().to_string(),secret:"private-member-secret".into(),general_number:Some(10000),analytics_subject:Some("0123456789abcdef0123456789abcdef".into()),..Default::default()};let bytes=serde_json::to_vec(&identity).unwrap();let protected=protect(&bytes).unwrap();assert!(!protected.windows(identity.secret.len()).any(|w|w==identity.secret.as_bytes()));let restored:MemberLocal=serde_json::from_slice(&unprotect(&protected).unwrap()).unwrap();assert_eq!(restored.analytics_subject,identity.analytics_subject);}#[test]fn protected_file_can_replace_an_existing_identity(){let dir=std::env::temp_dir().join(format!("fusen-member-{}",uuid::Uuid::new_v4()));std::fs::create_dir_all(&dir).unwrap();let target=dir.join("identity.bin");let replacement=dir.join("identity.tmp");std::fs::write(&target,b"old").unwrap();std::fs::write(&replacement,b"new").unwrap();replace_file(&replacement,&target).unwrap();assert_eq!(std::fs::read(&target).unwrap(),b"new");std::fs::remove_dir_all(dir).unwrap();}#[test]fn app_state_never_serializes_member(){let mut state=AppState::default();state.member=Some(MemberLocal{secret:"private-member-secret".into(),..Default::default()});let json=serde_json::to_value(state).unwrap();assert!(json.get("member").is_none());}}

#[cfg(test)]
mod single_setting_tests {
    use super::*;
    #[test]
    fn legacy_choice_is_read_but_never_written() {
        let mut old=serde_json::to_value(MemberLocal::default()).unwrap();
        old["consent"]=false.into();
        old["consent_linked"]=true.into();
        let member: MemberLocal = serde_json::from_value(old).unwrap();
        assert_eq!(member.legacy_consent, Some(false));
        assert!(member.legacy_consent_linked);
        let saved=serde_json::to_value(member).unwrap();
        assert!(saved.get("consent").is_none());
        assert!(saved.get("consent_linked").is_none());
    }
    #[test]
    fn only_the_saved_setting_defines_the_choice() {
        assert_eq!(choice(Some("granted")),Some(true));
        assert_eq!(choice(Some("denied")),Some(false));
        assert_eq!(choice(None),None);
        let mut state=AppState::default();
        state.usage_consent=Some(true);
        assert!(serde_json::to_value(state).unwrap().get("usage_consent").is_none());
    }
}
