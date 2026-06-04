/*
 * Google Drive 連携モジュール
 *
 * 責務:
 * - Google OAuth2 PKCE フロー
 * - access_token の自動更新
 * - Drive REST API v3 による JSON ファイルの R/W
 * - push_config の AppState へのキャッシュ
 */

use std::sync::Mutex;
use std::path::PathBuf;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use crate::state::{AppState, ProConfig};

// ------ 定数 ------
const FOLDER_NAME: &str = "ore-no-fusen";
const PUSH_CONFIG_FILE: &str = "push_devices.json";
const PC_DEVICES_FILE: &str = "pc_devices.json";
#[allow(dead_code)]
const NOTE_FILE: &str = "notes_to_iphone.json";
const TOKEN_FILE: &str = "gdrive_token.json";
const PC_DEVICE_FILE: &str = "pc_device.json";

// ------ 型定義 ------
#[derive(Serialize, Deserialize, Clone)]
pub struct SavedToken {
    pub refresh_token: String,
    pub access_token: Option<String>,
    pub expires_at: Option<i64>,
}

#[derive(Deserialize)]
struct DriveFileList {
    files: Vec<DriveFile>,
}

#[derive(Deserialize, Clone)]
struct DriveFile {
    id: String,
}

#[derive(Deserialize)]
struct DriveFileDetailList {
    files: Vec<DriveFileDetail>,
}

