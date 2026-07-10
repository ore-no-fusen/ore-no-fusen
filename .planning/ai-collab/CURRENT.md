## 2026-07-10 quick launcher triple right click settings UI

- Added a HotkeySection switch for `quick_launcher_triple_right_click` below the quick launcher shortcut row.
- The switch treats missing settings as false and saves immediately through the existing settings store path.
- Verification passed: `npx vitest run`, `npm run lint`, `npx tsc --noEmit`.

## 2026-07-10 quick launcher triple right click Rust

- Added `src-tauri/src/triple_right_click.rs` with an OS-independent right-button triple-down detector and a Windows `WH_MOUSE_LL` hook that passes clicks through.
- Wired `quick_launcher_triple_right_click` settings through Rust/TS settings and synced the hook on startup and settings save.
- Reused the existing quick launcher toggle event path (`fusen:toggle_quick_launcher`) used by Ctrl+P.
- Verification passed: `cargo test`, `npx tsc --noEmit`, `npx vitest run`.

## 2026-07-10 return crystal close sound

- Added `playSaveSound()` after successful `returnRecipe(...)` in `app/components/StickyNote.tsx`, before hiding/destroying the window.
- Reused existing save sound because there is no dedicated return/stow sound helper.
- Verification passed: `npx vitest run`, `npm run lint`, `npx tsc --noEmit`.

## 2026-07-09 Phase D Part D-5 launcher term tab

- Implemented `term_note_paths` in `src-tauri/src/launcher.rs` to scan `Terms/`, connected the `term` quick launcher tab, and added term shelf removal by stripping `term` then moving the file to root.
- Added launcher Rust tests for `term` tab scanning and removing a term from shelf.
- Updated `app/components/QuickLauncher.tsx` so term rows use `📖` and the empty-state message points to `📖 用語にする`.
- Existing test updated: `app/components/QuickLauncher.test.ts` term empty-state expected string only.
- Verification passed: `cargo test`, `npx vitest run`, `npm run lint`, `npx tsc --noEmit`.

## 2026-07-09 Phase D Part D-3 term creation flow

- Added `createTermNote` in `app/api/recipes.ts` for `fusen_create_term_note`.
- Added `app/components/TermCreateModal.tsx` copied from QA flow with term labels, `buildTermDraft`, source-title initial short name, and term note creation emits.
- Added `app/term-create/page.tsx` copied from QA create page for source note loading and modal display.
- Added `📖 用語にする` to the crystal context submenu under `❓ QAにする`, opening `/term-create?path=...` with the QA window sizing pattern.
- Added `term-create` to the Rust CloseRequested transient-window exception in `src-tauri/src/lib.rs`.
- Verification passed: `npx vitest run`, `npm run lint`, `npx tsc --noEmit`, `npm run build` (`/term-create` generated), `cargo test`.

## 2026-07-09 Phase D Part D-2 term Rust command

- Implemented Terms storage support in `src-tauri/src/storage.rs`: `TERMS_DIR_NAME`, `ensure_terms_dir`, and recipe-material exclusion for root/nested `Terms`.
- Added `term_tags_from_request` in `src-tauri/src/logic.rs` through the existing reserved-tag helper.
- Added `create_term_note_file`, `fusen_create_term_note`, invoke registration, and term file I/O tests in `src-tauri/src/lib.rs`.
- Existing test updated: `storage::tests::test_list_recipe_material_note_paths_scans_root_and_tags_only` now includes root/nested `Terms` exclusion cases.
- Verification passed: `cargo test`, `npx tsc --noEmit`.

## 2026-07-09 Phase D Part D-1 termFormat

- Implemented `app/utils/termFormat.ts` as the pure draft builder for term crystals.
- Added `TERM_SPEC`, section constants, `TermDraftInput`, and `buildTermDraft`.
- Shared source-note trigger generation through `buildSourceNoteLine` in `app/utils/crystalFormat.ts`; `qaFormat.ts` imports it with unchanged public API/output.
- Added `app/utils/termFormat.test.ts` for meaning/usage split, heading flattening, indentation preservation, URL/image evacuation, trigger title handling, and TERM_SPEC document-order behavior.
- Verification passed: `npx vitest run`, `npm run lint`, `npx tsc --noEmit`.

## 2026-07-06 Part 10.2 launcher UAT fixes

- E: Added `fusen:launcher_shelf_changed` shelf-change event wiring for recipe creation, shortcut shelf toggle, remove from shelf, and reorder.
- E: QuickLauncher now listens for the shelf-change event and reloads the current tab/query even while locked.
- F: QuickLauncher lock button now reuses the normal sticky-note pin icon and pin toggle WebAudio sound helper.
- Verification passed: `cargo test`, `npx vitest run`, `npm run lint`.

## 2026-07-08 右クリックメニュー調査

- 症状: 一部の付箋で右クリックメニューが表示されない。
- ユーザー提示ログは pool 昇格、lazy 付箋作成、保存/リネーム判定のログで、右クリックメニューの直接エラーではなさそう。
- 現時点の有力候補: `app/hooks/useStickyNoteContextMenu.ts` が Tauri のネイティブメニューIDをタグ名から直接作っている（`ctx_tag_${tag}`, `ctx_tag_del_${tag}`, `ctx_archive_tag_${tag}`）。特定のタグ名、重複しやすいタグ状態、または安全でない文字を含むタグがあると、ネイティブメニュー作成が途中で失敗し、その付箋だけメニューが出ない可能性がある。
- 履歴確認: タグ名をIDに使う実装自体は以前からあるが、2026-07-07 の変更で「お気に入り」「レシピ」まわりのメニュー分岐が増えている。最近増えたタグ状態や予約タグ混在によって、以前から潜んでいた弱点が今回表面化した可能性が高い。
- 修正済み: タグ名を Tauri ネイティブメニューIDへ直接入れず、`ctx_tag_0` のような安定した連番IDを使うように変更。表示テキストと action に渡すタグ値は従来通り。
- テスト追加済み: 日本語、空白、記号を含むタグ名がメニューIDへ混ざらないこと、タグ系メニューグループ間でIDが分かれることを単体テストで確認。
- 検証済み: `npx vitest run app/hooks/useStickyNoteContextMenu.test.ts`、`npx tsc --noEmit --pretty false`。
## 2026-07-10 openNoteWindow duplicate race fix

- Fixed `app/page.tsx` so note window creation keeps the label in progress until `tauri://created` or `tauri://error` is received.
- Moved in-progress marking to the start of queued creation work; duplicate queued requests wait for creation to settle, then use the existing window focus path.
- Added `app/utils/windowCreation.ts` and `app/utils/windowCreation.test.ts` for same-label in-progress detection.
- Verification passed: `npx vitest run`, `npm run lint`, `npx tsc --noEmit`.
## 2026-07-10 UAT crystal name prefill and settings copy

- Prefilled recipe and QA short names from the first usable source-body line, falling back to the source note title.
- Kept recipe and QA draft bodies unchanged; only term creation continues to remove the selected name line.
- Clarified that triple right-click opens the quick launcher in the Japanese settings label.
- Verification passed: `npx vitest run` (41 files, 282 tests), `npm run lint`, `npx tsc --noEmit`.
## 2026-07-10 sticky note hover focus delay

- Changed sticky-note hover activation from 150ms to 600ms.
- Sticky notes now skip hover focus while the `quick_launcher` window is visible.
- Added a regression test for the delay and launcher focus guard.
- Updated `docs-v2/002_PC.md` §5.3.4, §11.5, and revision history 2.13.
