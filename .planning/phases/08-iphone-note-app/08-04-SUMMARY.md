---
phase: 08-iphone-note-app
plan: "04"
subsystem: ui
tags: [react, contenteditable, indexeddb, hydrateEditor]

# Dependency graph
requires:
  - phase: 08-iphone-note-app-01
    provides: hydrateEditor 関数・editorRef・imageBlobs state
  - phase: 08-iphone-note-app-03
    provides: writeTags・showTagBar state
provides:
  - 一覧から sent/draft 両方をタップして write ステップへ遷移する機能
  - 送信済みノートをテキストのみ復元して新規送信扱いで再送できる仕組み
  - 下書きノートを IndexedDB 画像 blob 込みで完全復元する仕組み
affects: [08-iphone-note-app]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "sent note 復元は空の blobMap + currentDraftId=null で新規送信扱いにする"
    - "draft note 復元は IndexedDB から images を取得して blobMap を構築し hydrateEditor に渡す"

key-files:
  created: []
  modified:
    - app/viewer/page.tsx

key-decisions:
  - "一覧の li className を条件分岐から固定 cursor-pointer に変更（全件タップ可能）"
  - "sent note タップ時は currentDraftId=null にして新規 ID で送信させる（重複送信防止）"
  - "hydrateEditor に渡す fullText は # title\n\nbody 形式（Plan 01 の設計に準拠）"

patterns-established:
  - "sent/draft 分岐は onClick 内の if/else で実装 — className は共通"

requirements-completed:
  - IPHONE-UI-06

# Metrics
duration: 5min
completed: "2026-03-31"
---

# Phase 08 Plan 04: 送信済みノード編集・再送信対応 Summary

**一覧から sent/draft 両方をタップして write ステップに遷移し、hydrateEditor で内容を復元できるように viewer/page.tsx の onClick・className を更新**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-31T20:07:00Z
- **Completed:** 2026-03-31T20:12:21Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- li の className を `cursor-default` 条件分岐から固定 `cursor-pointer active:bg-gray-50` に変更
- `if (note.status !== 'draft') return` を削除し、sent/draft 両方をタップ可能に
- draft タップ: IndexedDB から画像 blob を取得して blobMap を構築し hydrateEditor を呼ぶ
- sent タップ: 空の blobMap で hydrateEditor を呼び、currentDraftId=null（新規送信扱い）
- タグがある場合は writeTags と showTagBar を復元

## Task Commits

1. **Task 1: 一覧 onClick を sent/draft 両対応に更新** - `776c83e` (feat)

## Files Created/Modified
- `app/viewer/page.tsx` - 一覧 li の className と onClick を sent/draft 両対応に変更

## Decisions Made
- None - followed plan as specified

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 08 Plan 04 完了。一覧から sent/draft 両方の編集・再送信が可能になった。
- Phase 08 のすべての計画が完了。

---
*Phase: 08-iphone-note-app*
*Completed: 2026-03-31*
