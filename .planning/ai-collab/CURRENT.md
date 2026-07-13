## 2026-07-13 checkbox marker color boundary

- Limited the orange checkbox marker decoration to `- [ ]` / `- [x]`, excluding trailing whitespace.
- Marked the decoration as non-inclusive so text inserted after the marker does not inherit its color.
- Added a focused regression test for the marker boundary.
- Audited headings, normal lists, links, and bold markers; normal lists had the same trailing-space risk and now use the same non-inclusive boundary.
- Updated sticky-note E2E 3.5 from the removed `input#path` to the current read-only path display and `保存場所を変更` button.

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

## 2026-07-12 monthly backup result screen

- Replaced the browser `alert()` after periodic backup with an app-native success/error result screen.
- Success remains visible until explicitly closed and shows the verified destination, copied file count, execution time, and persisted next-prompt time.
- Failure explicitly states that the existing backup is retained and remains visible until closed.
- Data Management > automatic backup > Details now shows the previous execution time, next confirmation schedule, and one-generation retention.

## 2026-07-12 open folder from an empty note

- Context-menu `フォルダを開く` now preserves the saved-note behavior (select the Markdown file in Explorer).
- For an unsaved empty/pool note, it reuses the existing safe create-folder resolver and opens the current base folder instead of doing nothing.
- Missing base-folder resolution now produces an explicit error rather than a silent no-op.
- Added request-selection regression tests for saved, unsaved, and missing-path cases.
## 2026-07-13 安定化マスタープラン

- 提案した10項目すべてを、機能追加を伴わない必須の安定化作業として整理した。
- `.planning/ROBUSTNESS-PLAN.md` を追加し、Phase 20〜27として、起動・設定の安全化、復旧ドラフト、保存競合防止、ファイル操作の安全化、バックアップ復元保証、PC–iPhone同期の冪等化、障害回帰テスト、診断基盤の統合を計画した。
- ローカル保存と世代管理を安定させてから、Drive・Service Worker同期を変更する順序に固定した。
- 各フェーズは個別に検証・切り戻し可能とする。実装はまだ開始していない。
- 100万人規模での運用負荷と変更リスクを再評価し、計画を縮小版へ改訂した。
- データ損失に直結する7項目は必須とし、削除・移動の全面共通化、複雑な復旧UI、独自ログ基盤は行わない。
- 8フェーズ構成を、PCローカル保護、復旧保証、同期安全化、品質ゲートの4段階へ整理した。

## 2026-07-13 設定ファイルの安全化

- `settings.json` への直接上書きを、一時ファイルへの書き込み・同期・再読込検証後の交換へ変更した。
- 現在の正常設定を `settings.json.bak` として1世代保持し、本体破損時は正常なバックアップを読み込む。
- 本体とバックアップの両方が壊れている場合はエラーとし、既定値で設定全体を上書きしない。
- 設定保存コマンドは既存設定の読み込み失敗を握りつぶさず、保存前に中断する。
- 設定関連Rustテスト4件、Rust全体テスト（186件成功・2件ignore）、VitePress設計書ビルドが通過した。

## 2026-07-13 保存先異常の検知

- 保存先の存在、ディレクトリ種別、一覧読取、試し書き、ディスク同期、確認ファイル削除を検証するRustコマンドを追加した。
- 設定済み保存先が利用不能でも既定フォルダを自動作成・設定せず、元のbase_pathを保持して付箋復元を停止するよう変更した。
- 設定画面には再接続または明示的な保存先変更を案内し、異常が解消するまで閉じない。
- 自動保存失敗表示へ、保存先接続・空き容量・権限の確認と画面を閉じない案内を追加した。
- 保存先診断Rustテスト3件、Rust全体テスト（189件成功・2件ignore）、TypeScript、Vitest全体、VitePress設計書ビルドが通過した。
- ユーザー方針: 以後の重い全体テストと実機確認は第1段階の最後にまとめる。各小修正では対象を絞った最小テストだけ実施する。

