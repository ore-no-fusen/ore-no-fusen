---
phase: quick-001
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/lib.rs
  - app/hooks/useEditMode.ts
autonomous: true
requirements: [DEAD-CODE-01]

must_haves:
  truths:
    - "cargo check がエラーなしで通る"
    - "JSから未使用のコマンドが invoke_handler から除外されている"
    - "useEditMode.ts の型定義に存在しない isCapturingRef フィールドが消えている"
  artifacts:
    - path: "src-tauri/src/lib.rs"
      provides: "未使用 tauri::command 関数と invoke_handler 登録の削除"
    - path: "app/hooks/useEditMode.ts"
      provides: "UseEditModeReturn 型から未使用フィールドの削除"
  key_links:
    - from: "src-tauri/src/lib.rs invoke_handler"
      to: "削除対象6関数"
      via: "tauri::generate_handler! マクロ"
      pattern: "fusen_pick_folder|fusen_get_note|fusen_force_focus|fusen_rename_note|fusen_import_from_folder|fusen_refresh_notes_with_tags"
---

<objective>
JS から一切呼ばれていない Rust の #[tauri::command] 関数6件と、
型定義のみに残る未使用フィールドを削除する。

Purpose: コードベースの明瞭性を高め、誤用・誤解のリスクをなくす。
Output: lib.rs の関数削除 + invoke_handler 更新、useEditMode.ts の型フィールド削除。
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@src-tauri/src/lib.rs
@app/hooks/useEditMode.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rust 未使用コマンド関数と invoke_handler 登録を削除</name>
  <files>src-tauri/src/lib.rs</files>
  <action>
    削除前確認（すべて app/ フォルダ全体で grep 済み → 0件 → 削除安全）:
    - fusen_pick_folder: app/ に invoke 呼び出しなし
    - fusen_get_note: app/ に invoke 呼び出しなし
    - fusen_force_focus: app/ に invoke 呼び出しなし
    - fusen_rename_note: app/ に invoke 呼び出しなし
    - fusen_import_from_folder: app/ に invoke 呼び出しなし
    - fusen_refresh_notes_with_tags: app/ に invoke 呼び出しなし

    削除手順:
    1. 行14 のコメントアウト済みメニュー import を削除:
       `// use tauri::menu::{Menu, MenuItem, CheckMenuItem, Submenu, PredefinedMenuItem, MenuEvent};`

    2. 以下の関数ブロックを丸ごと削除（関数本体全体）:
       - `fn fusen_pick_folder()` (行52-56付近)
       - `fn fusen_get_note(...)` (行60-始まる関数)
       - `async fn fusen_force_focus(...)` (行135-始まる関数)
       - `fn fusen_rename_note(...)` (行511-始まる関数)
       - `async fn fusen_import_from_folder(...)` (行916-始まる関数)
       - `fn fusen_refresh_notes_with_tags(...)` (行984-始まる関数)

    3. invoke_handler! マクロ（行1339付近）から以下6エントリを削除:
       - `fusen_get_note,`
       - `fusen_force_focus,`
       - `fusen_rename_note,`
       - `fusen_refresh_notes_with_tags,`
       - `fusen_import_from_folder, // [NEW] インポートコマンド`
       - `fusen_pick_folder,        // [NEW] 純粋なフォルダ選択`

    注意: import モジュール `mod import;` は fusen_import_from_folder 以外にも使われている可能性がある。
    削除前に import モジュールが他で参照されていなければ `mod import;` も削除する。
    確認コマンド: grep -n "import::" src-tauri/src/lib.rs
  </action>
  <verify>
    <automated>cd D:/Users/uck/Documents/curry-project/ore-no-fusen &amp;&amp; cargo check --manifest-path src-tauri/Cargo.toml 2>&amp;1 | tail -5</automated>
  </verify>
  <done>cargo check が error: 0 で通る。削除した6関数名が lib.rs に存在しない。</done>
</task>

<task type="auto">
  <name>Task 2: useEditMode.ts の型定義から isCapturingRef フィールドを削除</name>
  <files>app/hooks/useEditMode.ts</files>
  <action>
    確認済み事実:
    - UseEditModeReturn 型の isCapturingRef?: React.MutableRefObject&lt;boolean&gt; (行37) はオプショナルフィールド
    - useEditMode 関数の return 文 (行129-143) に isCapturingRef は含まれていない（実際には返却されていない）
    - StickyNote.tsx は独立した useRef(false) で isCapturingRef を管理しており、useEditMode の戻り値から取得していない
    - useScreenCapture.ts も独立した useRef(false) で管理

    削除手順:
    行37の以下の行を削除する:
    `    isCapturingRef?: React.MutableRefObject&lt;boolean&gt;;`
  </action>
  <verify>
    <automated>cd D:/Users/uck/Documents/curry-project/ore-no-fusen &amp;&amp; npx tsc --noEmit 2>&amp;1 | tail -10</automated>
  </verify>
  <done>TypeScript コンパイルエラーなし。useEditMode.ts の UseEditModeReturn 型に isCapturingRef が存在しない。</done>
</task>

</tasks>

<verification>
1. `cargo check` エラーなし
2. `npx tsc --noEmit` エラーなし
3. 削除対象6関数が lib.rs に存在しないことを grep で確認
4. invoke_handler! マクロから6エントリが除外されていることを確認
</verification>

<success_criteria>
- lib.rs から未使用 #[tauri::command] 6件とコメントアウト import が消えている
- invoke_handler! マクロに削除した関数が含まれていない
- useEditMode.ts の UseEditModeReturn 型に isCapturingRef フィールドが存在しない
- ビルドチェック（cargo check + tsc --noEmit）が両方エラーなし
</success_criteria>

<output>
完了後、`.planning/quick/001-dead-code-removal/001-SUMMARY.md` を作成すること。
</output>
