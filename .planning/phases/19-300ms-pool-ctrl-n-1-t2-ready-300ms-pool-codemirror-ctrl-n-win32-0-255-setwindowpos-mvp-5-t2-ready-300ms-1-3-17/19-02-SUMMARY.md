---
phase: 19-300ms-pool-ctrl-n
plan: 02
subsystem: rust-core
tags: [rust, win32, pool, layered-window, perflog, alpha, mutex]

# Dependency graph
requires: ["19-01"]
provides:
  - "create_pool_window_internal: WS_EX_LAYERED + α=0 + 画面外配置（-10000,-10000）で Pool 窓生成"
  - "fusen_show_at_position: SetWindowPos → α=255 → SetForegroundWindow を 1 関数で連続実行（Atomic Coordination）"
  - "fusen_create_note_lazy: 1 文字目時のみ呼ぶ遅延ファイル作成コマンド（Mutex 排他で連番衝突防止）"
  - "do_create_note: private helper（fusen_create_note / fusen_create_note_lazy 両方から呼ぶ）"
  - "perflog: T1_RUST_ENTER / T2_READY / POOL_CREATED の 3 計測ポイント挿入済み"
affects: [19-03, 19-04, 19-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "WS_EX_LAYERED OR パターン: GetWindowLongPtrW | (WS_EX_LAYERED.0 as isize) — 既存 EX style を保持"
    - "α=0 → α=255 Atomic: 1 関数内で SetWindowPos → SetLayeredWindowAttributes → SetForegroundWindow"
    - "Mutex 1 トランザクション: lock を get_next_seq〜apply_add_note まで保持して連番衝突防止"
    - "画面外配置 (-10000, -10000): α=0 透明でも誤操作リスクゼロのため追い出す（pitfall 3）"

key-files:
  modified:
    - src-tauri/src/lib.rs

key-decisions:
  - "pitfall 6 対策: SetLayeredWindowAttributes(α=255) を SetForegroundWindow より先に実行（透明窓に focus → 1 文字目消失バグを防ぐ）"
  - "do_create_note で Mutex を全区間保持: get_next_seq も排他区間内に入れる（pool 窓同時昇格の連番衝突を物理的に防止）"
  - "pool_window_layered / fusen_show_at_position_atomic: 実 HWND が必要なため #[ignore] のまま（Windows runner でのみ --ignored で実行）"
  - "pool_lazy_create は tempdir で非 HWND テストが可能 → #[ignore] を外して GREEN 化"

# Metrics
duration: 15min
completed: 2026-05-01
---

# Phase 19 Plan 02: Rust コア実装（Layered Pool）Summary

**WS_EX_LAYERED + α=0 で Pool 窓を透明生成し、Ctrl+N 時に 1 Rust 関数内で α=0→255 + SetForegroundWindow を Atomic に実行する物理基盤を完成させた**

## Performance

- **Duration:** 約 15 分
- **Started:** 2026-05-01T02:18:20Z
- **Completed:** 2026-05-01T02:33:00Z
- **Tasks:** 3
- **Files modified:** 2（src-tauri/src/lib.rs、app/components/StickyNote.tsx）

## Accomplishments

- `create_pool_window_internal` が WS_EX_LAYERED + α=0 + 画面外配置 (-10000, -10000) で Pool 窓を生成
- `fusen_show_at_position` が SetWindowPos → α=255 → SetForegroundWindow を 1 関数内で連続実行（JS からの複数 await 禁止・Atomic Coordination Constraint を物理的に強制）
- `fusen_create_note_lazy` を新規追加し invoke_handler に登録済み
- `do_create_note` helper で Mutex 1 トランザクション確立（get_next_seq〜apply_add_note を lock 保持）
- perflog に T1_RUST_ENTER / T2_READY / POOL_CREATED の 3 計測ポイントを挿入
- `pool_lazy_create` テスト GREEN（79 passed / 0 failed / 2 ignored）
- `pool_window_layered` / `fusen_show_at_position_atomic` は #[ignore] で Windows runner 向けに記述済み
- `cargo build --release` 成功
- `include_str!` メタテスト 0 件（grep 確認済み）

## Task Commits

1. **Task 1: create_pool_window_internal WS_EX_LAYERED 化** - `0622876` (feat)
2. **Task 2: fusen_show_at_position α=0→255 + perflog T1/T2** - `2ddc561` (feat)
3. **Task 3: fusen_create_note_lazy + do_create_note + pool_lazy_create GREEN** - `08c99d2` (feat)

## Files Created/Modified

- `src-tauri/src/lib.rs`
  - `create_pool_window_internal`: WS_EX_LAYERED OR 付与 → SetLayeredWindowAttributes(α=0) → SetWindowPos(-10000,-10000) → ShowWindow(SW_SHOWNOACTIVATE) → perflog POOL_CREATED
  - `fusen_show_at_position`: `run_id: Option<String>` 引数追加、SetWindowPos 直後に SetLayeredWindowAttributes(α=255)、T1_RUST_ENTER / T2_READY 計測ポイント挿入
  - `do_create_note`: private helper（Mutex 1 トランザクション）
  - `fusen_create_note`: do_create_note の薄ラッパ（後方互換）
  - `fusen_create_note_lazy`: 新規コマンド（invoke_handler 登録済み）
  - `pool_tests`: pool_lazy_create GREEN 化、pool_window_layered / fusen_show_at_position_atomic は #[ignore] 付き Windows runner 向けに更新
- `app/components/StickyNote.tsx`
  - `fusen_show_at_position` 呼び出しに `runId: event.payload.runId ?? null` フィールドを追加

## Decisions Made

- **pitfall 6 対策を厳守**: α=255 を SetForegroundWindow より先に設定する順序（透明窓 focus → 1 文字目消失バグの防止）
- **Mutex 全区間保持**: 既存 `fusen_create_note` は lock を apply_add_note のみで取っていたが、`do_create_note` では get_next_seq も排他区間内に含めて pool 窓間の連番衝突を物理的に防止
- **実 HWND テストは #[ignore]**: pool_window_layered / fusen_show_at_position_atomic は Tauri mock が Win32 HWND を提供できないため、CI Linux では skip して Windows runner でのみ `--ignored` で実行する方針を採用

## Deviations from Plan

None - plan executed exactly as written.

pool_lazy_create テストについて: Wave 0 で `unimplemented!()` プレースホルダとして `#[ignore]` 付きで置いていたが、Task 3 で `do_create_note` が実装された後に `#[ignore]` を外して GREEN 化した（計画通りの Wave 2 手順）。

## Self-Check: PASSED

- `src-tauri/src/lib.rs` 存在確認: FOUND
- `app/components/StickyNote.tsx` 存在確認: FOUND
- Commit 0622876 存在確認: FOUND
- Commit 2ddc561 存在確認: FOUND
- Commit 08c99d2 存在確認: FOUND
- pool_lazy_create: ok（79 passed / 0 failed）
- cargo build --release: Finished (exit 0)
- include_str! 0 件: CONFIRMED

---
*Phase: 19-300ms-pool-ctrl-n*
*Completed: 2026-05-01*
