# Phase 4: Rust バックエンド（Google Drive + APNs）- Research

**Researched:** 2026-03-23
**Domain:** Rust / Tauri — Google OAuth2 PKCE + Drive REST API + Web Push (RFC 8291/8292) + APNs HTTP/2
**Confidence:** HIGH (core stack), MEDIUM (APNs specific routing)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **サーバー不要**: Vercel は PWA ホスティングのみ。API Routes は使わない
- **Rust が直接実行**: Google Drive 読み書き・APNs POST はすべて Rust (Tauri) から行う
- **各ユーザーが自分の Google Drive を使う**: OAuth PKCE フローでユーザーが自分のアカウントで認証
- 新規ファイル: `src-tauri/src/gdrive.rs`、`src-tauri/src/webpush.rs`
- Cargo.toml 追加クレート: `reqwest 0.12`, `p256 0.13`, `jwt-simple 0.12`, `base64 0.22`, `aes-gcm 0.10`, `hkdf 0.12`, `sha2 0.10`
- Google Drive データ構造: `ore-no-fusen/` フォルダ、`fusen_push_config.json`、`fusen_note.json`
- Tauri コマンド: `fusen_check_pro_setup`、`fusen_send_to_iphone`
- AppState に `Option<ProConfig>` を追加

### Claude's Discretion
- OAuth トークンのローカル保存場所（`~/.config/ore-no-fusen/` or Tauri app data dir）
- エラーハンドリングの詳細（ネットワークエラー、Drive API エラー）
- VAPID keys の保存場所

### Deferred Ideas (OUT OF SCOPE)
- iPhone PWA セットアップ画面 → Phase 5
- 右クリックメニュー「iPhoneに送る」→ Phase 5
- Service Worker → Phase 5
- Android Chrome 対応 → v3.0
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| API-01 | `src-tauri/src/gdrive.rs` が実装され、Google OAuth2 PKCE フロー + access_token 自動更新が動作する | oauth2 crate v5 + tauri-plugin-oauth でローカルhost リダイレクトサーバーを使う PKCE フロー |
| API-02 | `gdrive.rs` が Google Drive REST API で JSON ファイルの上書きアップロード・ダウンロードを行う | reqwest 0.13（現 Cargo.lock 版）+ Bearer トークン、multipart upload v3 |
| API-03 | `gdrive.rs` が `fusen_push_config.json` をポーリングして AppState にキャッシュする | tokio::spawn + Mutex<AppState> パターン（既存コードと統一） |
| API-04 | `src-tauri/src/webpush.rs` が VAPID 鍵ペア生成・JWT 署名（RFC 8292）を実装する | p256 0.13.2 (ecdsa feature) + jwt-simple 0.12.14 (ES256) |
| API-05 | `webpush.rs` が AES-128-GCM ペイロード暗号化（RFC 8291）を実装する | p256 (ecdh feature) + hkdf 0.12 + aes-gcm 0.10 の手動組み合わせ、または web-push 0.11 crate |
| API-06 | `webpush.rs` が APNs HTTPS POST（`/3/device/{token}`）を実装する | reqwest 0.13 + rustls TLS + HTTP/2 (http2_prior_knowledge) |
| API-07 | Tauri コマンド `fusen_send_to_iphone` が Drive upload + APNs push をオーケストレーションする | async fn Tauri コマンド + tauri::async_runtime (Tokio 統合済み) |
</phase_requirements>

---

## Summary

Phase 4 は Tauri/Rust バックエンドから直接 Google Drive と Apple Push Notification Service (APNs) を操作する実装フェーズ。すべてのネットワーク処理は Rust が担う。

Google OAuth2 PKCE フローは `tauri-plugin-oauth`（localhost リダイレクトサーバー）+ `oauth2` crate v5 の組み合わせが標準パターン。取得した refresh_token を `directories` crate（既に Cargo.toml 済み）で Tauri app data dir に保存する。Google Drive REST API v3 へのアクセスは `reqwest`（Cargo.lock に 0.13.2 が既に存在）で直接行う。