## 2026-07-13 保存失敗時だけの復旧コピー

- 正常時の処理を重くしないため、常時ドラフト保存は採用しなかった。
- 通常保存が失敗した場合だけ、書き込む予定だった完全な付箋内容を `%APPDATA%/OreNoFusen/recovery-drafts` へ原子的に退避する。
- 次回読込時は通常ファイルより新しい復旧コピーだけを使用し、通常保存成功後に対応コピーを削除する。
- 正常保存前の800ms以内に強制終了した場合の入力は、負荷とのトレードオフとして保護対象外とする。
- 対象Rustテスト2件が通過。全体テストと実機確認は第1段階の最後にまとめて実施する。

## 2026-07-13 iPhone→PC再受信の重複防止

- PC保存成功後・Drive ack前にアプリが終了すると、再起動後に同じ受信IDから付箋が重複作成される穴を確認した。
- 受信IDはSHA-256ハッシュとして付箋の管理情報へ保存し、再受信時に同じハッシュがあれば画像再取得・付箋再作成を行わずackだけ再試行する。
- 新規受信でも、既存確認と付箋作成をRustのAppState排他内で行い、同時処理による重複を防ぐ。
- 該当仕様は `docs-v2/003_IPHONE.md` 図3-4、改版1.19。
- 全体テストと実機確認は第1段階の最後にまとめ、今回は対象RustテストとTypeScript確認だけを行う。

## 2026-07-14 復旧コピーの最小診断ログ

- 新しいログ基盤は追加せず、既存Rustログへ保存障害時だけ3種類を記録する。
- 記録対象は、復旧コピー作成成功、通常保存と復旧コピー作成の両方の失敗、次回読込時の復旧コピー使用。
- 付箋本文とフルパスは記録せず、`sanitize_path` を通したファイル名だけを使用する。
- 正常保存時の追加ログ・追加I/Oは行わない。
- 該当仕様は `docs-v2/002_PC.md` §7.1.3、改版2.24。
- 検証済み: 復旧コピー対象Rustテスト2件、Rust全体194件成功・2件ignore、Vitest全体成功、TypeScript成功、VitePressビルド成功、データ安全性E2E 3件成功・1件skip。
- 実機確認待ち: (1) 一時保存先を切断してbase_pathが保持され警告が出ること、(2) 保存失敗後に復旧内容が再表示され正常保存後に復旧コピーが消えること、(3) iPhone→PC保存後・Drive ack前相当のキューを再受信して付箋が重複しないこと。
- 正常保存時の軽量化: 復旧パスの確認だけで `recovery-drafts` を作成していた処理を修正し、通常保存失敗時だけフォルダを作る。削除も対象ファイルが存在する場合だけ行う。
## 2026-07-13 editor shortcut settings and scope correction

- Added settings for exactly four existing RichTextEditor actions: bold, heading, bullet list, and checkbox.
- Preserved the existing four global hotkey settings; removed the mistakenly added enable switches and F2/search/delete settings before completing this work.
- Editor shortcut capture rejects duplicates against all four global and four editor shortcut values, persists through the existing settings path, and rebuilds the editor keymap when settings change.
- Regression prevention: when a request contains a term that can name both a UI control and an app action (for example "checkbox"), restate the concrete action list before implementation; do not expand the list without confirmation. Before handoff, compare the final action list with that restatement and audit `git diff` for out-of-scope fields.
- Verification passed: TypeScript, focused tests (19), full Vitest (46 files / 308 tests), Rust `cargo check`, and VitePress docs build.
## 2026-07-14 画像貼り付け後の入力位置調査

