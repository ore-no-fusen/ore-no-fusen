---
phase: 13-rokku-gamen-kontororu-kiban
plan: "03"
subsystem: ui
tags: [react, indexeddb, service-worker, notification, pwa, iphone, playwright]

requires:
  - phase: 13-02
    provides: DraftRecord.locked field, lockedNoteIds state, handleLockToggle function

provides:
  - Startup lock state restoration (list useEffect reads locked drafts, restores lockedNoteIds)
  - Permission-gated SW notification re-fire on startup (Notification.permission === 'granted' only)
  - Delete handler clears CLOSE_NOTIFICATION + lockedNoteIds for locked notes
  - LOCK-04 tag format unit test (PASS)
  - LOCK-05 E2E test for locked=true draft showing text-blue-500 bell button (PASS)

affects:
  - 13-04 (editor lock button shares same DraftRecord.locked persistence pattern)

tech-stack:
  added: []
  patterns:
    - "Startup restore pattern: loadAllDrafts() -> filter locked -> setLockedNoteIds"
    - "Permission gate: Notification.permission === 'granted' before re-firing SW notifications"
    - "Delete + unlock: CLOSE_NOTIFICATION tag fusen-lock-<id> + setLockedNoteIds filter"

key-files:
  created: []
  modified:
    - app/viewer/page.tsx
    - e2e/lock-notification.spec.ts

key-decisions:
  - "Startup permission check uses Notification.permission without requestPermission() (iOS constraint)"
  - "LOCK-04 implemented as pure unit test (no browser needed for tag format check)"
  - "LOCK-05 implemented as E2E with IndexedDB injection + aria-label=ロック解除 assertion"

patterns-established:
  - "Pattern 3: Startup restore — read locked flag from loadAllDrafts(), restore state before render"
  - "Pattern 4: Delete unlock — always clean up lock state (SW + React state) on note deletion"

requirements-completed: [LOCK-05, LOCK-02]

duration: 10min
completed: 2026-04-09
---

# Phase 13 Plan 03: 起動時ロック復元と削除時ロック解除 Summary

**起動時 loadAllDrafts() からの lockedNoteIds 復元 + 削除ハンドラへの CLOSE_NOTIFICATION 追加 + LOCK-04/05 テスト GREEN 化**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-09T10:50:20Z
- **Completed:** 2026-04-09T11:01:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- list useEffect に起動時ロック復元ロジックを追加（loadAllDrafts() -> locked フラグ抽出 -> setLockedNoteIds）
- Notification.permission === 'granted' の場合のみ SW 通知を再発火（iOS requestPermission 制約対応）
- 削除ハンドラ（sent/else 両ブランチ）にロック中メモの CLOSE_NOTIFICATION + setLockedNoteIds 解除を追加
- LOCK-04/05 テストをスタブから実装に更新し全件 PASS 確認（フルスイート 21/21 PASS）

## Task Commits

1. **Task 1: list useEffect に起動時ロック復元を追加** - `f15f22c` (feat)
2. **Task 2: 削除ハンドラへのロック解除追加 + LOCK-04/05 テスト GREEN 化** - `b277e09` (feat)

## Files Created/Modified

- `app/viewer/page.tsx` - list useEffect に lockedIds 復元ロジック追加、削除ハンドラに lock cleanup 追加
- `e2e/lock-notification.spec.ts` - LOCK-04（タグ形式ユニット検証）、LOCK-05（E2E IndexedDB locked=true 復元検証）実装

## Decisions Made

- LOCK-04: ブラウザ環境不要なタグ生成ロジックのユニットテストとして実装（`page` 引数は `_page` で未使用）
- LOCK-05: `addInitScript` で IndexedDB に locked=true レコードを投入し、list ステップで `aria-label="ロック解除"` ボタンの `text-blue-500` クラスを検証する E2E テストとして実装

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

- LOCK-01〜05 すべて充足済み
- 13-04（エディタヘッダー🔔ボタン）は handleLockToggle 関数を再利用して実装可能
- DraftRecord.locked の永続化・復元・削除時解除がすべて動作確認済み

## Self-Check: PASSED

- SUMMARY.md: .planning/phases/13-rokku-gamen-kontororu-kiban/13-03-SUMMARY.md
- Commit f15f22c (Task 1): FOUND
- Commit b277e09 (Task 2): FOUND
- npx playwright test --grep "LOCK": 3/3 PASS
- npx playwright test: 21/21 PASS

---
*Phase: 13-rokku-gamen-kontororu-kiban*
*Completed: 2026-04-09*
