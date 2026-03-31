---
phase: 08-iphone-note-app
plan: 01
subsystem: ui
tags: [contenteditable, react, typescript, viewer, iphone-pwa]

requires: []
provides:
  - contenteditable エディタ基盤（serializeEditor/hydrateEditor/extractTitleBody/insertTextAtCursor/insertNodeAtCursor）
  - write ステップを textarea から contenteditable div に刷新
  - IphoneNote/DraftRecord に tags? フィールド追加
affects:
  - 08-iphone-note-app (Plan 02以降: CropModal・タグバー追加)

tech-stack:
  added: []
  patterns:
    - "contenteditable div を editorRef で参照し、serializeEditor/hydrateEditor で Markdown <-> DOM を相互変換"
    - "画像は imageBlobs Map<string, File> で管理し、DOM には img[data-filename] として埋め込む"
    - "Mermaid は div[data-mermaid-code] として DOM に保持し、シリアライズ時にコードブロックに戻す"

key-files:
  created: []
  modified:
    - app/viewer/page.tsx

key-decisions:
  - "node.after() は TypeScript の Node 型にないため parentNode.insertBefore(after, node.nextSibling) で代替"
  - "list→write 遷移での下書き復元は setTimeout 50ms 後に hydrateEditor を呼ぶ（step 変更後に editorRef がマウントされるため）"
  - "下書き保存・送信ともに serializeEditor → extractTitleBody の2ステップで title/body を分離"

patterns-established:
  - "contenteditable シリアライズパターン: cloneNode → querySelectorAll で特殊要素を置換 → innerText で文字列化"

requirements-completed:
  - IPHONE-UI-01

duration: 25min
completed: 2026-03-31
---

# Phase 08 Plan 01: contenteditable エディタ基盤 Summary

**textarea・タイトルinput を廃止し、serializeEditor/hydrateEditor/extractTitleBody ほか5つのヘルパー関数と contenteditable div エディタ基盤を viewer/page.tsx に構築**

## Performance

- **Duration:** 25 min
- **Started:** 2026-03-31T00:00:00Z
- **Completed:** 2026-03-31T00:25:00Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments

- IphoneNote・DraftRecord 型に `tags?: string[]` を追加し、送受信ペイロードにタグ対応
- 5つのヘルパー関数（serializeEditor/extractTitleBody/insertTextAtCursor/insertNodeAtCursor/hydrateEditor）をファイルスコープに追加
- write ステップを contenteditable div に差し替え（textarea・タイトルinput・attachedImages をすべて削除）
- Mermaid 挿入を insertNodeAtCursor/insertTextAtCursor ベースに変更
- 下書き復元を hydrateEditor + imageBlobs Map ベースに変更

## Task Commits

1. **Task 1: 型変更・state変更** - `ddcc6d0` (feat)
2. **Task 2: ヘルパー関数5つを追加** - `af2940f` (feat)
3. **Task 3: write ステップ UI を contenteditable に差し替え** - `721f5cd` (feat)

## Files Created/Modified

- `app/viewer/page.tsx` - contenteditable 基盤: 型変更・state変更・5ヘルパー関数・write UI 差し替え

## Decisions Made

- `node.after()` は TypeScript `Node` 型に存在しないため `parentNode.insertBefore()` で代替（Rule 1 auto-fix）
- list→write 遷移での下書き復元は `setTimeout 50ms` 後に `hydrateEditor` を呼ぶ（step 変更後に editorRef がマウントされるのを待つため）

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] node.after() TypeScript 型エラーを修正**
- **Found during:** Task 2 (ヘルパー関数追加)
- **Issue:** `node.after(after)` は `Node` 型に存在しない（`ChildNode` にのみある）。tsc エラー TS2339 が発生
- **Fix:** `node.parentNode.insertBefore(after, node.nextSibling)` に置き換え
- **Files modified:** app/viewer/page.tsx
- **Verification:** `npx tsc --noEmit` エラーゼロ
- **Committed in:** af2940f (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug)
**Impact on plan:** 修正は動作の正確性に必要。スコープ拡大なし。

## Issues Encountered

なし

## Next Phase Readiness

- contenteditable 基盤が完成。Plan 02 で CropModal・タグバー・画像挿入ロジックを追加可能
- `fileInputRef` の `onChange` は Plan 02 で CropModal 連携に差し替え予定

---
*Phase: 08-iphone-note-app*
*Completed: 2026-03-31*
