---
phase: 04-hono-api-kiban
verified: 2026-03-23T09:00:00Z
status: passed
score: 4/4 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "fusen_oauth_connect でブラウザが開きGoogle認証が完了することを確認"
    expected: "ブラウザが開き、Google ログイン画面が表示され、認証後に refresh_token が {AppData}/ore-no-fusen/gdrive_token.json に保存される"
    why_human: "外部 OAuth フローはプログラム的に検証不可。GDRIVE_CLIENT_ID / GDRIVE_CLIENT_SECRET 環境変数と Google Cloud Console 設定が必要"
  - test: "fusen_check_pro_setup が Drive に push_config がある場合に true を返すことを確認"
    expected: "invoke('fusen_check_pro_setup') が true を返し、AppState.pro_config に値がキャッシュされる"
    why_human: "実際の Google Drive への通信と push_config ファイルの存在が必要"
  - test: "fusen_send_to_iphone が実機 iPhone に Push 通知を送ることを確認"
    expected: "iPhone のロック画面または通知センターに付箋内容の通知が届く"
    why_human: "iPhone 実機 + Phase 5 PWA セットアップ + 実 APNs エンドポイントが必要"
---

# Phase 4: Rust バックエンド (Google Drive + APNs) 検証レポート

**Phase Goal:** Rust (Tauri) から Google Drive への読み書きと APNs Push 通知送信が完全稼働し、`fusen_send_to_iphone` コマンドで付箋を iPhone に送信できる
**Verified:** 2026-03-23T09:00:00Z
**Status:** passed (自動検証) / human_verification 3件あり
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `fusen_check_pro_setup` が Google Drive から `fusen_push_config.json` を読み込んで AppState にキャッシュできる | VERIFIED | `lib.rs:1164` で `gdrive::poll_push_config` を呼び出し、`AppState.pro_config` に格納。`gdrive.rs:389` に `poll_push_config` 実装あり（Drive download → ProConfig パース → state.lock()）|
| 2 | `fusen_send_to_iphone` が note JSON を Google Drive にアップロードできる | VERIFIED | `lib.rs:1205-1206` で `gdrive::get_access_token` + `gdrive::upload_json` を await 呼び出し。`gdrive.rs:292-358` に multipart upload 実装あり |
| 3 | `fusen_send_to_iphone` が APNs に Push を送信できる（push_config が有効な場合） | VERIFIED | `lib.rs:1224-1225` で `webpush::send_web_push` を await 呼び出し。`webpush.rs:216-243` に VAPID JWT + AES-128-GCM + APNs POST 実装あり |
| 4 | Google OAuth PKCE フローで取得したトークンがローカルに保存・再利用される | VERIFIED | `gdrive.rs:74-173` に PKCE フロー実装。`gdrive.rs:168-170` で `get_token_path()` に JSON 保存。`gdrive.rs:176-222` の `get_access_token` で読み込み + 有効期限切れ時 refresh |

