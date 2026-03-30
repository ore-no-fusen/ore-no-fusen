---
phase: 06-iphone-send-ui
plan: "05"
subsystem: ui
tags: [react, iphone, pwa, drive, history, relative-time, intl]

requires:
  - phase: 06-02
    provides: IphoneNote type, writeTitle/writeBody/step state, downloadFromDrive
  - phase: 06-03
    provides: write step UI with image/Mermaid toolbar
  - phase: 06-04
    provides: Mermaid modal, SimpleNoteBody with mermaid rendering

provides:
  - list step UI in app/viewer/page.tsx (履歴画面)
  - formatRelativeTime helper (exported, ja locale, numeric always)
  - historyNotes state + useEffect loading fusen_iphone_notes.json
  - HIST-01 tests GREEN (slice logic + undefined fallback)
  - HIST-02 tests GREEN (draft tap handler + sent tap no-op)

affects:
  - any future plan that adds to list step or history interaction

tech-stack:
  added: []
  patterns:
    - "Intl.RelativeTimeFormat('ja', { numeric: 'always' }) for '〇日前' format"
    - "step-scoped useEffect: if (step !== 'list' || !accessToken) return"
    - "draft tap guard: if (note.status !== 'draft') return"

key-files:
  created: []
  modified:
    - app/viewer/page.tsx
    - app/viewer/viewer.test.tsx

key-decisions:
  - "formatRelativeTime uses numeric:'always' not 'auto' — 'auto' returns '一昨日' instead of '2日前'"
  - "list step useEffect separates from initial [] useEffect — avoids dep pollution"

patterns-established:
  - "TDD RED→GREEN: import non-existent export first, confirm TypeError, then implement"

requirements-completed: [HIST-01, HIST-02]

duration: 15min
completed: 2026-03-29
---

# Phase 6 Plan 05: list Step (履歴画面) Summary

**履歴画面 list ステップを実装: formatRelativeTime + sent/draft バッジ + draft タップで write 復元 (HIST-01/HIST-02 GREEN)**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-29T08:55:06Z
- **Completed:** 2026-03-29T09:01:55Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `formatRelativeTime` を page.tsx にエクスポート追加（ja locale, numeric:'always'）
- `historyNotes` state と step==='list' 時の useEffect でファイル読み込み
- list ステップ全 UI: ヘッダー戻るボタン、読込中/空/リスト表示、sent/draft バッジ
- draft タップで title/body を復元して write ステップへ遷移
- sent タップは何もしない（ガード: `if (note.status !== 'draft') return`）
- HIST-01/HIST-02 ユニットテスト GREEN（既存18件 + 新規6件 = 計18件通過）

## Task Commits

1. **Task 1: formatRelativeTime ヘルパー追加** - `0b4fb7a` (feat)
2. **Task 2: list ステップ UI 実装** - `1ba8d05` (feat)

## Files Created/Modified
- `app/viewer/page.tsx` - formatRelativeTime 関数、historyNotes state、list step useEffect、list ステップ JSX
- `app/viewer/viewer.test.tsx` - formatRelativeTime/HIST-01/HIST-02 describe ブロック追加、旧 todo スタブ削除

## Decisions Made
- `numeric: 'always'` を選択: `'auto'` では '2日前' → '一昨日' と単語化されテストが失敗するため
- list ステップの useEffect は既存の `deps: []` useEffect と分離: 既存コードへの影響を最小化

## Deviations from Plan

**1. [Rule 1 - Bug] numeric:'auto' を 'always' に変更**
- **Found during:** Task 1 (RED→GREEN フェーズ)
- **Issue:** `Intl.RelativeTimeFormat('ja', { numeric: 'auto' })` が '2日前' ではなく '一昨日' を返す
- **Fix:** `numeric: 'always'` に変更してテストが期待する数値形式を保証
- **Files modified:** app/viewer/page.tsx
- **Verification:** `2日前の ISO 文字列を「2日前」として返す` テストが GREEN
- **Committed in:** `0b4fb7a` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** 必須修正。numeric:'auto' の日本語ロケール動作が想定外だった。スコープ外への影響なし。

## Issues Encountered
なし

## Next Phase Readiness
- Phase 6 全5プラン完了 — list/write/history UI が完全に実装済み
- HIST-01/HIST-02 テスト GREEN、全テストスイート 55件通過
- 次は Phase 7 (PC受信) または統合テスト

---
*Phase: 06-iphone-send-ui*
*Completed: 2026-03-29*
