//! Membership identity and best-effort weekly feature counters.
//! Recording a feature never performs disk or network I/O.
use std::{collections::{BTreeMap, BTreeSet}, path::PathBuf, sync::Mutex};
use chrono::{Datelike, Utc};
use serde::{Deserialize, Serialize};
use tauri::{Emitter, State};
use crate::state::AppState;

const FEATURES: &[&str] = &["note_created", "note_edited", "tag_add", "alarm_set", "iphone_send", "iphone_receive", "search_open", "note_duplicate", "note_archive", "outline_toggle", "image_attach"];

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
    consent: Option<bool>,
    #[serde(default)] weeks: BTreeMap<String, WeeklyUsage>,
    #[serde(skip)] syncing: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MemberView { general_number: Option<u64>, analytics_subject: Option<String>, consent: Option<bool>, environment: String }
impl MemberLocal {
    fn view(&self) -> MemberView { MemberView { general_number:self.general_number, analytics_subject:self.analytics_subject.clone(), consent:self.consent, environment:environment().into() } }
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
fn ensure(state:&mut AppState)->Result<&mut MemberLocal,String>{
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
    state.member.as_mut().ok_or("Member identity unavailable".into())
}

#[tauri::command]
pub fn member_get(state:State<'_,Mutex<AppState>>)->Result<MemberView,String>{let mut g=state.lock().map_err(|_|"State unavailable")?;Ok(ensure(&mut g)?.view())}

#[tauri::command]
pub fn member_set_consent(app:tauri::AppHandle,state:State<'_,Mutex<AppState>>,granted:bool)->Result<MemberView,String>{
    let mut g=state.lock().map_err(|_|"State unavailable")?; let value=ensure(&mut g)?; value.consent=Some(granted); if !granted{value.weeks.clear();} persist(value)?;
    let view=value.view(); let _=app.emit("member_updated",view.clone()); Ok(view)
}

/// Adds a UI-side batch to memory. It deliberately performs no persistence.
#[tauri::command]
pub fn member_record_batch(state:State<'_,Mutex<AppState>>,counts:BTreeMap<String,u64>)->Result<(),String>{
    if counts.is_empty(){return Ok(());} if counts.len()>FEATURES.len() || counts.iter().any(|(n,c)|!FEATURES.contains(&n.as_str())||*c==0||*c>1_000_000){return Err("Invalid feature batch".into());}
    let mut g=state.lock().map_err(|_|"State unavailable")?;
    let member=match g.member.as_mut(){Some(v) if v.consent==Some(true)=>v,_=>return Ok(())};
    let now=Utc::now(); let week=week_key(now); let day=now.format("%Y-%m-%d").to_string();
    let usage=member.weeks.entry(week.clone()).or_insert_with(||WeeklyUsage{week,schema:1,app_version:env!("CARGO_PKG_VERSION").into(),features:BTreeMap::new()});
    for(name,increment)in counts{let f=usage.features.entry(name).or_default();f.count=f.count.saturating_add(increment);f.active_days.insert(day.clone());f.last_used_day=day.clone();} Ok(())
}

#[tauri::command]
pub fn member_flush(state:State<'_,Mutex<AppState>>)->Result<(),String>{
    let snapshot={let g=state.lock().map_err(|_|"State unavailable")?;match g.member.as_ref(){Some(v)=>v.clone(),None=>return Ok(())}}; persist(&snapshot)
}

#[tauri::command]
pub fn member_closed_summaries(state:State<'_,Mutex<AppState>>)->Result<Vec<WeeklyUsage>,String>{
    let current=week_key(Utc::now()); let mut g=state.lock().map_err(|_|"State unavailable")?; let member=ensure(&mut g)?;
    if member.consent!=Some(true)||member.analytics_subject.is_none(){return Ok(Vec::new());}
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

#[cfg(not(windows))] fn protect(_: &[u8])->Result<Vec<u8>,String>{Err("Protected member storage requires Windows".into())}
#[cfg(not(windows))] fn unprotect(_: &[u8])->Result<Vec<u8>,String>{Err("Protected member storage requires Windows".into())}
#[cfg(windows)]
fn protect(bytes:&[u8])->Result<Vec<u8>,String>{use windows::{core::PCWSTR,Win32::{Foundation::{LocalFree,HLOCAL},Security::Cryptography::{CryptProtectData,CRYPT_INTEGER_BLOB,CRYPTPROTECT_UI_FORBIDDEN}}};let input=CRYPT_INTEGER_BLOB{cbData:bytes.len().try_into().map_err(|_|"Identity too large")?,pbData:bytes.as_ptr()as*mut u8};let mut output=CRYPT_INTEGER_BLOB::default();unsafe{CryptProtectData(&input,PCWSTR::null(),None,None,None,CRYPTPROTECT_UI_FORBIDDEN,&mut output).map_err(|_|"Cannot protect member identity")?;let value=std::slice::from_raw_parts(output.pbData,output.cbData as usize).to_vec();let _=LocalFree(HLOCAL(output.pbData.cast()));Ok(value)}}
#[cfg(windows)]
fn unprotect(bytes:&[u8])->Result<Vec<u8>,String>{use windows::Win32::{Foundation::{LocalFree,HLOCAL},Security::Cryptography::{CryptUnprotectData,CRYPT_INTEGER_BLOB,CRYPTPROTECT_UI_FORBIDDEN}};let input=CRYPT_INTEGER_BLOB{cbData:bytes.len().try_into().map_err(|_|"Identity too large")?,pbData:bytes.as_ptr()as*mut u8};let mut output=CRYPT_INTEGER_BLOB::default();unsafe{CryptUnprotectData(&input,None,None,None,None,CRYPTPROTECT_UI_FORBIDDEN,&mut output).map_err(|_|"Cannot unlock member identity; do not reissue")?;let value=std::slice::from_raw_parts(output.pbData,output.cbData as usize).to_vec();let _=LocalFree(HLOCAL(output.pbData.cast()));Ok(value)}}

#[cfg(all(test,windows))]
mod tests{use super::*;use chrono::TimeZone;#[test]fn iso_week_key_uses_monday_based_week_year(){assert_eq!(week_key(Utc.with_ymd_and_hms(2027,1,1,0,0,0).unwrap()),"2026-W53");}#[test]fn protected_identity_roundtrip(){let identity=MemberLocal{member_id:uuid::Uuid::new_v4().to_string(),secret:"private-member-secret".into(),general_number:Some(10000),analytics_subject:Some("0123456789abcdef0123456789abcdef".into()),..Default::default()};let bytes=serde_json::to_vec(&identity).unwrap();let protected=protect(&bytes).unwrap();assert!(!protected.windows(identity.secret.len()).any(|w|w==identity.secret.as_bytes()));let restored:MemberLocal=serde_json::from_slice(&unprotect(&protected).unwrap()).unwrap();assert_eq!(restored.analytics_subject,identity.analytics_subject);}#[test]fn protected_file_can_replace_an_existing_identity(){let dir=std::env::temp_dir().join(format!("fusen-member-{}",uuid::Uuid::new_v4()));std::fs::create_dir_all(&dir).unwrap();let target=dir.join("identity.bin");let replacement=dir.join("identity.tmp");std::fs::write(&target,b"old").unwrap();std::fs::write(&replacement,b"new").unwrap();replace_file(&replacement,&target).unwrap();assert_eq!(std::fs::read(&target).unwrap(),b"new");std::fs::remove_dir_all(dir).unwrap();}#[test]fn app_state_never_serializes_member(){let mut state=AppState::default();state.member=Some(MemberLocal{secret:"private-member-secret".into(),..Default::default()});let json=serde_json::to_value(state).unwrap();assert!(json.get("member").is_none());}}
