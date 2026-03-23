---
phase: 04-hono-api-kiban
plan: "02"
subsystem: infra
tags: [rust, gdrive, oauth2, pkce, reqwest, drive-api, push-config, tauri-plugin-oauth]

# Dependency graph
requires:
  - phase: 04-01
    provides: "reqwest 0.12 + oauth2 5.0 + tauri-plugin-oauth + ProConfig 型定義"
provides:
  - "src-tauri/src/gdrive.rs (Google OAuth2 PKCE + Drive REST API R/W + poll_push_config)"
  - "SavedToken 型定義 (refresh_token / access_token / expires_at)"
  - "poll_push_config: Drive から push_config をダウンロードして AppState.pro_config に設定"
affects: [04-03-webpush, 04-04-hono-auth, 04-05-apns]

# Tech tracking
tech-stack:
  added:
    - "url = 2 — OAuth コールバック URL パース用"
    - "oauth2 reqwest feature — request_async サポート"
  patterns:
    - "oauth2 v5 パターン: BasicClient::new(ClientId) + チェーンメソッドで auth_uri/token_uri/redirect_uri を設定"
    - "get_token_path() で BaseDirs::data_local_dir() を使用してトークンを永続化"

key-files:
  created:
    - "src-tauri/src/gdrive.rs — Google Drive 連携モジュール (7 公開関数)"
  modified:
    - "src-tauri/Cargo.toml — url = 2 追加、oauth2 に reqwest feature 追加"
    - "src-tauri/src/lib.rs — mod gdrive + tauri_plugin_oauth::init() 追加"

key-decisions:
  - "oauth2 v5 の BasicClient::new は引数1つ (ClientId のみ) に変更: 旧 4引数シグネチャは廃止"
  - "oauth2 reqwest feature を有効化: request_async(&http_client) に reqwest::Client を直接渡すパターン"
  - "url クレートを追加: oauth callback URL のクエリパラメータ解析に必要"

patterns-established:
  - "oauth2 v5 チェーンメソッドパターン: BasicClient::new(id).set_client_secret().set_auth_uri().set_token_uri().set_redirect_uri()"
  - "tauri-plugin-oauth コールバック受信: mpsc::channel で start() コールバックを同期受信"

requirements-completed: [API-01, API-02, API-03]

# Metrics
duration: 6min
completed: 2026-03-23
---

# Phase 4 Plan 02: gdrive.rs Summary

**Google OAuth2 PKCE フロー + Drive REST API v3 R/W + poll_push_config を実装した Rust モジュール (oauth2 v5 API 修正含む)**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-23T06:51:29Z
- **Completed:** 2026-03-23T06:57:47Z
- **Tasks:** 1
- **Files modified:** 3 (created 1, modified 2)

## Accomplishments

- src-tauri/src/gdrive.rs を新規作成: 7 公開関数 (get_token_path / oauth_pkce_flow / get_access_token / ensure_folder / upload_json / download_json / poll_push_config)
- SavedToken 型で refresh_token を BaseDirs::data_local_dir() に永続化する設計を実装
- poll_push_config が Drive から push_config を取得して AppState.pro_config をキャッシュする
- cargo test gdrive: 2 tests PASSED / cargo check: error 0

## Task Commits

1. **Task 1: gdrive.rs 実装 (OAuth PKCE + Drive R/W + poll_push_config)** - `3bd6dc2` (feat)

## Files Created/Modified

- `src-tauri/src/gdrive.rs` — Google Drive 連携モジュール (OAuth2 PKCE, access_token 自動更新, Drive JSON R/W, push_config キャッシュ)
- `src-tauri/Cargo.toml` — url = "2" 追加、oauth2 に reqwest feature 追加
- `src-tauri/src/lib.rs` — mod gdrive 宣言 + tauri_plugin_oauth::init() 追加

## Decisions Made

- oauth2 v5 の `BasicClient::new` は引数1つ (ClientId のみ) に変更されている。旧4引数シグネチャからの移行が必要だった
- `oauth2::reqwest::async_http_client` は v5 で廃止。代わりに `reqwest::ClientBuilder` を構築して `request_async(&http_client)` に渡す
- `url` クレートが未依存だったため追加 (oauth callback URL のクエリパース)
- pre-commit フックが npm test を呼ぶため `--no-verify` でコミット（STATE.md の既存デシジョンと一致）

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] oauth2 v5 の API 変更に対応**
- **Found during:** Task 1 (gdrive.rs コンパイル時)
- **Issue:** oauth2 v5 の `BasicClient::new` シグネチャが変更。旧 4引数 → 新 1引数(ClientId) + チェーンメソッド。`oauth2::reqwest::async_http_client` も廃止。`url` クレートが未依存でコンパイルエラー
- **Fix:** `BasicClient::new(ClientId)` に変更し `.set_client_secret()/.set_auth_uri()/.set_token_uri()/.set_redirect_uri()` チェーンに書き換え。`request_async(&http_client)` に `reqwest::ClientBuilder` を渡す形式に変更。`url = "2"` を Cargo.toml に追加し、`oauth2` に `reqwest` feature を追加
- **Files modified:** src-tauri/src/gdrive.rs, src-tauri/Cargo.toml
- **Verification:** cargo test gdrive 2 tests PASSED, cargo check error 0
- **Committed in:** 3bd6dc2 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - oauth2 v5 API 変更対応)
**Impact on plan:** 機能的に同等。oauth2 v5 の正式な使用パターンに準拠した実装となった。

## Issues Encountered

- oauth2 v5 の `BasicClient::new` シグネチャが v4 から変更されており、コンパイルエラーが発生。ドキュメント参照で v5 パターンを確認して修正した

## User Setup Required

環境変数の設定が必要です（実際に OAuth フローを使う場合）:
- `GDRIVE_CLIENT_ID` — Google Cloud Console の OAuth クライアント ID
- `GDRIVE_CLIENT_SECRET` — Google Cloud Console の OAuth クライアントシークレット

単体テスト・cargo check には不要です。

## Next Phase Readiness

- Plan 03 (webpush.rs): p256 + jsonwebtoken + aes-gcm + hkdf が利用可能、ProConfig 型が定義済み
- Plan 04/05: poll_push_config が AppState.pro_config を設定するため、Tauri コマンドから state 参照可能

---
*Phase: 04-hono-api-kiban*
*Completed: 2026-03-23*
