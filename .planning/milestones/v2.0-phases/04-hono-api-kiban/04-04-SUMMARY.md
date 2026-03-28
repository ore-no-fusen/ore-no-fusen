---
phase: 04-hono-api-kiban
plan: "04"
subsystem: infra
tags: [tauri, rust, gdrive, webpush, apns, oauth2, push-notification, iphone]

# Dependency graph
requires:
  - phase: 04-02
    provides: gdrive::get_access_token, gdrive::upload_json, gdrive::poll_push_config, gdrive::oauth_pkce_flow
  - phase: 04-03
    provides: webpush::send_web_push, webpush::load_or_generate_vapid_keys
provides:
  - fusen_oauth_connect Tauri command (Google OAuth PKCE flow entry point)
  - fusen_check_pro_setup Tauri command (Drive push_config poll → AppState cache → bool result)
  - fusen_send_to_iphone Tauri command (Drive upload + APNs push orchestration)
affects:
  - 04-05 (iPhone PWA / right-click menu calls fusen_send_to_iphone)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Tauri async command orchestrating gdrive + webpush modules
    - AppState pro_config キャッシュ: lock→clone→drop パターンで Mutex 保持時間を最小化

key-files:
  created: []
  modified:
    - src-tauri/src/lib.rs (fusen_oauth_connect / fusen_check_pro_setup / fusen_send_to_iphone + invoke_handler 登録)

key-decisions:
  - "fusen_check_pro_setup はエラー時に Err を返さず false を返す: 設定未完了は通常フロー"
  - "fusen_send_to_iphone は pro_config キャッシュなしの場合に poll_push_config を再実行してフォールバック"

patterns-established:
  - "Mutex<AppState> を跨ぐ async: lock→clone→drop で guard を保持せずに await する"
  - "send_to_iphone フロー: fs::read_to_string → serde_json::json! → gdrive::upload_json → webpush::send_web_push"

requirements-completed: [API-07]

# Metrics
duration: 8min
completed: 2026-03-23
---

# Phase 04 Plan 04: Tauri コマンド統合 Summary

**gdrive + webpush を呼び出す 3 つの Tauri コマンド（fusen_oauth_connect / fusen_check_pro_setup / fusen_send_to_iphone）を lib.rs に追加し、cargo test 67 件全 PASS で Phase 4 Rust バックエンドが完結**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-23T07:10:00Z
- **Completed:** 2026-03-23T07:18:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- `fusen_oauth_connect`: `gdrive::oauth_pkce_flow` を呼び出す OAuth 初回認証コマンドを追加
- `fusen_check_pro_setup`: Drive から push_config を取得し AppState にキャッシュ、bool 返却
- `fusen_send_to_iphone`: ファイル読み込み → note JSON 生成 → Drive upload → APNs push の全オーケストレーションを 1 コマンドに実装
- 3 コマンドを invoke_handler に登録
- `cargo test` 67 件全 PASSED (gdrive 2 件 + webpush 4 件 + 既存テスト群)

## Task Commits

1. **Task 1: lib.rs に 3 つの Tauri コマンドを追加する** - `e4cf57c` (feat)
2. **Task 2: cargo test でフルスイートを実行する** - コード変更なし（検証のみ）

**Plan metadata:** (この SUMMARY.md コミット)

## Files Created/Modified
- `src-tauri/src/lib.rs` - fusen_oauth_connect / fusen_check_pro_setup / fusen_send_to_iphone の 3 コマンド追加 + invoke_handler 登録

## Decisions Made
- `fusen_check_pro_setup` はエラー時に `Err` を返さず `Ok(false)` を返す: Drive 未設定は通常フローであり UI 側で分岐すべきため
- `fusen_send_to_iphone` の pro_config フォールバック: キャッシュなし時に `poll_push_config` を再実行し、それでも取得できなければエラーメッセージで失敗

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 4 の Rust バックエンド 3 モジュール（gdrive / webpush / lib コマンド）が完結
- Phase 5 (iPhone PWA + 右クリックメニュー) で `fusen_send_to_iphone` を `invoke()` 呼び出し可能
- VAPID 鍵はアプリデータディレクトリに自動生成・永続化済み

## Self-Check: PASSED
- src-tauri/src/lib.rs: FOUND (fusen_send_to_iphone grep confirmed)
- commit e4cf57c: FOUND
- cargo test: 67 passed, 0 failed

---
*Phase: 04-hono-api-kiban*
*Completed: 2026-03-23*