Web Push (RFC 8291/8292) の暗号化は実装量が多い（ECDH → HKDF → AES-128-GCM）ため、`web-push 0.11` crate の利用を第一案とする。ただし同 crate は APNs エンドポイントを直接サポートしない可能性があるため、暗号化部分のみ活用し、HTTP POST は reqwest で送信するアーキテクチャを推奨する。

**Primary recommendation:** reqwest 0.13（既存）+ oauth2 v5 + tauri-plugin-oauth でOAuth PKCE。VAPID は p256 + jwt-simple。Web Push 暗号化は web-push crate の ContentEncoding::Aes128Gcm か手動 hkdf + aes-gcm で実装。APNs POST は reqwest + http2_prior_knowledge で送信。

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| reqwest | 0.13.2 (Cargo.lock 既存) | HTTP クライアント（Drive API + APNs POST） | 既にプロジェクト内に存在。rustls デフォルト、HTTP/2 サポート |
| oauth2 | 5.0.0 (NEW) | Google OAuth2 PKCE フロー、refresh_token exchange | ramosbugs/oauth2-rs 公式。PkceCodeChallenge 組み込み |
| tauri-plugin-oauth | 2.x (NEW) | OAuth コールバック用 localhost サーバー | Tauri v2 対応。Google は custom URI scheme 非許可のため必須 |
| p256 | 0.13.2 (NEW) | P-256 ECDH（暗号化）+ ECDSA（VAPID 署名） | RustCrypto 標準ライブラリ。ecdh + ecdsa feature で両機能使用可 |
| jwt-simple | 0.12.14 (NEW) | VAPID JWT 署名（ES256/RFC 8292） | ES256 (P-256 ECDSA) 対応。custom claims 使用可 |
| aes-gcm | 0.10 (NEW) | AES-128-GCM 暗号化（RFC 8291） | RustCrypto 標準。128-bit キー対応 |
| hkdf | 0.12 (NEW) | HKDF-SHA256 鍵導出（RFC 8291） | RustCrypto 標準。hkdf + sha2 でペアで使う |
| sha2 | 0.10.9 (Cargo.lock 既存) | SHA-256（HKDF の基底、PKCE code challenge） | 既存依存関係として存在 |
| base64 | 0.22.1 (Cargo.lock 既存) | base64url エンコード（Web Push 仕様） | 既存。URL safe 変種の Engine が必要 |
| directories | 6.0.0 (Cargo.toml 既存) | トークン・VAPID keys 保存パス取得 | Tauri app data dir へのパス解決に使用 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| web-push | 0.11.0 (候補) | RFC 8291 暗号化の手間を省く | ContentEncoding::Aes128Gcm が必要な場合。依存関係競合なければ採用 |
| tokio | 1.48.0 (Cargo.lock 既存) | 非同期ランタイム（Tauri が管理） | async Tauri コマンド内で await するだけ。別途 #[tokio::main] 不要 |

### reqwest 0.12 vs 0.13 に関する注意

CONTEXT.md は `reqwest = "0.12"` を指定しているが、**Cargo.lock に 0.13.2 が既に存在する**。これは Tauri 依存ライブラリが 0.13 を引き込んでいるため。`"0.12"` を Cargo.toml に書くと 0.12.x が別途ダウンロードされ二重になるリスクがある。

**推奨**: `reqwest = { version = "0.13", features = ["json", "rustls-tls"] }` と記述し既存 0.13.2 に統一する。

