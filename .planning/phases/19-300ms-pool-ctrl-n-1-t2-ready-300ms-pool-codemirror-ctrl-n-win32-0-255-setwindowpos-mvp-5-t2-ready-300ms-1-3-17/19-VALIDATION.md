---
phase: 19
slug: 300ms-pool-ctrl-n
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-30
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Phase Goal: Ctrl+N → T2_READY 中央値 300ms 以内（MVP「すぐ書ける」の核心）

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (frontend unit)** | Vitest 1.x + @testing-library/react 16.3.1 |
| **Framework (E2E)** | Playwright 1.57.0（dev サーバ port 3003） |
| **Framework (Rust)** | `cargo test`（既存パターン：lib.rs 末尾 `#[cfg(test)] mod` + tempfile 3.8 dev-dep） |
| **Phase-specific** | `npm run perf:check` — JSON Lines パース → 中央値 ≤300ms 判定 → exit 0/1 |
| **Config files** | `vitest.config.ts` / `playwright.config.ts` / `src-tauri/Cargo.toml [dev-dependencies]` |
| **Quick run command** | `npm test` (~5s) |
| **Full suite command** | `npm test && npm run test:e2e && cargo test --manifest-path src-tauri/Cargo.toml && npm run perf:check` |
| **Estimated runtime (quick)** | ~5 sec |
| **Estimated runtime (full)** | ~3-5 min（E2E + 5 サンプル中央値計測） |

---

## Sampling Rate

Nyquist 観点：「正しさ」を見抜く最小サンプリング頻度。

- **After every task commit:** Run `npm test`（vitest run、5 秒以内のユニットのみ）
- **After every plan wave:** Run `npm test && cargo test --manifest-path src-tauri/Cargo.toml && npm run test:e2e`
- **Before `/gsd:verify-work`:** Full suite（含む `npm run perf:check` 5 サンプル中央値判定）+ 手動検証（Spy++ / グローバル Ctrl+N 実機）
- **Max feedback latency:** 5 秒（task commit 時）/ 5 分（wave merge 時）

**3 連続自動検証なしを禁止**：3 タスク連続で `<automated>` verify が無い場合、Wave 0 を追加するか manual-only 行を追加する。

---

## Per-Task Verification Map

> Plans が確定後（gsd-planner 実行後）に Task ID と紐付けて完成させる。
> 現時点では Requirement 単位で test type を確定させ、ファイルが Wave 0 で作られる前提。

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | 0 | (Wave 0) | infra | `ls e2e/perf-*.spec.ts scripts/perf-check.mjs` | ❌ Wave 0 | ⬜ pending |
| TBD | TBD | 1+ | PERF-01 | E2E + 解析 | `npm run test:e2e -- --grep "ctrl-n-300ms" && npm run perf:check` | ❌ Wave 0 (e2e/perf-300ms.spec.ts, scripts/perf-check.mjs) | ⬜ pending |
| TBD | TBD | 1+ | PERF-02 | E2E | `npm run test:e2e -- --grep "ctrl-n-burst"` | ❌ Wave 0 (e2e/perf-burst.spec.ts) | ⬜ pending |
| TBD | TBD | 1+ | PERF-03 | E2E | `npm run test:e2e -- --grep "ctrl-n-loaded"` | ❌ Wave 0 (e2e/perf-load.spec.ts, e2e/fixtures/seed-17-notes.ts) | ⬜ pending |
| TBD | TBD | 1+ | PERF-04 | Vitest 単体 + Rust 単体 | `npx vitest run app/components/StickyNote.pool.test.tsx && cargo test --manifest-path src-tauri/Cargo.toml pool_lazy_create` | ❌ Wave 0 (StickyNote.pool.test.tsx, lib.rs に test mod 追加) | ⬜ pending |
| TBD | TBD | 1+ | PERF-05 | Rust 単体 + 手動目視 | `cargo test --manifest-path src-tauri/Cargo.toml pool_window_layered` (+ Spy++ 目視) | ❌ Wave 0 (lib.rs test mod) + manual-only | ⬜ pending |
| TBD | TBD | 1+ | PERF-06 | Rust 単体 + JSON Lines 順序 | `cargo test --manifest-path src-tauri/Cargo.toml fusen_show_at_position_atomic` | ❌ Wave 0 | ⬜ pending |
| TBD | TBD | 1+ | PERF-07 | manual-only | （他アプリ→Ctrl+N 実機確認） | manual-only | ⬜ pending |
| TBD | TBD | 1+ | PERF-08 | Vitest + manual | `npx vitest run lib/settings-store.test.ts` | ✅ 既存 lib/settings-store.test.ts 拡張 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

実装前に作る必要があるテスト・スクリプト・フィクスチャ：

- [ ] `e2e/perf-300ms.spec.ts` — Ctrl+N → T2_READY 計測（PERF-01）
- [ ] `e2e/perf-burst.spec.ts` — 連打 1.5s / 3 回（PERF-02）
- [ ] `e2e/perf-load.spec.ts` — 17 付箋仕込み + Ctrl+N（PERF-03）
- [ ] `e2e/fixtures/seed-17-notes.ts` — 17 付箋を事前配置するヘルパ
- [ ] `app/components/StickyNote.pool.test.tsx` — Pool 専用挙動の単体テスト（PERF-04）
- [ ] `scripts/perf-check.mjs` — JSON Lines パース・中央値計算（PERF-01 解析）
- [ ] `package.json` に `"perf:check": "node scripts/perf-check.mjs"` 追加
- [ ] `src-tauri/src/lib.rs` 末尾に `#[cfg(test)] mod pool_tests` を追加（Pool / lazy 作成 / α 制御の単体テスト）
- [ ] `src-tauri/src/perflog.rs` — JSON Lines 出力モジュール（実装と Wave 0 で並行作成）
- [ ] `docs/manual-verify-phase19.md` — 手動検証手順書（PERF-05 Spy++ 確認、PERF-07 グローバル Ctrl+N）

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| WS_EX_LAYERED 付与確認 | PERF-05 | Win32 EX style は Playwright で観測不可。Spy++ / Window Detective 等の外部ツール必須 | アプリ起動 → Spy++ で `pool-window-*` を選択 → Styles タブで `WS_EX_LAYERED` (0x80000) フラグが立っていることを確認 |
| グローバル Ctrl+N（他アプリフォーカス時） | PERF-07 | Playwright はブラウザ外操作不可。メモ帳など他アプリへフォーカスを移す動作を再現できない | メモ帳を起動 → メモ帳をクリックでフォーカス → Ctrl+N → 付箋が手前に出ることを確認（5 回中 5 回成功） |
| 体感品質「すぐ書ける」 | PERF-01 補完 | 300ms 中央値合格でも体感が違うケースを排除するため | アプリ起動後 1 分間（17 付箋表示中）、Ctrl+N を 10 回ランダム間隔で押して、毎回「即座に書ける」感覚があるかをユーザが確認 |
| 「少々お待ちください」トースト表示 | PERF-02 補完 | アクセシビリティ的にトーストの可読性は人間が確認 | 連打 4 回（pool 枯渇）→ 4 回目に Ctrl+N を押した付箋の近くにトースト表示 → 1〜2 秒で消える |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references（上記 10 項目）
- [ ] No watch-mode flags（`vitest run` / `playwright test` を使用、`vitest --watch` / `playwright --ui` 禁止）
- [ ] Feedback latency < 5s (task commit) / < 5min (wave merge)
- [ ] `nyquist_compliant: true` set in frontmatter（plans 確定後・Wave 0 完了後にセット）

**Approval:** pending（gsd-planner 実行で Task ID 紐付け後、再評価）
