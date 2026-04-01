---
phase: 09-iphone-fusen-kanri
plan: 02
subsystem: ui
tags: [react, indexeddb, viewer, iphone-pwa]

# Dependency graph
requires:
  - phase: 09-01
    provides: pendingHydrate パターン（state holds markdown+blobMap+draftId+tags）
provides:
  - 一覧ヘッダー「一覧」表示＋「＋」新規作成ボタン
  - 下書きノートの削除ボタン（loadAllDrafts で再取得）
  - write ヘッダーの「📋 一覧」ラベル
affects: [09-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "削除後は filter ではなく loadAllDrafts() で再取得してから setHistoryNotes を更新"

key-files:
  created: []
  modified:
    - app/viewer/page.tsx

key-decisions:
  - "list ヘッダーの「← 戻る」を削除し、独立管理画面として「一覧」タイトル＋「＋」ボタンに変更"
  - "削除ボタンは note.status === 'draft' のノートにのみ表示（sent は IndexedDB 対象外）"
  - "削除後は loadAllDrafts() で再取得して setHistoryNotes を更新（filter ではなく再取得を使用）"

patterns-established:
  - "e.stopPropagation() パターン: li 内のボタンは必ず stopPropagation を呼ぶ"
  - "削除後再取得パターン: deleteDraft → loadAllDrafts → setHistoryNotes"

requirements-completed: [IPHONE-MGT-02, IPHONE-MGT-03, IPHONE-MGT-04]

# Metrics
duration: 5min
completed: 2026-04-02
---

# Phase 09 Plan 02: 一覧リニューアル＋削除ボタン Summary

**一覧ヘッダーを「履歴」から「一覧」に変更し、「＋」新規作成ボタンと下書き削除ボタン（🗑️）を追加。削除後は loadAllDrafts() で再取得。**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-02T03:40:00Z
- **Completed:** 2026-04-02T03:47:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- 一覧ヘッダーを「← 戻る」＋「履歴」から「一覧」＋「＋」ボタンに変更（独立管理画面化）
- write ヘッダーの「📋 履歴」を「📋 一覧」に変更
- 空状態メッセージを「付箋がありません。＋で新規作成」に変更
- 下書きノートの li 右端に🗑️削除ボタンを追加（e.stopPropagation + loadAllDrafts 再取得）

## Task Commits

1. **Task 1: 一覧ヘッダーをリニューアル** - `e4ea308` (feat)
2. **Task 2: 下書き削除ボタンを追加** - `b8c485e` (feat)

## Files Created/Modified

- `app/viewer/page.tsx` - 一覧ヘッダーリニューアル・削除ボタン追加

## Decisions Made

- list ヘッダーから「← 戻る」を削除し、独立した管理画面として「一覧」タイトル＋「＋」ボタンに変更（CONTEXT.md 仕様）
- 削除ボタンは下書きのみに表示（sent は IndexedDB 非対応のため）
- 削除後は `filter` ではなく `loadAllDrafts()` で再取得（CONTEXT.md 指定）

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## Next Phase Readiness

- Plan 02 完了。一覧から新規作成・削除が可能になった
- Plan 03（送信フロー維持・currentDraftId クリア確認）に進める

---
*Phase: 09-iphone-fusen-kanri*
*Completed: 2026-04-02*