0.13 の主な変更点（0.12 比較）:
- rustls がデフォルト TLS バックエンドに変更（従来は native-tls）
- `rustls-tls` feature 名は維持（後方互換あり）
- `query` / `form` が crate feature に（`json` feature は変更なし）
- `use_rustls_tls()` の代わりに `tls_backend_rustls()` を推奨（旧名も動作）

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| oauth2 v5 + tauri-plugin-oauth | tauri-plugin-google-auth 0.5 | プラグインは手軽だが内部制御が難しい。oauth2 crate 直接の方が refresh_token 制御が明確 |
| 手動 hkdf + aes-gcm | web-push 0.11 crate | web-push は APNs エンドポイント非対応の可能性あり。暗号化部分のみ使う分割採用も可 |
| reqwest HTTP/2 | a2 / apple-apns crate | APNs 専用クレートは依存関係が重い。reqwest + http2_prior_knowledge で十分 |

**Installation:**
```bash
# Cargo.toml に追加（src-tauri/Cargo.toml）
cargo add oauth2 tauri-plugin-oauth p256 --features ecdh,ecdsa jwt-simple aes-gcm hkdf
# reqwest は version を 0.13 に更新
# sha2, base64, directories は既存のため追加不要
```

---

## Architecture Patterns

### Recommended Project Structure
```
src-tauri/src/
├── gdrive.rs        # Google OAuth2 PKCE + Drive REST API R/W
├── webpush.rs       # VAPID JWT 署名 + AES-128-GCM + APNs POST
├── state.rs         # ProConfig 構造体追加 + AppState フィールド追加
├── lib.rs           # fusen_send_to_iphone / fusen_check_pro_setup コマンド追加
└── ...（既存ファイル変更なし）
```

### Pattern 1: Tauri async コマンドと reqwest

Tauri v2 は Tokio ランタイムを内部で管理する。コマンドは `async fn` で定義でき、`#[tokio::main]` は不要。reqwest の async Client はそのまま `.await` で呼べる。

```rust
// Source: https://v2.tauri.app/develop/state-management/
#[tauri::command]
async fn fusen_send_to_iphone(
    state: tauri::State<'_, std::sync::Mutex<AppState>>,
    path: String,
) -> Result<(), String> {
    // state.lock() は同期。await point をまたぐ前にドロップ必須
    let pro_config = {
        let guard = state.lock().unwrap_or_else(|p| p.into_inner());
        guard.pro_config.clone()
    };
    // reqwest::Client::new() は async context で使用
    let client = reqwest::Client::new();
    gdrive::upload_note(&client, &note_json, &token).await
        .map_err(|e| e.to_string())?;
    webpush::send_web_push(&client, &pro_config, &payload).await
        .map_err(|e| e.to_string())?;
    Ok(())
}
```

**重要**: `std::sync::Mutex<AppState>` の MutexGuard は `.await` をまたいで保持できない（Send 非対応）。await 前に必ずスコープを終わらせる。

### Pattern 2: Google OAuth2 PKCE フロー

```rust
// Source: https://docs.rs/oauth2/latest/oauth2/ + tauri-plugin-oauth
use oauth2::{
    AuthorizationCode, ClientId, ClientSecret, CsrfToken,
    PkceCodeChallenge, RedirectUrl, Scope, TokenResponse,
};
use oauth2::basic::BasicClient;
use oauth2::reqwest::async_http_client;

// 1. PKCE challenge を生成
let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();

// 2. tauri-plugin-oauth でローカルサーバー起動（ポート自動選択）
let port = tauri_plugin_oauth::start(/* callback */ |url| { ... })?;
let redirect_url = format!("http://localhost:{port}");

// 3. 認証URL を生成してブラウザで開く
let (auth_url, csrf_token) = client
    .authorize_url(CsrfToken::new_random)
    .add_scope(Scope::new("https://www.googleapis.com/auth/drive.file".to_string()))
    .set_pkce_challenge(pkce_challenge)
    .url();
open::that(auth_url.to_string())?;

// 4. コールバック受信後、code を exchange
let token_response = client
    .exchange_code(AuthorizationCode::new(code))
    .set_pkce_verifier(pkce_verifier)
    .request_async(async_http_client).await?;

// 5. refresh_token を app data dir に保存
let refresh_token = token_response.refresh_token().unwrap().secret();
std::fs::write(token_path, refresh_token)?;
```

