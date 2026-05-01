---
phase: 19-300ms-pool-ctrl-n
plan: 04
subsystem: perf
tags: [tauri, rust, pool, global-shortcut, ctrl-n, settings, replenish]

# Dependency graph
requires:
  - phase: 19-03
    provides: Pool ライフサイクル JS 側（onFirstChar + rAF ready + lazy結線）
provides:
  - "POOL_TARGET=3 常時維持補充オーケストレーション（fusen_replenish_pool）"
  - "起動時 Pool 補充（setup 内 spawn + 500ms 間隔順次作成）"
  - "グローバル Ctrl+N ショートカット登録（is_focused 競合解決）"
  - "settings.json shortcut_new_note でショートカットカスタマイズ可能"
  - "T2_READY +5s 後の JS 補充トリガ（StickyNote.tsx handleFirstChar 末尾）"
  - "count_missing_pool 純粋関数 + replenish_count_missing Rust ユニットテスト"
affects: [19-05, perf-requirements, pool-architecture]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pool 補充は count_missing_pool 純粋関数で判定（テスト可能に分離）"
    - "グローバルショートカットと既存ハンドラを同一 ShortcutBuilder に統合（重複登録防止）"
    - "cursorPosition() + 50ms タイムアウト → 失敗時プライマリモニタ中央フォールバック"
    - "useCallback でラップした handleCreateNote を useEffect 依存配列に指定（listener 再登録防止）"

key-files:
  created: []
  modified:
    - src-tauri/src/lib.rs
    - src-tauri/src/settings.rs
    - lib/settings-store.test.ts
    - app/components/StickyNote.tsx
    - app/page.tsx

key-decisions:
  - "グローバル Ctrl+N と Ctrl+Shift+H は同一 ShortcutBuilder に登録（別 Builder は重複登録エラーになる）"
  - "Shortcut::try_from() で parse 失敗時は ctrl+n にフォールバック（起動失敗を防ぐ）"
  - "起動時補充は setup() 内で spawn して 2s 待機後に順次作成（pitfall 8 CPU 競合回避）"
  - "T2_READY +5s 補充トリガは handleFirstChar 末尾で発火（try-catch の外側で常に実行）"
  - "pre-commit E2E テスト（sticky-note.spec.ts）が Tauri 窓を要求して timeout するため --no-verify でコミット（既存 infra 問題）"

patterns-established:
  - "Pool 補充判定は count_missing_pool 純粋関数に委譲（WebviewWindows API から分離）"
  - "グローバルショートカット競合解決: is_focused チェックで付箋 focus 時はローカルに委譲"

requirements-completed: [PERF-02, PERF-03, PERF-07, PERF-08]

# Metrics
duration: 33min（前 executor のレート制限再開分含む）
completed: 2026-05-01
---

# Phase 19 Plan 04: Pool補充オーケストレーション + グローバルCtrl+N Summary

**POOL_TARGET=3 常時補充（Rust fusen_replenish_pool）+ tauri-plugin-global-shortcut による Ctrl+N グローバル登録（is_focused 競合解決）+ settings.json shortcut_new_note カスタマイズを Wave 4 で完成**

## Performance

- **Duration:** 33 min（前 executor 中断からの継続）
- **Started:** 2026-05-01T12:27:44+09:00
- **Completed:** 2026-05-01T18:00:24+09:00
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Rust 側に `count_missing_pool` 純粋関数 + `fusen_replenish_pool` コマンドを追加し、POOL_TARGET=3 を常時維持する補充オーケストレーションを実装
- tauri-plugin-global-shortcut に Ctrl+N をグローバル登録（is_focused チェックで付箋 focus 時はローカルに委譲、pitfall 4 対策）
- settings.json の `shortcut_new_note` でショートカットをカスタマイズ可能（parse 失敗時は ctrl+n フォールバック、PERF-08）
- 起動時 Pool 補充（setup 内 spawn → 2s 待機後 500ms 間隔で 3 個順次作成、pitfall 8 CPU 競合回避）
- StickyNote.tsx handleFirstChar 末尾に T2_READY +5s 補充トリガを追加
- page.tsx に `fusen:request_create_global` リスナー追加（cursorPosition() 取得 + 50ms タイムアウト + フォールバック座標）
- replenish_count_missing Rust ユニットテスト GREEN、vitest 108 件 GREEN

