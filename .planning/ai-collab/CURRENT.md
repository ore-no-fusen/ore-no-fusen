## 2026-07-12 crystal purpose exploration

- Expanded `docs-v2/002_PC.md` §11.1 with the core purpose: save what worked, find it next time, reuse and improve it until the user becomes skilled almost without noticing.
- Added a lifecycle diagram, a current-feature mapping table, and an AI-agent instruction recipe example.
- Captured a high-priority todo for cross-searching crystal names, bodies, and tags while preserving the existing Ctrl+P shelf behavior.

## 2026-07-12 yellow welcome note

- Explicitly saves and opens the first-launch welcome note with the semantic yellow color (`#f7e9b0`).
- The change is limited to the first-launch guide note; normal and existing notes are unchanged.

## 2026-07-12 Search Console duplicate canonical fix

- Unified the landing page canonical URL on the public root URL (`https://ore-no-fusen.vercel.app`).
- Removed the duplicate `/landing` entry from the sitemap while keeping the existing Vercel root rewrite behavior.
- Scope is limited to search indexing metadata; Tauri and viewer behavior are unchanged.

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
## 2026-07-10 markdown Windows link closing parenthesis

- Fixed `fusen_open_file` path resolution so unquoted Markdown links such as `[name](D:\\path\\file.md)` do not pass the closing `)` to Explorer.
- The original path wins when it exists; the closing `)` is removed only when the corrected candidate exists, preserving legitimate filenames ending in `)`.
- Added Rust regression tests and updated `docs-v2/002_PC.md` §5.3.1 / revision 2.14.
- Verification passed: `cargo test` (178 passed, 2 ignored).

## 2026-07-11 alarm weekday display

- Root cause: the alarm dialog delegated its visible date/weekday formatting to Chromium's native `datetime-local` control, which rendered the Japanese weekday as empty parentheses on the affected Windows environment.
- Kept the native date/time picker as the interaction layer, but replaced its visible field with an app-formatted `YYYY/MM/DD (曜) HH:mm` value.
- Added unit coverage for all seven Japanese weekdays and invalid date-time values.
- Verification passed: `npx vitest run app/utils/alarmDateTime.test.ts`, `npm test`, `npm run lint`, `npx tsc --noEmit --pretty false`.

## 2026-07-11 alarm refire investigation

- Added a reproduction test that loads an expired alarm, lets it fire, clicks the stop bar, then advances 20 seconds (past both the 3-second sound loop and 10-second alarm polling intervals).
- The alarm did not fire again: the stop bar stayed absent, audio play count did not increase, and the saved frontmatter no longer contained `alarm_at`.
- Result: the normal single-window path does not reproduce refiring. A real observation likely needs an external condition such as a second window for the same note or stale alarm metadata being reloaded after a failed/competing save.
- Verification passed: targeted Vitest reproduction and `npx tsc --noEmit --pretty false`.
## 2026-07-11 quick launcher hang and transient blur

- Root cause: triple-right-click toggle events performed WebView window operations directly from the event thread, with no in-flight guard; Windows could report the app as not responding with an unpainted launcher window.
- Routed toggle window operations through Tauri's main UI thread and ignored duplicate toggles while one is in progress.
- Replaced immediate blur-close with a 120ms delayed Tauri `isFocused()` verification, so QA/tab clicks do not hide the launcher on transient WebView2 blur.
- Added frontend logic coverage and updated `docs-v2/002_PC.md` §11.5 / revision 2.15.
- Verification passed: `cargo test` (178 passed, 2 ignored), `npm test`, `npx tsc --noEmit --pretty false`, and `npm run docs:build` from `docs-v2`.
## 2026-07-11 crystal removal stays in crystal area