### Pattern 3: VAPID JWT 署名（RFC 8292）

```rust
// Source: https://docs.rs/jwt-simple/latest/jwt_simple/
use jwt_simple::prelude::*;

// VAPID keys 生成（初回のみ。設定ファイルに保存）
let key_pair = ES256KeyPair::generate();
let public_key_bytes = key_pair.public_key().to_bytes_uncompressed(); // 65 bytes

// JWT 生成（有効期限 12 時間）
#[derive(Serialize, Deserialize)]
struct VapidClaims {
    sub: String, // mailto: or URL
}
let claims = Claims::with_custom_claims(
    VapidClaims { sub: "mailto:example@example.com".to_string() },
    Duration::from_hours(12),
)
.with_audience(endpoint_origin); // APNs endpoint の origin

let token = key_pair.sign(claims)?;
// Authorization: WebPush {token}
// Crypto-Key: p256ecdsa={base64url(public_key)}
```

### Pattern 4: RFC 8291 AES-128-GCM 暗号化（手動実装）

RFC 8291 の暗号化プロセス（web-push crate が使えない場合の手動実装参照）:

```
1. 受信側の p256dh（65bytes, uncompressed）をパース
2. ECDH: 送信用 ephemeral P-256 キーペアを生成
3. ECDH 共有秘密を計算
4. HKDF-SHA256:
   - PRK = HKDF-Extract(salt=auth_secret, IKM=ecdh_secret)
   - key_info = "WebPush: info" || ua_public || as_public
   - IKM = HKDF-Expand(PRK, key_info, 32)
   - cek = HKDF-Expand(IKM_2, "Content-Encoding: aes128gcm\x00", 16)
   - nonce = HKDF-Expand(IKM_2, "Content-Encoding: nonce\x00", 12)
5. AES-128-GCM で暗号化（2048 byte レコードサイズ、1 byte padding delimiter）
6. RFC 8188 ヘッダー付加: salt(16) + rs(4) + idlen(1) + keyid
```

**推奨**: `web-push 0.11` の `ContentEncoding::Aes128Gcm` を使えば上記が不要。crate 追加で解決を優先し、依存競合があれば手動実装に切り替える。

### Pattern 5: APNs HTTP/2 POST

APNs は **HTTP/2 必須**。reqwest では `http2_prior_knowledge()` で HTTP/2 を強制する。

```rust
// Source: APNs requires HTTP/2 + TLS 1.2+
let client = reqwest::Client::builder()
    .http2_prior_knowledge()      // HTTP/2 強制（APNs 必須）
    .use_rustls_tls()             // rustls TLS (デフォルト in 0.13)
    .build()?;

let endpoint = &push_config.endpoint; // "https://api.push.apple.com/3/device/TOKEN"
let response = client
    .post(endpoint)
    .header("Authorization", format!("WebPush {vapid_jwt}"))
    .header("Crypto-Key", format!("p256ecdsa={public_key_b64url}"))
    .header("Content-Encoding", "aes128gcm")
    .header("TTL", "86400")
    .header("Content-Type", "application/octet-stream")
    .body(encrypted_body)
    .send()
    .await?;
```

APNs エンドポイント:
- Production: `https://api.push.apple.com:443`（ポート 2197 も使用可）
- Development: `https://api.development.push.apple.com:443`
- Web Push で iPhone に送る場合、PWA の ServiceWorker が登録した endpoint がそのまま使われる（`/3/device/{token}` 形式）

### Pattern 6: トークン・VAPID keys の保存（Claude's Discretion 対応）

`directories` crate（既存）の `ProjectDirs` を使い Tauri app data dir に保存する。