## Task Commits

各タスクを個別にコミット:

1. **Task 1: settings.rs 拡張 + lib/settings-store.test.ts でカスタムショートカット parse** - `77f6bc1` (feat) — 前 executor によるコミット済み
2. **Task 2: tauri-plugin-global-shortcut で Ctrl+N 登録（競合解決込み）+ Pool 補充オーケストレーション** - `6969f88` (feat)
3. **Task 3: JS 側の補充トリガ + グローバル shortcut リスナー連携** - `29d170a` (feat)

## Files Created/Modified

- `src-tauri/src/lib.rs` - POOL_TARGET 定数、count_missing_pool 純粋関数、fusen_replenish_pool コマンド、Ctrl+N グローバルショートカット登録、起動時補充 spawn、replenish_count_missing ユニットテスト
- `src-tauri/src/settings.rs` - Settings 構造体に shortcut_new_note: Option<String> 追加（後方互換）
- `lib/settings-store.test.ts` - shortcut_new_note フィールド読み取りテスト追加
- `app/components/StickyNote.tsx` - handleFirstChar 末尾に setTimeout 5000ms の fusen_replenish_pool トリガ追加
- `app/page.tsx` - fusen:request_create_global リスナー追加（cursorPosition + フォールバック座標 + handleCreateNote 呼び出し）

## Decisions Made

- グローバル Ctrl+N と Ctrl+Shift+H は同一 ShortcutBuilder に登録した。別 Builder で追加すると OS レベルの重複登録エラーになるため、既存ハンドラ内で shortcut 比較して振り分ける方式を採用
- `Shortcut::try_from()` が parse 失敗時は `Shortcut::new(Some(Modifiers::CONTROL), Code::KeyN)` にフォールバック（起動失敗を防ぐ）
- 起動時補充は `setup()` 同期ブロック内で呼ばず、`tauri::async_runtime::spawn` で 2 秒後から開始（付箋復元との CPU 競合を回避）
- T2_READY +5s 補充トリガは try-catch の外側（関数末尾）に配置し、lazy 作成の成否に関わらず常に発火させる
- pre-commit の E2E テスト（sticky-note.spec.ts）が Tauri 窓を要求して timeout するため `--no-verify` でコミット（STATE.md 決定事項、既存インフラ問題）

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] replenish_count_missing ユニットテストが前 executor で未追加**
- **Found during:** Task 2 再開時
- **Issue:** 前 executor が lib.rs の実装（count_missing_pool 関数、fusen_replenish_pool コマンド）を完成させたが、pool_tests モジュールに replenish_count_missing テストを追加せずにコミット断絶
- **Fix:** pool_tests モジュールに 4 ケースのユニットテストを追加（0/2/3/5 個の pool に対する不足数検証）
- **Files modified:** src-tauri/src/lib.rs
- **Verification:** `cargo test --manifest-path src-tauri/Cargo.toml replenish` → 1 passed
- **Committed in:** 6969f88 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug/missing unit test)
**Impact on plan:** 計画通りのテスト要件を満たすための修正。スコープ変更なし。

## Issues Encountered

- 前 executor がレート制限で中断し、lib.rs の Task 2 実装が uncommitted のまま残っていた。コードは正しく実装済みだったが unit test が欠けていたため、追加してからコミット
- pre-commit フック（E2E + sticky-note.spec.ts）が既存インフラ問題で timeout するため、`--no-verify` でコミット（STATE.md 決定事項）

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Wave 4 完了: POOL_TARGET=3 補充オーケストレーション、グローバル Ctrl+N、settings.json カスタマイズがすべて実装済み
- Wave 5（Plan 05）に進む準備完了: E2E 検証 + Win32 実測 + perf:check での 300ms 達成確認
- 手動確認が必要: タスクマネージャで起動後 pool-window プロセスが 3 個生成されること、他アプリ focus 時に Ctrl+N で付箋が表示されること

---
*Phase: 19-300ms-pool-ctrl-n*
*Completed: 2026-05-01*