#[derive(Deserialize)]
struct DriveFileDetail {
    id: String,
    name: String,
    #[serde(rename = "modifiedTime")]
    modified_time: Option<String>,
    size: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DriveTempMediaFile {
    pub id: String,
    pub name: String,
    pub modified_time: Option<String>,
    pub size: Option<u64>,
}

#[derive(Deserialize)]
struct PushConfigJson {
    // 新スキーマ: devices 配列
    devices: Option<Vec<DeviceEntry>>,
    // 旧スキーマ後方互換: endpoint 直下
    endpoint: Option<String>,
    keys: Option<PushConfigKeys>,
}

#[derive(Deserialize)]
struct DeviceEntry {
    device_id: Option<String>,
    endpoint: String,
    #[allow(dead_code)]
    keys: PushConfigKeys,
    registered_at: Option<String>,
    device_name: Option<String>,
    google_account_email: Option<String>,
    google_account_name: Option<String>,
    google_account_photo: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct GoogleAccountInfo {
    pub email_address: Option<String>,
    pub display_name: Option<String>,
    pub photo_link: Option<String>,
}

/// フロントエンドに返すデバイス情報
#[derive(Serialize, Clone)]
pub struct PushDeviceInfo {
    pub device_id: String,
    pub endpoint: String,
    pub registered_at: String,
    pub device_name: Option<String>,
    pub google_account_email: Option<String>,
    pub google_account_name: Option<String>,
    pub google_account_photo: Option<String>,
}

/// iPhone PWA が送信先として表示する PC 情報
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PcDeviceInfo {
    pub pc_id: String,
    pub pc_name: String,
    pub registered_at: String,
    pub updated_at: String,
    pub google_account_email: Option<String>,
}

#[derive(Deserialize)]
struct PcDevicesJson {
    pcs: Option<Vec<PcDeviceInfo>>,
}

#[derive(Deserialize)]
struct PushConfigKeys {
    p256dh: String,
    auth: String,
}

#[derive(Deserialize)]
struct TokenRefreshResponse {
    access_token: String,
    expires_in: Option<i64>,
}

#[derive(Deserialize)]
struct DriveAboutResponse {
    user: Option<GoogleAccountInfo>,
}

// ------ 公開関数 ------

/// Tauri app data dir 内の token ファイルパスを返す
pub fn get_token_path() -> PathBuf {
    let base = directories::BaseDirs::new()
        .expect("BaseDirs::new() failed");
    let dir = base.data_local_dir().join(FOLDER_NAME);
    if !dir.exists() {
        std::fs::create_dir_all(&dir).ok();
    }
    dir.join(TOKEN_FILE)
}

fn get_pc_device_path() -> PathBuf {
    get_token_path().with_file_name(PC_DEVICE_FILE)
}

fn default_pc_name() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .ok()
        .filter(|name| !name.trim().is_empty())
        .unwrap_or_else(|| "このPC".to_string())
}

/// 旧バージョンの pc_device.json から pc_id を取り出して破棄する。
/// 戻り値: Some(pc_id) なら移行成功、None なら旧ファイル無し。
fn migrate_legacy_pc_device_file() -> Option<String> {
    let path = get_pc_device_path();
    if !path.exists() {
        return None;
    }
    let pc_id = std::fs::read_to_string(&path).ok()
        .and_then(|raw| serde_json::from_str::<PcDeviceInfo>(&raw).ok())
        .and_then(|pc| {
            let id = pc.pc_id.trim().to_string();
            if id.is_empty() { None } else { Some(id) }
        });
    // 旧ファイルは settings.json に移したのでもう不要。読み終わったら削除する
    let _ = std::fs::remove_file(&path);
    pc_id
}

/// この PC を識別する PcDeviceInfo を返す。
/// 取得順: settings.json の pc_id → 旧 pc_device.json（自動移行）→ 新規生成。
pub fn load_or_create_pc_device() -> Result<PcDeviceInfo, String> {
    let mut settings = crate::storage::load_settings()?;

    let mut needs_save = false;
    let pc_id = if let Some(id) = settings.pc_id.as_ref().filter(|s| !s.trim().is_empty()).cloned() {
        id
    } else if let Some(legacy_id) = migrate_legacy_pc_device_file() {
        settings.pc_id = Some(legacy_id.clone());
        needs_save = true;
        legacy_id
    } else {
        let new_id = uuid::Uuid::new_v4().to_string();
        settings.pc_id = Some(new_id.clone());
        needs_save = true;
        new_id
    };

    if needs_save {
        crate::storage::save_settings(&settings)?;
    }

    let now = chrono::Utc::now().to_rfc3339();
    Ok(PcDeviceInfo {
        pc_id,
        pc_name: default_pc_name(),
        registered_at: now.clone(),
        updated_at: now,
        google_account_email: None,
    })
}

pub fn local_pc_id() -> Result<String, String> {
    Ok(load_or_create_pc_device()?.pc_id)
}

/// Google OAuth2 PKCE フロー。ブラウザを開き、認証後に SavedToken を保存して返す。
pub async fn oauth_pkce_flow(_app: &tauri::AppHandle) -> Result<SavedToken, String> {
    use oauth2::{
        basic::BasicClient, AuthUrl, ClientId, ClientSecret, RedirectUrl, TokenUrl,
        CsrfToken, PkceCodeChallenge, Scope, AuthorizationCode, TokenResponse,
    };

    let client_id = env!("GDRIVE_CLIENT_ID").to_string();
    let client_secret = env!("GDRIVE_CLIENT_SECRET").to_string();

    // tauri-plugin-oauth でポートを取得してリダイレクト URI を確定
    let (tx, rx) = std::sync::mpsc::channel::<String>();
    let port = tauri_plugin_oauth::start(move |url| {
        let _ = tx.send(url);
    }).map_err(|e| e.to_string())?;

    let redirect_url = RedirectUrl::new(format!("http://127.0.0.1:{}", port))
        .map_err(|e| e.to_string())?;

    // oauth2 v5: BasicClient::new(ClientId) + チェーンメソッドで設定
    let oauth_client = BasicClient::new(ClientId::new(client_id))
        .set_client_secret(ClientSecret::new(client_secret))
        .set_auth_uri(
            AuthUrl::new("https://accounts.google.com/o/oauth2/v2/auth".to_string())
                .map_err(|e| e.to_string())?
        )
        .set_token_uri(
            TokenUrl::new("https://oauth2.googleapis.com/token".to_string())
                .map_err(|e| e.to_string())?
        )
        .set_redirect_uri(redirect_url.clone());

    let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();
    // oauth2 v5: authorize_url チェーンにも明示的に redirect_uri を渡す必要あり
    let (auth_url, _csrf_token) = oauth_client
        .authorize_url(CsrfToken::new_random)
        .add_scope(Scope::new("https://www.googleapis.com/auth/drive.file".to_string()))
        .set_pkce_challenge(pkce_challenge)
        .set_redirect_uri(std::borrow::Cow::Owned(redirect_url.clone()))
        .url();

    // ブラウザで開く（cmd経由は & をコマンド区切りとして解釈するため rundll32 を使用）
    #[cfg(target_os = "windows")]
    std::process::Command::new("rundll32.exe")
        .args(["url.dll,FileProtocolHandler", auth_url.as_str()])
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(not(target_os = "windows"))]
    std::process::Command::new("xdg-open")
        .arg(auth_url.as_str())
        .spawn()
        .map_err(|e| e.to_string())?;

