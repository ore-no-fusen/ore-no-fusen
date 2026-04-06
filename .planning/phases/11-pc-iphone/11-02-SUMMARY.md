---
phase: 11-pc-iphone
plan: "02"
subsystem: iphone
tags: [rust, uuid, drive, web-push, service-worker]

# Dependency graph
requires:
  - phase: 11-pc-iphone-01
    provides: Phase 11 テストスタブ（P11-SCHEMA, P11-WORKER 要件定義）
provides:
  - fusen_send_to_iphone が UUID ベースの note_id を生成し Drive に配列形式（最新20件）で保存
  - Web Push payload と Drive JSON の両方に id フィールドが含まれる
  - worker/index.js の通知タグが 'fusen-<id>' になり複数ノートが独立して表示可能
affects: [11-03, 11-04, viewer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "read-modify-write パターン: Drive upload 前に download して items 配列に追加し最新20件に切り詰め"
    - "fusen-<uuid> タグパターン: 通知ごとに固有タグを付与して複数通知を独立管理"

key-files:
  created: []
  modified:
    - src-tauri/src/lib.rs
    - worker/index.js

key-decisions:
  - "note_id は uuid::Uuid::new_v4() で生成。Cargo.toml の uuid クレートは既存依存のため追加不要"
  - "Drive の fusen_note.json は { items: [...] } 配列構造に移行。旧形式（items キーなし）は download_json 失敗扱いで空配列にフォールバック"
  - "Drive アップロードは背景 tokio::spawn で非同期（トーストを遅らせない）"

patterns-established:
  - "Drive read-modify-write: download → push → trim(20) → upload の4ステップ"

requirements-completed: [P11-SCHEMA, P11-WORKER]

# Metrics
duration: 10min
completed: "2026-04-06"
---

# Phase 11 Plan 02: PC→iPhone通知 配列スキーマ・タグ固有化 Summary

**fusen_send_to_iphone を UUID 付き read-modify-write 配列化し、Service Worker の通知タグを 'fusen-<uuid>' に変更することで複数ノートを独立表示可能にした**

## Performance

- **Duration:** 10 min
- **Started:** 2026-04-06T12:40:00Z
- **Completed:** 2026-04-06T12:50:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- lib.rs: note_id（UUID v4）を生成し note_json_drive・note_json_push の両方に "id" フィールドを追加
- lib.rs: Drive アップロードを read-modify-write に変更（download → items.push → 20件上限 → upload）
- worker/index.js: push タグを `'fusen-' + id`、notificationclick の targetUrl を `/viewer?note=<id>` に変更

## Task Commits

1. **Task 1: lib.rs — note_json に id 追加 + Drive read-modify-write 配列化** - `9c7114a` (feat)
2. **Task 2: worker/index.js — 通知タグを 'fusen-<id>' に変更** - `b3dcbc9` (feat)

## Files Created/Modified
- `src-tauri/src/lib.rs` - fusen_send_to_iphone に note_id 生成・read-modify-write 配列アップロード追加
- `worker/index.js` - push/notificationclick ハンドラのタグ・URL を id ベースに変更

## Decisions Made
- uuid クレートは Cargo.toml の既存依存のため追加不要
- 旧形式 Drive JSON（items キーなし）は download 失敗扱いとし空配列にフォールバック（後方互換）
- Drive の read-modify-write は tokio::spawn 内で完結させ、メイン処理（Web Push 送信）をブロックしない

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plan 02 完了。Drive に配列形式で保存され、Web Push に id が乗るようになった
- Plan 03（iPhone 側の受信・表示処理 / viewer 更新）へ進める

---
*Phase: 11-pc-iphone*
*Completed: 2026-04-06*