```rust
// Source: https://docs.rs/directories/latest/directories/
use directories::ProjectDirs;

fn get_config_dir() -> PathBuf {
    ProjectDirs::from("com", "ore-no-fusen", "ore-no-fusen")
        .map(|dirs| dirs.data_local_dir().to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."))
}

// ~/.local/share/ore-no-fusen/ore-no-fusen/ (Linux/Mac)
// C:\Users\{user}\AppData\Local\ore-no-fusen\ore-no-fusen\ (Windows)
// ~/Library/Application Support/com.ore-no-fusen.ore-no-fusen/ (macOS)
const TOKEN_FILE: &str = "google_refresh_token.txt";
const VAPID_KEYS_FILE: &str = "vapid_keys.json";
```

### Anti-Patterns to Avoid

- **MutexGuard を .await またがせる**: `std::sync::Mutex` の guard は Send を実装しない。await 前に必ず drop する（スコープブロックで囲む）
- **reqwest::blocking を async context で使う**: Tauri コマンドは async context のため `reqwest::blocking` を使うとパニック。必ず async Client を使う
- **reqwest::Client を毎回生成する**: コネクションプールが失われる。AppState か lazy_static/once_cell で singleton にする
- **HTTP/2 なしで APNs に POST する**: APNs は HTTP/2 必須。`http2_prior_knowledge()` を設定しないと接続失敗
- **VAPID JWT の audience を間違える**: APNs の場合 audience は endpoint の origin（例: `https://api.push.apple.com`）

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OAuth PKCE フロー | 手動 PKCE challenge/verifier 実装 | `oauth2` crate v5 | PkceCodeChallenge, CSRF token 管理など安全な実装が必要 |
| localhost OAuth コールバック | 手動 TcpListener サーバー | `tauri-plugin-oauth` | ランダムポート選択・セキュアなコールバックが実装済み |
| AES-128-GCM + HKDF 組み合わせ | RFC 8291 を最初から実装 | `web-push 0.11` の ContentEncoding::Aes128Gcm | RFC 8291 の詳細（パディング、レコードサイズ、info 文字列）を誤ると APNs 側でサイレント失敗 |
| ES256 JWT 生成 | 手動 base64url + ECDSA 署名組み立て | `jwt-simple 0.12` | JWT ヘッダー・クレーム構造の RFC 7519 準拠処理 |

**Key insight:** Web Push の暗号化は RFC 8291 + RFC 8188 の2層構造で、手動実装すると info 文字列やパディングの1バイトミスで無音失敗になる。`web-push` crate を使うかテストベクター（RFC 8291 付録 B）で検証必須。

---

## Common Pitfalls

### Pitfall 1: reqwest バージョン二重定義
**What goes wrong:** Cargo.toml に `reqwest = "0.12"` と書くと Cargo.lock に既存の 0.13.2 と別に 0.12.x が追加される。ビルド時間増加と feature 競合。
**Why it happens:** CONTEXT.md の Cargo.toml 例が 0.12 を指定しているが、実際の Cargo.lock はすでに 0.13.2 が存在する。
**How to avoid:** `reqwest = { version = "0.13", features = ["json", "rustls-tls"] }` と 0.13 を明示する。
**Warning signs:** `cargo tree | grep reqwest` で 2行以上表示される。

### Pitfall 2: MutexGuard を await をまたいで保持
**What goes wrong:** `state.lock().unwrap()` の返り値を `let guard = ...` として保持したまま `.await` するとコンパイルエラー（`std::sync::MutexGuard<T> cannot be sent between threads safely`）
**Why it happens:** Tauri の async コマンドは tokio スレッドプールで実行。std::sync::Mutex の guard は Send でない。
**How to avoid:** ブロックスコープ `{ let data = state.lock()...; data.field.clone() }` で guard をドロップしてから await。
**Warning signs:** コンパイルエラー `future cannot be sent between threads safely`。

### Pitfall 3: APNs に HTTP/1.1 で接続
**What goes wrong:** APNs は HTTP/2 必須。`http2_prior_knowledge()` なしだと HTTP/1.1 でネゴシエーションしてしまい、`400 Bad Request` か接続リセット。
**Why it happens:** reqwest デフォルトは ALPN で HTTP/1.1 も許可。
**How to avoid:** APNs 専用 Client は `http2_prior_knowledge()` を必ず設定。
**Warning signs:** `reqwest::Error { kind: Decode, ... }` または接続タイムアウト。