    // コールバック URL を待機（5分でタイムアウト）
    let callback_url = rx.recv_timeout(std::time::Duration::from_secs(300))
        .map_err(|_| "OAuth callback not received (timeout or browser closed)".to_string())?;

    // code を抽出
    let parsed_url = url::Url::parse(&callback_url).map_err(|e| e.to_string())?;
    let code = parsed_url.query_pairs()
        .find(|(k, _)| k == "code")
        .map(|(_, v)| v.into_owned())
        .ok_or("No code in callback URL")?;

    // oauth2 v5: request_async に reqwest::Client を渡す
    let http_client = reqwest::ClientBuilder::new()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| e.to_string())?;

    let token_response = oauth_client
        .exchange_code(AuthorizationCode::new(code))
        .set_pkce_verifier(pkce_verifier)
        .set_redirect_uri(std::borrow::Cow::Owned(redirect_url))
        .request_async(&http_client)
        .await
        .map_err(|e| e.to_string())?;

    let access_token = token_response.access_token().secret().to_string();
    let refresh_token = token_response.refresh_token()
        .ok_or("No refresh_token in response")?
        .secret()
        .to_string();

    let expires_at = token_response
        .expires_in()
        .map(|d| chrono::Utc::now().timestamp() + d.as_secs() as i64);

    let saved = SavedToken {
        refresh_token,
        access_token: Some(access_token),
        expires_at,
    };

    let path = get_token_path();
    let json = serde_json::to_string(&saved).map_err(|e| e.to_string())?;
    std::fs::write(&path, &json).map_err(|e| e.to_string())?;

    Ok(saved)
}

/// ファイルから SavedToken を読み込み、期限切れなら refresh して返す
pub async fn get_access_token(client: &Client) -> Result<String, String> {
    let path = get_token_path();
    if !path.exists() {
        return Err("Googleアカウントが接続されていません。設定画面から再接続してください。".to_string());
    }

    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut saved: SavedToken = serde_json::from_str(&raw).map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().timestamp();
    let needs_refresh = saved.access_token.is_none()
        || saved.expires_at.map_or(true, |exp| exp - now < 60);

    if needs_refresh {
        let client_id = env!("GDRIVE_CLIENT_ID").to_string();
        let client_secret = env!("GDRIVE_CLIENT_SECRET").to_string();

        let params = [
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("refresh_token", saved.refresh_token.as_str()),
            ("grant_type", "refresh_token"),
        ];

        let resp = client
            .post("https://oauth2.googleapis.com/token")
            .form(&params)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !resp.status().is_success() {
            return Err("Googleの認証が切れました。設定画面から再接続してください。".to_string());
        }

        let body: TokenRefreshResponse = resp.json().await.map_err(|e| e.to_string())?;
        let expires_at = body.expires_in.map(|s| chrono::Utc::now().timestamp() + s);

        saved.access_token = Some(body.access_token.clone());
        saved.expires_at = expires_at;

        let json = serde_json::to_string(&saved).map_err(|e| e.to_string())?;
        std::fs::write(&path, &json).map_err(|e| e.to_string())?;

        return Ok(body.access_token);
    }

    Ok(saved.access_token.unwrap())
}

/// Google Drive に接続しているユーザー情報を返す
pub async fn get_google_account(client: &Client) -> Result<GoogleAccountInfo, String> {
    let token = get_access_token(client).await?;
    let resp = client
        .get("https://www.googleapis.com/drive/v3/about")
        .query(&[("fields", "user")])
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("about.get failed: {}", resp.status()));
    }

    let body: DriveAboutResponse = resp.json().await.map_err(|e| e.to_string())?;
    body.user.ok_or_else(|| "Googleアカウント情報を取得できませんでした".to_string())
}

/// Drive 内の ore-no-fusen フォルダの file id を返す（なければ作成）
pub async fn ensure_folder(client: &Client, access_token: &str) -> Result<String, String> {
    let q = format!(
        "name='{}' and mimeType='application/vnd.google-apps.folder' and trashed=false",
        FOLDER_NAME
    );
    let resp: DriveFileList = client
        .get("https://www.googleapis.com/drive/v3/files")
        .bearer_auth(access_token)
        .query(&[("q", q.as_str()), ("fields", "files(id)")])
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    if let Some(folder) = resp.files.into_iter().next() {
        return Ok(folder.id);
    }

    // フォルダ作成
    let body = serde_json::json!({
        "name": FOLDER_NAME,
        "mimeType": "application/vnd.google-apps.folder"
    });
    #[derive(Deserialize)]
    struct CreatedFile { id: String }
    let created: CreatedFile = client
        .post("https://www.googleapis.com/drive/v3/files")
        .bearer_auth(access_token)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    Ok(created.id)
}

