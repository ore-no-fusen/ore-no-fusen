---
phase: quick-001
plan: "01"
subsystem: backend-frontend
tags: [dead-code, refactor, rust, typescript]
dependency_graph:
  requires: []
  provides: [DEAD-CODE-01]
  affects: [src-tauri/src/lib.rs, app/hooks/useEditMode.ts]
tech_stack:
  added: []
  patterns: []
key_files:
  created: []
  modified:
    - src-tauri/src/lib.rs
    - app/hooks/useEditMode.ts
decisions:
  - "mod import; は fusen_import_from_folder 内のみで使用されていたため、関数削除と同時に除去"
  - "コメントアウト済みの menu import 行も合わせて削除"
metrics:
  duration: "~10 min"
  completed_date: "2026-03-14"
  tasks_completed: 2
  files_modified: 2
---

# Phase quick-001 Plan 01: Dead Code Removal Summary

**One-liner:** JS から未使用の Rust コマンド6件 + 型定義の幽霊フィールドを削除し、コードベースの明瞭性を向上

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Rust 未使用コマンド関数6件と invoke_handler 登録を削除 | 5eb8ce8 | src-tauri/src/lib.rs |
| 2 | useEditMode.ts の型定義から isCapturingRef フィールドを削除 | 8fde980 | app/hooks/useEditMode.ts |

## Changes Made

### Task 1: src-tauri/src/lib.rs

削除した関数:
- `fusen_pick_folder` — 副作用のないフォルダ選択（インポート元選択用）
- `fusen_get_note` — ノートメタ取得
- `fusen_force_focus` — ウィンドウフォアグラウンド強制
- `fusen_rename_note` — ノートリネーム
- `fusen_import_from_folder` — フォルダからインポート
- `fusen_refresh_notes_with_tags` — タグ付きノート一覧更新

削除したモジュール・行:
- `mod import;` (fusen_import_from_folder 内のみで使用)
- コメントアウト済み `// use tauri::menu::{...};`

invoke_handler! から除外した6エントリもすべて削除。

### Task 2: app/hooks/useEditMode.ts

`UseEditModeReturn` 型から以下を削除:
- `isCapturingRef?: React.MutableRefObject<boolean>;` (return 文に含まれておらず実質的に存在しないフィールド)

## Verification

- `cargo check` — error: 0 で通過
- `npx tsc --noEmit` — エラーなし
- 削除した6関数名が lib.rs に存在しないことを grep で確認

## Deviations from Plan

None - プランどおりに実行。`mod import;` の削除も grep 確認の結果プランで想定されていた通り実施。

## Self-Check: PASSED

- src-tauri/src/lib.rs 修正済み確認
- app/hooks/useEditMode.ts 修正済み確認
- コミット 5eb8ce8 存在確認
- コミット 8fde980 存在確認