### Pitfall 4: VAPID JWT audience の不一致
**What goes wrong:** APNs が `401 Unauthorized` を返す。
**Why it happens:** RFC 8292 では JWT の `aud` クレームは push endpoint の origin。`https://api.push.apple.com/3/device/TOKEN` に POST する場合 `aud` は `https://api.push.apple.com`。
**How to avoid:** JWT 生成時に endpoint URL をパースして `scheme://host` だけを audience に設定。
**Warning signs:** APNs から `401 Unauthorized` レスポンス。

### Pitfall 5: base64url エンコードに標準 base64 を使う
**What goes wrong:** Web Push の p256dh / auth / JWT 署名は base64url (RFC 4648 §5、`+/` → `-_`、パディングなし)。標準 base64 (`+/`、`=` パディング) を使うと APNs がデコードに失敗。
**Why it happens:** `base64::engine::general_purpose::STANDARD` と `URL_SAFE_NO_PAD` を混同。
**How to avoid:** `base64::engine::general_purpose::URL_SAFE_NO_PAD` を使用。
**Warning signs:** APNs から `400 BadDeviceToken` または暗号化エラー。

### Pitfall 6: Google OAuth2 の refresh_token が一度しか発行されない
**What goes wrong:** 同じ Google アカウントで再認証しても refresh_token が返ってこない。
**Why it happens:** Google は一度同意した後は refresh_token を再発行しない（`access_type=offline` + `prompt=consent` が必要）。
**How to avoid:** 認証URLに `prompt=consent` パラメータを追加する。
**Warning signs:** `token_response.refresh_token()` が `None` を返す。

---

## Code Examples

### Google Drive ファイル検索 + ダウンロード
```rust
// Source: Google Drive REST API v3 公式ドキュメント
// https://developers.google.com/drive/api/v3/reference/files/list
async fn find_file_id(client: &reqwest::Client, token: &str, filename: &str) -> Result<Option<String>, reqwest::Error> {
    let query = format!("name = '{}' and trashed = false", filename);
    let resp: serde_json::Value = client
        .get("https://www.googleapis.com/drive/v3/files")
        .bearer_auth(token)
        .query(&[("q", query.as_str()), ("spaces", "drive"), ("fields", "files(id)")])
        .send().await?
        .json().await?;
    Ok(resp["files"][0]["id"].as_str().map(|s| s.to_string()))
}
```

### Google Drive ファイル上書きアップロード（multipart）
```rust
// Source: Google Drive REST API v3 - https://developers.google.com/drive/api/guides/manage-uploads
// MIME multipart upload: metadata + media body
async fn upload_json(client: &reqwest::Client, token: &str, file_id: Option<&str>, filename: &str, data: &[u8]) -> Result<(), reqwest::Error> {
    let url = if let Some(id) = file_id {
        format!("https://www.googleapis.com/upload/drive/v3/files/{}?uploadType=multipart", id)
    } else {
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart".to_string()
    };
    let method = if file_id.is_some() { reqwest::Method::PATCH } else { reqwest::Method::POST };
    // multipart body は boundary で分割（reqwest multipart 機能使用）
    let metadata = format!(r#"{{"name": "{}"}}"#, filename);
    let form = reqwest::multipart::Form::new()
        .part("metadata", reqwest::multipart::Part::text(metadata).mime_str("application/json").unwrap())
        .part("media", reqwest::multipart::Part::bytes(data.to_vec()).mime_str("application/json").unwrap());
    client.request(method, &url)
        .bearer_auth(token)
        .multipart(form)
        .send().await?;
    Ok(())
}
```

