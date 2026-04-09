---
phase: 13-rokku-gamen-kontororu-kiban
plan: "02"
subsystem: ui
tags: [react, indexeddb, service-worker, notification, pwa, iphone]

requires:
  - phase: 13-01
    provides: LOCK-03/04/05 test stubs in e2e/lock-notification.spec.ts

provides:
  - DraftRecord.locked field for IndexedDB persistence
  - lockedNoteIds state for optimistic UI updates
  - handleLockToggle function with permission check, SW notification, DB save/rollback
  - Bell button on all list cards (text-gray-400 initial, text-blue-500 when locked)

affects:
  - 13-03 (editor lock button will share handleLockToggle pattern)
  - 13-04 (restart restore reads DraftRecord.locked from IndexedDB)

tech-stack:
  added: []
  patterns:
    - "Optimistic UI update pattern: setLockedNoteIds before async op, rollback on catch"
    - "SW notification via registration.showNotification() (not new Notification())"
    - "Notification tag format: fusen-lock-<noteId> for independent per-note management"

key-files:
  created: []
  modified:
    - app/viewer/page.tsx
    - e2e/lock-notification.spec.ts

key-decisions:
  - "Bell button shown on ALL note cards regardless of status (draft/sent/received_pc)"
  - "activeNotifIds kept separate from lockedNoteIds to avoid tag prefix collision"
  - "LOCK-03 E2E test uses Playwright addInitScript to mock standalone + IndexedDB"

patterns-established:
  - "Pattern 1: Optimistic UI — update state immediately, rollback in catch block"
  - "Pattern 2: Notification lock tag — fusen-lock-<id> distinct from fusen-<id>"

requirements-completed: [LOCK-01, LOCK-02, LOCK-03, LOCK-04]

duration: 15min
completed: 2026-04-09
---

# Phase 13 Plan 02: ロック画面コントロール基盤 Summary

**DraftRecord.locked 型拡張 + lockedNoteIds 楽観的 UI + SW 通知 handleLockToggle + 一覧🔔ボタン実装**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-09T10:40:00Z
- **Completed:** 2026-04-09T10:55:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- DraftRecord 型に `locked?: true` フィールドを追加（IndexedDB スキーマ変更なし）
- `lockedNoteIds` / `isLockPermissionPending` state と `handleLockToggle` 関数を追加
- 一覧の全メモカードに🔔ボタンを追加（bell / mute / delete の順）
- LOCK-03 E2Eテストを skip スタブから実際の検証コードに更新して PASS 確認

## Task Commits

1. **Task 1: DraftRecord 型拡張と lockedNoteIds state 追加** - `27de3d5` (feat)
2. **Task 2: 一覧カードへの🔔ボタン UI 追加** - `10259a3` (feat)

## Files Created/Modified

- `app/viewer/page.tsx` - DraftRecord.locked 追加、lockedNoteIds/isLockPermissionPending state、handleLockToggle 関数、🔔ボタン UI
- `e2e/lock-notification.spec.ts` - LOCK-03 テストをスタブから実装に更新（standalone + IndexedDB モック）

## Decisions Made

- 全ステータス（draft/sent/received_pc）のメモに🔔ボタンを表示（条件分岐なし）
- `activeNotifIds` とは別の `lockedNoteIds` state を使用（タグプレフィックスが異なるため混在不可）
- E2E テストは `addInitScript` で matchMedia と localStorage をモックし、IndexedDB に下書きを投入して list ステップを検証

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

- LOCK-01〜04 充足済み
- 13-03（エディタヘッダー🔔ボタン）はこのプランの `handleLockToggle` 関数を再利用可能
- 13-04（再起動復元）は `DraftRecord.locked` フィールドを読んで `lockedNoteIds` を初期化する

## Self-Check: PASSED

- SUMMARY.md: FOUND
- Commit 27de3d5 (Task 1): FOUND
- Commit 10259a3 (Task 2): FOUND

---
*Phase: 13-rokku-gamen-kontororu-kiban*
*Completed: 2026-04-09*