**Score:** 4/4 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src-tauri/Cargo.toml` | Phase 4 クレート依存関係 (reqwest, oauth2, tauri-plugin-oauth, p256, jsonwebtoken, aes-gcm, hkdf, sha2, rand_core, url) | VERIFIED | 全10クレートが line 52-61 に存在。PLAN の `jwt-simple` は cmake 問題で `jsonwebtoken 9` に変更（機能同等） |
| `src-tauri/src/state.rs` | ProConfig 構造体 + AppState.pro_config フィールド | VERIFIED | `state.rs:52-57` に `pub struct ProConfig { push_endpoint, p256dh, auth }`。`state.rs:48` に `pub pro_config: Option<ProConfig>` |
| `src-tauri/src/gdrive.rs` | OAuth2 PKCE + Drive R/W + poll_push_config | VERIFIED | 434行。`oauth_pkce_flow` / `get_access_token` / `ensure_folder` / `upload_json` / `download_json` / `poll_push_config` / `get_token_path` の7公開関数が存在。unit test 2件 |
| `src-tauri/src/webpush.rs` | VAPID + AES-128-GCM + APNs POST | VERIFIED | 292行。`generate_vapid_keys` / `load_or_generate_vapid_keys` / `sign_vapid_jwt` / `encrypt_payload` / `send_web_push` / `get_vapid_key_path` の6公開関数が存在。unit test 4件 |
| `src-tauri/src/lib.rs` | Tauri コマンド3つ登録 | VERIFIED | `lib.rs:1158-1228` に `fusen_oauth_connect` / `fusen_check_pro_setup` / `fusen_send_to_iphone` が実装。`lib.rs:1310-1312` で invoke_handler に登録 |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `gdrive.rs oauth_pkce_flow` | `tauri-plugin-oauth` ローカルサーバー | `tauri_plugin_oauth::start()` | WIRED | `gdrive.rs:87-89` に `tauri_plugin_oauth::start(move \|url\| {...})` 呼び出しあり |
| `gdrive.rs poll_push_config` | `AppState.pro_config` | `Mutex<AppState> lock + フィールド更新` | WIRED | `gdrive.rs:405-408` で `state.lock()...pro_config = Some(pro_config)` |
| `webpush.rs sign_vapid_jwt` | `jsonwebtoken ES256` | `EncodingKey::from_ec_der + encode` | WIRED | `webpush.rs:118-121` に `EncodingKey::from_ec_der(pkcs8_der)` + `encode(&header, &claims, &encoding_key)` |
| `webpush.rs encrypt_payload` | `aes-gcm AES-128-GCM` | `HKDF-SHA256 → Aes128Gcm` | WIRED | `webpush.rs:190-199` に `Aes128Gcm::new(key)` + `cipher.encrypt(nonce, padded)` |
| `lib.rs fusen_send_to_iphone` | `gdrive::upload_json` | `async fn で await 呼び出し` | WIRED | `lib.rs:1206` に `gdrive::upload_json(&client, &access_token, "fusen_note.json", &note_json).await?` |
| `lib.rs fusen_send_to_iphone` | `webpush::send_web_push` | `async fn で await 呼び出し` | WIRED | `lib.rs:1225` に `webpush::send_web_push(&client, &pro_config, &plaintext).await?` |
| `lib.rs fusen_check_pro_setup` | `gdrive::poll_push_config` | `async fn で await 呼び出し` | WIRED | `lib.rs:1168` に `gdrive::poll_push_config(&client, &state).await` |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| API-01 | 04-02, 04-05 | `gdrive.rs` が Google OAuth2 PKCE フロー + access_token 自動更新を実装 | SATISFIED | `gdrive.rs:74-222` に PKCE フロー + refresh ロジック |
| API-02 | 04-02, 04-05 | `gdrive.rs` が Drive REST API で JSON ファイルの R/W を行う | SATISFIED | `gdrive.rs:292-386` に `upload_json` / `download_json` 実装 |
| API-03 | 04-01, 04-02, 04-05 | `gdrive.rs` が `fusen_push_config.json` をポーリングして AppState にキャッシュ | SATISFIED | `gdrive.rs:389-411` に `poll_push_config` 実装 |
| API-04 | 04-03, 04-05 | `webpush.rs` が VAPID 鍵ペア生成・JWT 署名 (RFC 8292) を実装 | SATISFIED | `webpush.rs:57-122` に `generate_vapid_keys` + `sign_vapid_jwt` 実装 |
| API-05 | 04-03, 04-05 | `webpush.rs` が AES-128-GCM ペイロード暗号化 (RFC 8291) を実装 | SATISFIED | `webpush.rs:137-212` に RFC 8291 準拠の ECDH → HKDF → AES-128-GCM 暗号化実装 |
| API-06 | 04-03, 04-05 | `webpush.rs` が APNs HTTPS POST を実装 | SATISFIED | `webpush.rs:216-243` に VAPID Authorization ヘッダー付き POST、201 以外はエラー返却 |
| API-07 | 04-01, 04-04, 04-05 | `fusen_send_to_iphone` が Drive upload + APNs push をオーケストレーション | SATISFIED | `lib.rs:1177-1228` に fs::read → serde_json → gdrive::upload_json → webpush::send_web_push の完全フロー |

**Coverage:** 7/7 Phase 4 requirements satisfied。REQUIREMENTS.md に記載された orphaned requirements なし。

---

## Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| なし | — | — | — |

`gdrive.rs`・`webpush.rs`・`lib.rs` に TODO/FIXME/placeholder/unimplemented! なし。全関数が実質的な実装を持つ。

---

## Commit Verification

SUMMARYに記載されたコミットハッシュを git log で確認:

| Commit | Plan | Status |
|--------|------|--------|
| `63ca7d1` | 04-01 Cargo.toml クレート追加 | CONFIRMED |
| `aead5c8` | 04-01 ProConfig + AppState フィールド | CONFIRMED |
| `3bd6dc2` | 04-02 gdrive.rs 実装 | CONFIRMED |
| `5045c87` | 04-03 webpush.rs 実装 | CONFIRMED |
| `e4cf57c` | 04-04 3コマンド追加 | CONFIRMED |
| `0937570` | 04-05 TokenRefreshRequest dead_code 修正 | CONFIRMED |

---

## Human Verification Required

以下 3 件は外部サービス・実機が必要なため自動検証不可。

### 1. OAuth PKCE フロー動作確認

**Test:** `GDRIVE_CLIENT_ID` / `GDRIVE_CLIENT_SECRET` 環境変数をセットして Tauri アプリを起動し、開発コンソールから `await window.__TAURI__.core.invoke('fusen_oauth_connect')` を実行する
**Expected:** ブラウザが開き Google ログイン画面が表示される。認証完了後、`{AppData}/ore-no-fusen/gdrive_token.json` が生成される
**Why human:** Google アカウントと外部 OAuth サーバーへの通信が必要

### 2. push_config キャッシュ動作確認

**Test:** 自分の Google Drive の `ore-no-fusen/` フォルダに `fusen_push_config.json` を置き、`await window.__TAURI__.core.invoke('fusen_check_pro_setup')` を実行する
**Expected:** `true` が返り、AppState.pro_config が設定される
**Why human:** 実際の Google Drive ファイルと OAuth トークンが必要

### 3. 実機 iPhone への Push 通知送信

**Test:** Phase 5 (iPhone PWA) 完成後に `await window.__TAURI__.core.invoke('fusen_send_to_iphone', { path: '/path/to/note.md' })` を実行する
**Expected:** iPhone のロック画面に付箋内容の通知が届く
**Why human:** iPhone 実機・APNs エンドポイント・有効な push_config が必要。Phase 5 未完了のため現時点では検証不可

---

## Summary

Phase 4 の全 7 要件 (API-01〜API-07) が自動検証で SATISFIED。4 つの Success Criteria はすべてコードで確認済み。

- `gdrive.rs`: Google OAuth2 PKCE + access_token 自動更新 + Drive JSON R/W + poll_push_config — 完全実装
- `webpush.rs`: VAPID 鍵生成 + RFC 8292 JWT 署名 + RFC 8291 AES-128-GCM 暗号化 + APNs POST — 完全実装
- `lib.rs`: 3 Tauri コマンド (fusen_oauth_connect / fusen_check_pro_setup / fusen_send_to_iphone) が invoke_handler に登録済み
- cargo test 67 件 PASS、cargo build 警告ゼロを SUMMARY が記録（コミット `2957f5f` / `0937570` で確認）

注意点:
- PLAN は `jwt-simple` を指定していたが `jsonwebtoken 9` に変更済み（cmake 依存回避、ES256 機能は同等）
- PLAN は `reqwest 0.13` を指定していたが `reqwest 0.12` を使用（cmake/BoringSSL 依存回避、機能は同等）
- 実機テスト (Push 通知の到達確認) は Phase 5 完了後に実施予定

---

_Verified: 2026-03-23T09:00:00Z_
_Verifier: Claude (gsd-verifier)_