- クリップボード画像の貼り付けは `app/components/RichTextEditor.tsx` で画像Markdownだけを挿入し、カーソルを閉じ `)` の直後へ置いているため、画像の右側に見えて次の入力位置が分かりにくい。
- 最小修正案は、貼り付ける内容を `![image](path)\n` とし、カーソルを改行後へ置くこと。通常のテキスト貼り付けや画面キャプチャ機能には触れない。
- `src-tauri/src/logic.rs` は先頭の画像Markdownを除外し、次の空でないテキスト行をファイル名候補にする実装・テストが既にあるため、希望するファイル名動作は可能。
- ファイル名のリネーム確定は現状、編集終了時（付箋外クリック・Esc・ウィンドウblur等）の `allowRename=true` 保存で行われる。
- 実装済み: 画像Markdown末尾へ改行を追加し、カーソルを次行へ置くよう変更。通常のテキスト貼り付けと画面キャプチャ処理は変更していない。
- `RichTextEditor.imagePaste.test.ts` を追加し、貼り付け文字列が改行で終わることを確認。
- 検証済み: 対象Vitest 1件、画像行を除外するRustテスト3件。
## 2026-07-14 画像クリックで編集終了する動作の調査

- 現状は `StickyNote.tsx` の外側クリック判定が `editorHost` 内を一律除外し、画像プレビューもその内側にあるため、画像をクリックしても編集終了しない。
- `ImageWidget.ignoreEvent()` も画像内イベントをCodeMirrorの編集操作から除外しているため、通常のフォーカス離脱では編集終了しない。
- 最小修正案は、編集モードの画像本体クリックだけを検出して既存の `onBlur` / `handleEditBlur` を呼ぶこと。画像右下のリサイズハンドル、ドラッグ、通常テキスト、表示モードには適用しない。
- 編集終了時は既存の `allowRename=true` 保存を通るため、画像の次行に入力したテキストによるファイル名確定も同時に行われる。
- 実装済み: 編集中の画像本体クリックだけを既存の編集終了処理へ接続し、保存とファイル名確定が行われるようにした。
- リサイズハンドル、画像ウィジェット外の画像、通常テキストでは編集終了しない判定テストを追加。
- 検証済み: 対象Vitest 2件、TypeScript、差分チェック。
- 実機確認: 画像クリックで編集終了するようになったが、モード切替時に画像が一瞬フラッシュする。
- 原因: 編集用CodeMirror画像から表示用`MarkdownRenderer`画像へDOMを作り直し、`ResizableImage`がローカルパスを非同期でasset URLへ変換するまで1×1透明GIFを初期表示するため。
- フラッシュは必須ではない。最小改善案は変換済みasset URLをプロセス内キャッシュし、同じ画像の表示モード再生成時は最初から実画像URLを使うこと。ファイル内容や保存処理は変更しない。
- 実装済み: ローカル画像の変換済みasset URLを最大256件のメモリキャッシュへ保持し、同じ画像の再マウント時は透明GIFを挟まず最初から実画像URLを使用する。
- キャッシュ対象はURL文字列だけで、画像データ・追加ディスクI/O・追加変換処理は持たない。上限超過時は最古のエントリを削除する。
- 検証済み: `ResizableImage` / 画像クリック対象Vitest 6件、TypeScript、差分チェック。
- 実機確認で画像クリックによる編集終了が動作しないことを確認。
- 根本原因: `ImageWidget.ignoreEvent() = true` のため、CodeMirror の `eventBelongsToEditor()` が画像ウィジェット由来のクリックを除外し、追加した `EditorView.domEventHandlers.click` へ到達しない。
- 前回テストはクリック対象の要素判定だけで、CodeMirrorのイベント遮断経路を検証していなかった。
- 再修正案: 画像ウィジェット内で画像本体クリックを直接受け、CodeMirrorのイベント処理を経由せず既存の編集終了コールバックへ通知する。リサイズハンドルは通知対象外のままにする。
- 再修正済み: 画像ウィジェット内のネイティブclickから専用イベント `fusen:image-widget-click` をエディタDOMへ直接通知し、既存の編集終了コールバックを呼ぶよう変更。到達しなかったCodeMirror clickハンドラは削除。
- テストを専用イベントの到達確認へ変更し、画像本体では1回通知、リサイズハンドルとウィジェット外画像では通知しないことを確認。
- 検証済み: 対象Vitest 2件、TypeScript、差分チェック。