/// Drive の指定フォルダ内のファイルを名前で検索し、存在すれば id を返す
async fn find_file(
    client: &Client,
    access_token: &str,
    folder_id: &str,
    filename: &str,
) -> Result<Option<String>, String> {
    let q = format!(
        "'{}' in parents and name='{}' and trashed=false",
        folder_id, filename
    );
    let resp: DriveFileList = client
        .get("https://www.googleapis.com/drive/v3/files")
        .bearer_auth(access_token)
        .query(&[("q", q.as_str()), ("fields", "files(id)")])
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    Ok(resp.files.into_iter().next().map(|f| f.id))
}

/// JSON ファイルを Drive にアップロード（存在すれば更新、なければ新規作成）
pub async fn upload_json(
    client: &Client,
    access_token: &str,
    filename: &str,
    data: &serde_json::Value,
) -> Result<(), String> {
    let folder_id = ensure_folder(client, access_token).await?;
    let json_bytes = serde_json::to_vec(data).map_err(|e| e.to_string())?;

    if let Some(file_id) = find_file(client, access_token, &folder_id, filename).await? {
        // 既存ファイルを更新 (PATCH)
        let resp = client
            .patch(format!(
                "https://www.googleapis.com/upload/drive/v3/files/{}?uploadType=multipart",
                file_id
            ))
            .bearer_auth(access_token)
            .multipart(
                reqwest::multipart::Form::new()
                    .part(
                        "metadata",
                        reqwest::multipart::Part::text(
                            serde_json::json!({"name": filename}).to_string()
                        )
                        .mime_str("application/json")
                        .map_err(|e| e.to_string())?,
                    )
                    .part(
                        "file",
                        reqwest::multipart::Part::bytes(json_bytes)
                            .mime_str("application/json")
                            .map_err(|e| e.to_string())?,
                    ),
            )
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
            return Err(format!("Drive JSON update failed: {}", resp.status()));
        }
    } else {
        // 新規作成 (POST multipart)
        let metadata = serde_json::json!({
            "name": filename,
            "parents": [folder_id]
        });
        let resp = client
            .post("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart")
            .bearer_auth(access_token)
            .multipart(
                reqwest::multipart::Form::new()
                    .part(
                        "metadata",
                        reqwest::multipart::Part::text(metadata.to_string())
                            .mime_str("application/json")
                            .map_err(|e| e.to_string())?,
                    )
                    .part(
                        "file",
                        reqwest::multipart::Part::bytes(json_bytes)
                            .mime_str("application/json")
                            .map_err(|e| e.to_string())?,
                    ),
            )
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
            return Err(format!("Drive JSON create failed: {}", resp.status()));
        }
    }

    Ok(())
}

/// バイナリファイル（画像等）を Drive にアップロード（存在すれば更新、なければ新規作成）
pub async fn upload_binary(
    client: &Client,
    access_token: &str,
    filename: &str,
    bytes: Vec<u8>,
    mime_type: &str,
) -> Result<(), String> {
    let folder_id = ensure_folder(client, access_token).await?;

    if let Some(file_id) = find_file(client, access_token, &folder_id, filename).await? {
        let resp = client
            .patch(format!(
                "https://www.googleapis.com/upload/drive/v3/files/{}?uploadType=multipart",
                file_id
            ))
            .bearer_auth(access_token)
            .multipart(
                reqwest::multipart::Form::new()
                    .part("metadata", reqwest::multipart::Part::text(
                        serde_json::json!({"name": filename}).to_string()
                    ).mime_str("application/json").map_err(|e| e.to_string())?)
                    .part("file", reqwest::multipart::Part::bytes(bytes)
                        .mime_str(mime_type).map_err(|e| e.to_string())?)
            )
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
            return Err(format!("Drive binary update failed: {}", resp.status()));
        }
    } else {
        let metadata = serde_json::json!({ "name": filename, "parents": [folder_id] });
        let resp = client
            .post("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart")
            .bearer_auth(access_token)
            .multipart(
                reqwest::multipart::Form::new()
                    .part("metadata", reqwest::multipart::Part::text(metadata.to_string())
                        .mime_str("application/json").map_err(|e| e.to_string())?)
                    .part("file", reqwest::multipart::Part::bytes(bytes)
                        .mime_str(mime_type).map_err(|e| e.to_string())?)
            )
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
            return Err(format!("Drive binary create failed: {}", resp.status()));
        }
    }

    Ok(())
}

