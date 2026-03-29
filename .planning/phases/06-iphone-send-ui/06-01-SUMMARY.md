---
phase: 06-iphone-send-ui
plan: "01"
subsystem: testing
tags: [vitest, tdd, mermaid, canvas-api, iphone-send]

# Dependency graph
requires: []
provides:
  - "Phase 6 全要件（SEND-01〜04, HIST-01〜02, REND-01）の it.todo テストスタブ"
  - "mermaid vi.mock セットアップ"
  - "Canvas API モックセットアップ"
  - "IphoneNote 型定義（テストファイル内）"
affects: [06-02, 06-03, 06-04, 06-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave 0 先行スタブパターン: Nyquist ルール準拠でテストを実装前に定義"
    - "vi.mock('mermaid') をファイル最上部に配置: hoisting のために必要"
    - "Canvas API モックを beforeEach 内に配置: 各テスト前にリセット"

key-files:
  created: []
  modified:
    - app/viewer/viewer.test.tsx

key-decisions:
  - "IphoneNote 型定義はテストファイル内に直接記述（types ファイルは Wave 1 以降）"
  - "mermaid モックは vi.mock() ホイスティングで最上部に配置"

patterns-established:
  - "Wave 0 スタブパターン: it.todo に説明文のみ（実装なし）"

requirements-completed:
  - SEND-01
  - SEND-02
  - SEND-03
  - SEND-04
  - HIST-01
  - HIST-02
  - REND-01

# Metrics
duration: 10min
completed: 2026-03-29
---

# Phase 6 Plan 01: Wave 0 テストスタブ作成 Summary

**Phase 6 全要件（SEND-01〜04, HIST-01〜02, REND-01）の it.todo スタブ22件を viewer.test.tsx に追加し、mermaid・Canvas API モックと IphoneNote 型定義を配置**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-29T08:14:24Z
- **Completed:** 2026-03-29T08:24:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- vi.mock('mermaid') と Canvas API モックを beforeEach に追加
- IphoneNote 型定義（id, status, title, body, created_at, sent_at）をテストファイル内に定義
- SEND-01〜04, HIST-01〜02, REND-01 の7グループ22件の it.todo スタブを追加
- 既存テスト6件（SimpleNoteBody テスト）は変更なし、0 failures を維持

## Task Commits

1. **Task 1: Phase 6 テストスタブを viewer.test.tsx に追加する** - `f0da83b` (test)

## Files Created/Modified
- `app/viewer/viewer.test.tsx` - Phase 6 スタブ22件追加（mermaid mock, Canvas mock, IphoneNote 型, 7 describe グループ）

## Decisions Made
- IphoneNote 型定義はテストファイル内に直接記述（Wave 1 で types/ ファイルに移動する可能性あり）
- vi.mock('mermaid') はファイル最上部に配置（vitest のホイスティング要件）

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Wave 0 スタブ完成。Phase 6 Plan 02（Wave 1: viewer/page.tsx の write ステップ実装）に進める
- 各スタブが GREEN になる条件: 対応する Wave の実装完了後

---
*Phase: 06-iphone-send-ui*
*Completed: 2026-03-29*
