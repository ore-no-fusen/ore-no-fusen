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
const PUSH_CONFIG_FILE: &str = "fusen_push_config.json";
#[allow(dead_code)]
const NOTE_FILE: &str = "fusen_note.json";
const TOKEN_FILE: &str = "gdrive_token.json";

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
struct PushConfigJson {
    // 新スキーマ: devices 配列
    devices: Option<Vec<DeviceEntry>>,
    // 旧スキーマ後方互換: endpoint 直下
    endpoint: Option<String>,
    keys: Option<PushConfigKeys>,
}

#[derive(Deserialize)]
struct DeviceEntry {
    endpoint: String,
    keys: PushConfigKeys,
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
        client
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
    } else {
        // 新規作成 (POST multipart)
        let metadata = serde_json::json!({
            "name": filename,
            "parents": [folder_id]
        });
        client
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
    client
        .delete(format!("https://www.googleapis.com/drive/v3/files/{}", file_id))
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// push_config を Drive からダウンロードして AppState.pro_configs に設定する
/// 新スキーマ: { "devices": [...] }
/// 旧スキーマ後方互換: { "endpoint": "...", "keys": {...} }
pub async fn poll_push_config(
    client: &Client,
    state: &Mutex<AppState>,
) -> Result<(), String> {
    let token = get_access_token(client).await?;
    let value = download_json(client, &token, PUSH_CONFIG_FILE).await?;

    let config: PushConfigJson = serde_json::from_value(value)
        .map_err(|e| format!("push_config parse error: {}", e))?;

    let pro_configs: Vec<ProConfig> = if let Some(devices) = config.devices {
        // 新スキーマ: devices 配列
        devices.into_iter().map(|d| ProConfig {
            push_endpoint: d.endpoint,
            p256dh: d.keys.p256dh,
            auth: d.keys.auth,
        }).collect()
    } else if let (Some(endpoint), Some(keys)) = (config.endpoint, config.keys) {
        // 旧スキーマ後方互換: 単一デバイスとして扱う
        vec![ProConfig {
            push_endpoint: endpoint,
            p256dh: keys.p256dh,
            auth: keys.auth,
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