/// Drive から JSON ファイルをダウンロードして serde_json::Value で返す
/// フォルダを指定せず Drive 全体から名前で検索する（PWA はルート直下に保存するため）
pub async fn download_json(
    client: &Client,
    access_token: &str,
    filename: &str,
) -> Result<serde_json::Value, String> {
    let q = format!("name='{}' and trashed=false", filename);
    let resp: DriveFileList = client
        .get("https://www.googleapis.com/drive/v3/files")
        .bearer_auth(access_token)
        .query(&[("q", q.as_str()), ("fields", "files(id)")])
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let file_id = resp.files.into_iter()
        .next()
        .ok_or_else(|| format!("File not found: {}", filename))?
        .id;

    let body = client
        .get(format!(
            "https://www.googleapis.com/drive/v3/files/{}?alt=media",
            file_id
        ))
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;

    serde_json::from_slice(&body).map_err(|e| e.to_string())
}

/// 新ファイル名で試み、見つからなければ旧ファイル名にフォールバックして移行する
/// 旧ファイルが見つかった場合は新名でアップロードして以降は新名で読まれるようにする
pub async fn download_json_with_migration(
    client: &Client,
    access_token: &str,
    new_name: &str,
    old_name: &str,
) -> Result<serde_json::Value, String> {
    match download_json(client, access_token, new_name).await {
        Ok(v) => Ok(v),
        Err(e) if e.contains("File not found") => {
            // 旧ファイル名で試みる
            match download_json(client, access_token, old_name).await {
                Ok(v) => {
                    // 新名に移行（バックグラウンド・失敗しても無視）
                    let c2 = client.clone();
                    let t2 = access_token.to_string();
                    let n2 = new_name.to_string();
                    let v2 = v.clone();
                    tokio::spawn(async move {
                        let _ = upload_json(&c2, &t2, &n2, &v2).await;
                    });
                    Ok(v)
                }
                Err(_) => Err(format!("File not found: {}", new_name)),
            }
        }
        Err(e) => Err(e),
    }
}

/// Drive からバイナリファイルをダウンロードして Vec<u8> で返す
/// ファイル未存在時: Err("File not found: {filename}")
/// 検索スコープ: Drive 全体（download_json と同じ実装方針）
pub async fn download_binary(
    client: &Client,
    access_token: &str,
    filename: &str,
) -> Result<Vec<u8>, String> {
    let q = format!("name='{}' and trashed=false", filename);
    let resp: DriveFileList = client
        .get("https://www.googleapis.com/drive/v3/files")
        .bearer_auth(access_token)
        .query(&[("q", q.as_str()), ("fields", "files(id)")])
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let file_id = resp
        .files
        .into_iter()
        .next()
        .ok_or_else(|| format!("File not found: {}", filename))?
        .id;

    let bytes = client
        .get(format!(
            "https://www.googleapis.com/drive/v3/files/{}?alt=media",
            file_id
        ))
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;

    Ok(bytes.to_vec())
}

/// Drive からファイルを削除する（ファイルが存在しない場合は無視）
pub async fn delete_file_by_name(
    client: &Client,
    access_token: &str,
    filename: &str,
) -> Result<(), String> {
    let q = format!("name='{}' and trashed=false", filename);
    let resp: DriveFileList = client
        .get("https://www.googleapis.com/drive/v3/files")
        .bearer_auth(access_token)
        .query(&[("q", q.as_str()), ("fields", "files(id)")])
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let file_id = match resp.files.into_iter().next() {
        Some(f) => f.id,
        None => return Ok(()), // 存在しなければ無視
    };
    let resp = client
        .delete(format!("https://www.googleapis.com/drive/v3/files/{}", file_id))
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() && resp.status().as_u16() != 404 {
        return Err(format!("Drive delete failed: {}", resp.status()));
    }
    Ok(())
}