- Changed launcher removal for recipe / QA / term from de-crystallizing into the normal note root to moving into `Recipes/Trash`, `QA/Trash`, or `Terms/Trash`.
- Crystal reserved tags are preserved for recoverability; the direct-folder scanners exclude nested Trash automatically.
- Open crystal windows are hidden and destroyed on the Tauri main thread after a successful move.
- Favorites keep the existing behavior: remove only the `shortcut` tag without deleting the note.
- Updated launcher wording/tests and `docs-v2/002_PC.md` §11.5 / revision 2.16.
- Follow-up decision: launcher crystal × and the crystal-window trash button are the same no-confirmation action.
- Open crystal windows now save their latest body/frontmatter before moving through the existing `fusen_move_to_trash` path; closed crystals move directly to their own `Recipes/Trash`, `QA/Trash`, or `Terms/Trash`.
- Trash completion removes stale launcher ordering entries and emits the shelf-change event so the launcher list updates.
- Crash hardening: the crystal trash listener is registered once and calls the latest handler through a ref; Rust accepts only one in-flight trash operation per normalized path.
- `fusen_move_to_trash` now returns `{ moved, path }`; duplicate/in-flight/already-moved requests return `moved: false`, so only the real move plays the delete sound and destroys the window.
- Backup recovery: successful backup destinations are retained as the latest two `backup_history` entries and shown in Data Management.
- Restore validates the selected backup, copies it to `Documents/OreNoFusen_Recovery/OreNoFusen_recovered_TIMESTAMP`, verifies Markdown counts, switches `base_path`, then exits normally with instructions to start the app again without modifying the backup original.
- Monthly safety backup is enabled by default, asks before copying, retains one verified generation at `Documents/OreNoFusen_Backup/Monthly`, retries a first dismissal after 7 days, and disables further prompts after a second dismissal. The restore UI recommends it before the two manual backup records.
- Settings policy: safe defaults must work without configuration; users may override them. There is no cross-page/global reset. Only complex settings may offer a reset inside that specific item. Monthly reminder interval defaults to 30 days with 60/90-day choices.
- Settings visual cleanup: simplified the shell to a restrained slate/white palette, narrowed the navigation, constrained content width, standardized data cards, removed dashed and broad warning treatments, removed the periodic-backup reset button, and renamed user-facing monthly backup copy to periodic safety backup where interval choices make "monthly" inaccurate.
- Settings navigation order now follows importance: General, Data, iPhone, Hotkeys, Templates; Help & Support order is Guide, About, Feedback, Developer conversation, Support. Appearance was merged into General because it contained only font size.
- Data management is ordered by real workflow: 1 storage location, 2 import, 3 backup (automatic + manual), 4 recovery. Every stage states when to use it and what the operation changes. Storage location remains the visually strongest item.
- Root-cause correction: launcher trash uses targeted `emit_to` with the requested path; each note rejects mismatched paths and non-crystal tags.
- Defense in depth: Rust blocks a burst of trash operations targeting different paths within two seconds, preventing a broadcast/listener bug from moving every open note.
- Minimal recovery audit: every successful trash move appends timestamp/source/destination/origin metadata to `%APPDATA%/OreNoFusen/trash_operations.jsonl`; note bodies are not logged.
- Verification passed: `cargo test` (178 passed, 2 ignored), `npx vitest run app/components/QuickLauncher.test.ts`, `npx tsc --noEmit --pretty false`, and `npm run docs:build` from `docs-v2`.

## 2026-07-12 settings hotkey progressive disclosure

- Reordered Hotkeys by expected use: new note, quick launcher, arrange, then hide/show all notes.
- Each row now shows only its current value and default value; editing, alternate triggers, and quick-launcher triple-right-click are shown under that row's Details control.
- Registration, conflict checking, and persistence behavior were not changed.
- Updated `docs-v2/002_PC.md` §10.1 to define the same order and progressive-disclosure rule.
- Verification passed: `npx tsc --noEmit --pretty false`, full `npm test -- --run`, and the `docs-v2` VitePress build.

## 2026-07-12 numbered settings overview

- Adopted a shared numbered-card pattern so each page exposes its item count and purpose before detailed controls.
- Applied the pattern to General, Data, iPhone, Hotkeys, Templates, Help, and Advanced tools; detailed explanations and controls remain progressively disclosed.
- Fixed automatic backup re-enabling: enabled state, skip count, and next-prompt reset are now persisted in one atomic settings update instead of three stale-state updates.
- Added focused regression tests for the automatic-backup toggle patch.
- Verification passed: TypeScript, focused automatic-backup tests (2), full Vitest suite, and VitePress docs build.
- Next production build compiled and type-checked successfully, then failed during page-data collection because `.next/server/pages-manifest.json` disappeared; this is consistent with a concurrently used `.next` directory rather than a source compilation failure.
- In-app browser visual verification was unavailable; verify card spacing, expansion, and iPhone conditional rows in the running Tauri app.
- Follow-up visual consistency: removed the legacy database icon before Data Management item 1, so the numbered circle is the sole leading marker.
- iPhone items 2-4 are now independent collapsed detail cards (initial setup, connected devices, connection diagnostics); their summary rows remain visible while account data, QR codes, device actions, and diagnostics stay hidden until opened.
- Removed the remaining small content icons from Data import/manual-backup headings. Detail controls now keep the single label `詳細`; open state is represented consistently by a rotating chevron instead of changing the wording to `詳細を閉じる` or `詳細を表示中`.
- Follow-up TypeScript verification passed.
