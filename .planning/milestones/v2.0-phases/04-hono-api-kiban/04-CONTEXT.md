# Phase 4: Rust バックエンド（Google Drive + APNs）- Context

**Gathered:** 2026-03-23
**Status:** Ready for planning
**Source:** iPhone連携_実装計画.html（設計書）

<domain>
## Phase Boundary

Rust (Tauri) から直接 Google Drive への読み書きと APNs Push 通知送信を実装する。
サーバーサイド API（Vercel API Routes）は不要。各ユーザーが自分の Google Drive を使う。
iPhone PWA や右クリックメニューは Phase 5 のスコープ。

</domain>

<decisions>
## Implementation Decisions

### アーキテクチャ方針（最重要）
- **サーバー不要**: Vercel は PWA ホスティングのみ。API Routes は使わない
- **Rust が直接実行**: Google Drive 読み書き・APNs POST はすべて Rust (Tauri) から行う
- **各ユーザーが自分の Google Drive を使う**: OAuth PKCE フローでユーザーが自分のアカウントで認証

### 新規 Rust ファイル
- `src-tauri/src/gdrive.rs` — Google OAuth2 PKCE + Drive REST API R/W
- `src-tauri/src/webpush.rs` — VAPID JWT 署名 + AES-128-GCM 暗号化 + APNs POST

### Cargo.toml 追加クレート
```toml
reqwest   = { version = "0.12", features = ["json", "rustls-tls"] }
p256      = { version = "0.13", features = ["ecdh", "ecdsa"] }
jwt-simple = "0.12"
base64    = "0.22"
aes-gcm   = "0.10"
hkdf      = "0.12"
sha2      = "0.10"
```

### Google Drive データ構造
- フォルダ: `ore-no-fusen`（マイドライブ直下）
- `fusen_push_config.json` — iPhone PWA が書き込む Push Subscription（endpoint + p256dh + auth）
- `fusen_note.json` — PC が書き込む最新ノート（上書き保存）

### gdrive.rs 主要関数
- `oauth_pkce_flow()` — ブラウザで OAuth 認証 → refresh_token をローカル保存
- `get_access_token()` — refresh_token で access_token を取得
- `upload_json(filename, data)` — Google Drive REST API v3 で上書き
- `download_json(filename)` — ファイル名で Drive を検索してダウンロード
- `poll_push_config()` — fusen_push_config.json を取得・AppState にキャッシュ

### webpush.rs 主要関数
- `generate_vapid_keys()` — P-256 ECDSA 鍵ペア生成・設定ファイルに保存
- `sign_vapid_jwt(endpoint)` — 有効期限 12h の JWT 生成（RFC 8292）
- `encrypt_payload(p256dh, auth, json)` — ECDH → HKDF → AES-128-GCM（RFC 8291）
- `send_web_push(config, payload)` — APNs に TTL="86400" で POST

### Push 通知フロー（B. 2回目以降）
```
PC付箋 右クリック「iPhoneに送る」
  → invoke('fusen_send_to_iphone', {path})
  → Rust: fusen_read_note(path) でコンテンツ取得
  → Rust: note JSON 生成
  → Rust: Google Drive fusen_note.json を上書き (~200ms)
  → Rust: キャッシュ済み push_config を使用
  → Rust: VAPID JWT 署名 (~50ms)
  → Rust: AES-128-GCM 暗号化 (~30ms)
  → Rust: APNs HTTPS POST (~400ms)
  → iPhone ロック画面に通知表示
```

### AppState の追加フィールド
```rust
pub struct ProConfig {
    pub push_endpoint: String,
    pub p256dh: String,
    pub auth: String,
}
// AppState に Option<ProConfig> を追加
```

### Tauri コマンド
- `fusen_check_pro_setup` — push_config がキャッシュ済みか確認
- `fusen_send_to_iphone` — 送信オーケストレーション

### Claude's Discretion
- OAuth トークンのローカル保存場所（`~/.config/ore-no-fusen/` or Tauri app data dir）
- エラーハンドリングの詳細（ネットワークエラー、Drive API エラー）
- VAPID keys の保存場所

</decisions>

<specifics>
## Specific Ideas

### fusen_push_config.json 形式
```json
{
  "endpoint": "https://api.push.apple.com/3/device/XXXXXXXXXXXX",
  "keys": {
    "p256dh": "BNcRdreALRFXTkOOUHK...(base64url, 65bytes)",
    "auth":   "tBy8sdLk...(base64url, 16bytes)"
  },
  "created_at": "2026-03-03T06:00:00Z"
}
```

### fusen_note.json 形式
```json
{
  "title":   "今日のタスク",
  "body":    "# 今日のタスク\n- [ ] 資料作成\n- [x] メール返信\n",
  "tags":    ["仕事", "重要"],
  "sent_at": "2026-03-03T06:05:00Z"
}
```

</specifics>

<deferred>
## Deferred Ideas

- iPhone PWA セットアップ画面 → Phase 5
- 右クリックメニュー「iPhoneに送る」→ Phase 5
- Service Worker → Phase 5
- Android Chrome 対応 → v3.0

</deferred>

---

*Phase: 04-hono-api-kiban（正式名称: Rust バックエンド）*
*Context updated: 2026-03-23 — corrected from Hono API to Rust direct implementation*