/// Drive の ore-no-fusen フォルダに残った一時メディアファイルを列挙する。
pub async fn list_temp_media_files(
    client: &Client,
    access_token: &str,
) -> Result<Vec<DriveTempMediaFile>, String> {
    let folder_id = ensure_folder(client, access_token).await?;
    let q = format!("'{}' in parents and trashed=false", folder_id);
    let resp: DriveFileDetailList = client
        .get("https://www.googleapis.com/drive/v3/files")
        .bearer_auth(access_token)
        .query(&[
            ("q", q.as_str()),
            ("fields", "files(id,name,modifiedTime,size)"),
            ("pageSize", "1000"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    Ok(resp
        .files
        .into_iter()
        .filter(|f| f.name.starts_with("fusen_img_") || f.name.starts_with("fusen_video_"))
        .map(|f| DriveTempMediaFile {
            id: f.id,
            name: f.name,
            modified_time: f.modified_time,
            size: f.size.and_then(|s| s.parse::<u64>().ok()),
        })
        .collect())
}

pub async fn delete_file_by_id(
    client: &Client,
    access_token: &str,
    file_id: &str,
) -> Result<(), String> {
    let resp = client
        .delete(format!("https://www.googleapis.com/drive/v3/files/{}", file_id))
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() && resp.status().as_u16() != 404 {
        return Err(format!("Drive delete failed: {}", resp.status()));
    }
    Ok(())
}

pub async fn download_binary_by_id(
    client: &Client,
    access_token: &str,
    file_id: &str,
) -> Result<Vec<u8>, String> {
    let bytes = client
        .get(format!(
            "https://www.googleapis.com/drive/v3/files/{}?alt=media",
            file_id
        ))
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;
    Ok(bytes.to_vec())
}

/// push_config を Drive からダウンロードして AppState.pro_configs に設定する
/// 新スキーマ: { "devices": [...] }
/// 旧スキーマ後方互換: { "endpoint": "...", "keys": {...} }
pub async fn poll_push_config(
    client: &Client,
    state: &Mutex<AppState>,
) -> Result<(), String> {
    let token = get_access_token(client).await?;
    let value = download_json_with_migration(client, &token, PUSH_CONFIG_FILE, "fusen_push_config.json").await?;

    let config: PushConfigJson = serde_json::from_value(value)
        .map_err(|e| format!("push_config parse error: {}", e))?;

    let pro_configs: Vec<ProConfig> = if let Some(devices) = config.devices {
        // 新スキーマ: devices 配列
        devices.into_iter().map(|d| ProConfig {
            push_endpoint: d.endpoint,
            p256dh: d.keys.p256dh,
            auth: d.keys.auth,
            device_id: d.device_id,
            device_name: d.device_name,
            google_account_email: d.google_account_email,
        }).collect()
    } else if let (Some(endpoint), Some(keys)) = (config.endpoint, config.keys) {
        // 旧スキーマ後方互換: 単一デバイスとして扱う
        vec![ProConfig {
            push_endpoint: endpoint,
            p256dh: keys.p256dh,
            auth: keys.auth,
            device_id: Some("legacy".to_string()),
            device_name: Some("legacy".to_string()),
            google_account_email: None,
        }]
    } else {
        return Err("push_config: デバイス情報が見つかりませんでした".to_string());
    };

    state
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .pro_configs = pro_configs;

    Ok(())
}

/// Drive から push_devices.json を読み込み、デバイス一覧を返す
pub async fn list_push_devices(client: &Client) -> Result<Vec<PushDeviceInfo>, String> {
    let token = get_access_token(client).await?;
    let value = download_json_with_migration(client, &token, PUSH_CONFIG_FILE, "fusen_push_config.json").await?;

    let config: PushConfigJson = serde_json::from_value(value)
        .map_err(|e| format!("push_config parse error: {}", e))?;

    let devices = config.devices.unwrap_or_default();
    Ok(devices.into_iter().enumerate().map(|(i, d)| PushDeviceInfo {
        device_id: d.device_id.unwrap_or_else(|| format!("device_{}", i)),
        endpoint: d.endpoint,
        registered_at: d.registered_at.unwrap_or_default(),
        device_name: d.device_name,
        google_account_email: d.google_account_email,
        google_account_name: d.google_account_name,
        google_account_photo: d.google_account_photo,
    }).collect())
}

pub async fn list_pc_devices(client: &Client) -> Result<Vec<PcDeviceInfo>, String> {
    let token = get_access_token(client).await?;
    let value = match download_json(client, &token, PC_DEVICES_FILE).await {
        Ok(value) => value,
        Err(e) if e.contains("File not found") => return Ok(Vec::new()),
        Err(e) => return Err(e),
    };
    let parsed: PcDevicesJson = serde_json::from_value(value)
        .map_err(|e| format!("pc_devices parse error: {}", e))?;
    Ok(parsed.pcs.unwrap_or_default())
}

pub async fn register_pc_device(client: &Client) -> Result<PcDeviceInfo, String> {
    let token = get_access_token(client).await?;
    let mut pc = load_or_create_pc_device()?;
    pc.updated_at = chrono::Utc::now().to_rfc3339();
    if let Ok(account) = get_google_account(client).await {
        pc.google_account_email = account.email_address;
    }

    let mut pcs = match download_json(client, &token, PC_DEVICES_FILE).await {
        Ok(value) => serde_json::from_value::<PcDevicesJson>(value)
            .map_err(|e| format!("pc_devices parse error: {}", e))?
            .pcs
            .unwrap_or_default(),
        Err(e) if e.contains("File not found") => Vec::new(),
        Err(e) => return Err(e),
    };

    if let Some(existing) = pcs.iter_mut().find(|existing| existing.pc_id == pc.pc_id) {
        *existing = pc.clone();
    } else {
        pcs.push(pc.clone());
    }
    upload_json(client, &token, PC_DEVICES_FILE, &serde_json::json!({ "pcs": pcs })).await?;
    // pc_id は settings.json に保存済み（load_or_create_pc_device 内）。updated_at / email は Drive 上で管理。
    Ok(pc)
}

/// pc_devices.json から特定 PC を削除して Drive に書き戻す
pub async fn delete_pc_device_by_id(client: &Client, pc_id: &str) -> Result<(), String> {
    let token = get_access_token(client).await?;

    let mut pcs = match download_json(client, &token, PC_DEVICES_FILE).await {
        Ok(value) => serde_json::from_value::<PcDevicesJson>(value)
            .map_err(|e| format!("pc_devices parse error: {}", e))?
            .pcs
            .unwrap_or_default(),
        Err(e) if e.contains("File not found") => Vec::new(),
        Err(e) => return Err(e),
    };

    let before = pcs.len();
    pcs.retain(|p| p.pc_id != pc_id);
    if pcs.len() == before {
        // 削除対象が無い場合もエラーにはしない（既に消えている）
        return Ok(());
    }
    upload_json(client, &token, PC_DEVICES_FILE, &serde_json::json!({ "pcs": pcs })).await?;
    Ok(())
}

/// push_devices.json から特定デバイスを削除して Drive に書き戻す
pub async fn delete_push_device(client: &Client, device_id: &str) -> Result<(), String> {
    let token = get_access_token(client).await?;
    let mut value = download_json_with_migration(client, &token, PUSH_CONFIG_FILE, "fusen_push_config.json").await?;

    if let Some(devices) = value.get_mut("devices").and_then(|d| d.as_array_mut()) {
        devices.retain(|d| d.get("device_id").and_then(|id| id.as_str()) != Some(device_id));
    }

    upload_json(client, &token, PUSH_CONFIG_FILE, &value).await
}

/// push_devices.json の全デバイスを削除して Drive に書き戻す
pub async fn delete_all_push_devices(client: &Client) -> Result<(), String> {
    let token = get_access_token(client).await?;
    upload_json(client, &token, PUSH_CONFIG_FILE, &serde_json::json!({"devices": []})).await
}

// ------ Unit Tests ------
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_token_path_returns_valid_path() {
        let path = get_token_path();
        assert!(path.to_string_lossy().contains("ore-no-fusen"));
        assert!(path.to_string_lossy().ends_with("gdrive_token.json"));
    }

    #[test]
    fn test_push_config_json_parses_to_pro_config() {
        let json_str = r#"{"endpoint":"https://api.push.apple.com/3/device/ABC","keys":{"p256dh":"BNcR","auth":"tBy8"},"created_at":"2026-01-01T00:00:00Z"}"#;
        let config: PushConfigJson = serde_json::from_str(json_str).unwrap();
        assert_eq!(config.endpoint.unwrap(), "https://api.push.apple.com/3/device/ABC");
        let keys = config.keys.unwrap();
        assert_eq!(keys.p256dh, "BNcR");
        assert_eq!(keys.auth, "tBy8");
    }
}