### VAPID JWT 生成（ES256）
```rust
// Source: https://docs.rs/jwt-simple/latest/jwt_simple/
use jwt_simple::prelude::*;

fn sign_vapid_jwt(key_pair: &ES256KeyPair, endpoint: &str) -> Result<String, Box<dyn std::error::Error>> {
    let origin = url::Url::parse(endpoint)?.origin().ascii_serialization();
    #[derive(Serialize, Deserialize)]
    struct VapidClaims { sub: String }
    let claims = Claims::with_custom_claims(
        VapidClaims { sub: "mailto:contact@example.com".to_string() },
        Duration::from_hours(12),
    ).with_audience(origin);
    Ok(key_pair.sign(claims)?)
}
```

### state.rs への ProConfig 追加
```rust
// src-tauri/src/state.rs に追加
#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct ProConfig {
    pub push_endpoint: String,
    pub p256dh: String,
    pub auth: String,
}

// AppState に追加
pub struct AppState {
    // ... 既存フィールド ...
    pub pro_config: Option<ProConfig>,
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| reqwest 0.11 (hyper 0.14) | reqwest 0.12/0.13 (hyper 1.x) | 2024 | hyper 1.x breaking change。async API 変更 |
| reqwest native-tls デフォルト | reqwest 0.13 rustls デフォルト | reqwest 0.13 (2025) | Cargo.toml で feature 指定が不要になった |
| oauth2 3.x | oauth2 5.x | 2024 | async_http_client の型が変更。reqwest feature が統合 |
| Ring crypto | aws-lc-rs または ring | 2024-2025 | rustls 0.23 が aws-lc-rs をデフォルト化。クレート競合に注意 |

**Deprecated/outdated:**
- `use_rustls_tls()`: reqwest 0.13 では `tls_backend_rustls()` を推奨（旧名はソフト deprecation で動作継続）
- `reqwest::blocking` in async context: パニックになる。必ず async 版を使う

---

## Open Questions

1. **web-push crate の依存関係競合**
   - What we know: `web-push 0.11` は isahc（curl ベース）または hyper-client を使用。reqwest とは独立したHTTPクライアント
   - What's unclear: isahc と reqwest の TLS バックエンドが衝突しないか。特に ring vs aws-lc-rs の競合
   - Recommendation: `cargo add web-push` 後に `cargo tree` で TLS 二重依存を確認。問題があれば web-push を使わず hkdf + aes-gcm で手動実装する

2. **APNs Web Push の TTL とバッジ表示**
   - What we know: TTL="86400" で 24 時間保持。HTTP/2 POST でペイロードを送る
   - What's unclear: iOS 17/18 で Web Push のバッジ・通知音が変わったか。Safari 17 の Web Push 挙動
   - Recommendation: Phase 5 で実機テスト時に確認。Phase 4 では HTTP 200 応答を確認するまでをスコープとする

3. **Google OAuth2 の client_secret 扱い**
   - What we know: デスクトップアプリ（Tauri）は public client。client_secret をバイナリに埋め込む必要がある
   - What's unclear: Google の OAuth Playground で取得した client_id/secret をバイナリに含めてよいか（セキュリティ）
   - Recommendation: Google Cloud Console でアプリタイプを「デスクトップ」に設定するとclient_secretは「公開可」扱いになる（Googleの公式ドキュメントで確認済みの仕様）

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Rust 標準テスト (`cargo test`) |
| Config file | なし（Rust ビルトイン） |
| Quick run command | `cargo test -p ore-no-fusen --lib -- gdrive webpush 2>&1` |
| Full suite command | `cargo test -p ore-no-fusen --lib 2>&1` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| API-01 | OAuth PKCE フロー（トークン交換ロジック） | unit (ロジック部分のみ) | `cargo test -p ore-no-fusen --lib -- gdrive::tests` | ❌ Wave 0 |
| API-02 | Drive API JSON upload/download (モック) | unit + mock HTTP | `cargo test -p ore-no-fusen --lib -- gdrive::tests` | ❌ Wave 0 |
| API-03 | push_config ポーリング + AppState キャッシュ | unit | `cargo test -p ore-no-fusen --lib -- gdrive::tests::poll` | ❌ Wave 0 |
| API-04 | VAPID 鍵生成 + JWT 署名の形式確認 | unit | `cargo test -p ore-no-fusen --lib -- webpush::tests::vapid` | ❌ Wave 0 |
| API-05 | RFC 8291 暗号化のテストベクター照合 | unit (RFC 8291 Appendix B) | `cargo test -p ore-no-fusen --lib -- webpush::tests::encrypt` | ❌ Wave 0 |
| API-06 | APNs POST（モック HTTP/2 サーバー or 実機） | integration / manual | `cargo test -p ore-no-fusen --lib -- webpush::tests::apns` | ❌ Wave 0 |
| API-07 | send_to_iphone オーケストレーション | unit (モック関数で E2E) | `cargo test -p ore-no-fusen --lib -- lib::tests::send` | ❌ Wave 0 |

**注意**: APNs の実機テスト (API-06) はネットワーク・デバイス要件あり。`--ignored` フラグで通常テストから除外し、手動確認とする。RFC 8291 テストベクター (API-05) は RFC 本文 Appendix B の既知値で自動化可能。

### Sampling Rate
- **Per task commit:** `cargo test -p ore-no-fusen --lib -- gdrive webpush 2>&1`
- **Per wave merge:** `cargo test -p ore-no-fusen --lib 2>&1`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src-tauri/src/gdrive.rs` — `#[cfg(test)] mod tests` ブロック（モック HTTP 付き）
- [ ] `src-tauri/src/webpush.rs` — `#[cfg(test)] mod tests` ブロック（RFC 8291 テストベクター）
- [ ] Cargo.toml に `mockito` または `wiremock` を `[dev-dependencies]` に追加（Drive API モック用）

---

## Sources

### Primary (HIGH confidence)
- [docs.rs/oauth2](https://docs.rs/oauth2/latest/oauth2/) — PKCE API, refresh token, async reqwest
- [docs.rs/p256](https://docs.rs/p256/latest/p256/) — version 0.13.2, ecdh/ecdsa features
- [docs.rs/jwt-simple](https://docs.rs/jwt-simple/latest/jwt_simple/) — version 0.12.14, ES256 signing
- [docs.rs/web-push](https://docs.rs/web-push/latest/web_push/) — version 0.11.0, ContentEncoding::Aes128Gcm
- [RFC 8291](https://www.rfc-editor.org/rfc/rfc8291) — AES-128-GCM Web Push 暗号化仕様
- [RFC 8292](https://datatracker.ietf.org/doc/html/rfc8292) — VAPID JWT 仕様
- Cargo.lock（プロジェクト内）— 現在の依存関係バージョン確認済み

### Secondary (MEDIUM confidence)
- [github.com/FabianLars/tauri-plugin-oauth](https://github.com/FabianLars/tauri-plugin-oauth) — Tauri v2 対応確認、localhost リダイレクトサーバー仕組み
- [reqwest 0.13 変更点](https://docs.rs/crate/reqwest/latest) — rustls デフォルト化、feature 変更
- [web.dev — Web Push Protocol](https://web.dev/articles/push-notifications-web-push-protocol) — VAPID 認証ヘッダー形式

### Tertiary (LOW confidence)
- WebSearch: APNs HTTP/2 endpoint URL（Apple Developer Docs は JS 必須で直接取得不可）
- WebSearch: reqwest http2_prior_knowledge + APNs 組み合わせ実績

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Cargo.lock で既存バージョン確認済み。主要クレートは docs.rs で直接確認
- Architecture: HIGH — Tauri async command パターンは公式ドキュメントで確認。RFC 8291/8292 は仕様書で確認
- Pitfalls: MEDIUM — reqwest バージョン競合・MutexGuard は実経験ベース。APNs 実機挙動は未確認
- Web Push 暗号化実装: MEDIUM — web-push crate の依存競合は実際に cargo add して確認が必要

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (30 日。reqwest/Tauri は活発だが APIの大きな変更なし見込み)
