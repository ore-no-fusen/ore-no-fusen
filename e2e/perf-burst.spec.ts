/**
 * perf-burst.spec.ts
 *
 * PERF-02: 連打耐性 E2E（Wave 0 スケルトン）
 *
 * 責務:
 * - 1500ms 内に Ctrl+N を 3 回連打した時の挙動を検証する
 * - 3 つのウィンドウ生成イベントが発火すること（スロットル解除後）
 * - 4 回目（1.2 秒以内）はブロックされることを確認する
 *
 * 実装方針:
 * - Tauri 実機ビルドが必要なため test.fixme でスタブ化
 * - Wave 2/3 で Pool 窓ロジック実装後に有効化
 * - 実機での連打確認は docs/manual-verify-phase19.md の「連打耐性実機確認」セクションを参照
 */

import { test, expect } from '@playwright/test';

/**
 * PERF-02: 1.5 秒内に Ctrl+N を 3 回 → 3 ウィンドウ生成イベントが発火する
 *
 * スロットル仕様:
 * - StickyNote.tsx: lastCtrlNRef で 1.2 秒スロットル（1.2 秒以内の 2 回目はブロック）
 * - page.tsx: globalLastCreateTime で 300ms グローバルスロットル
 *
 * 連打が 3 個通るには:
 * - 1 回目: T=0ms
 * - 2 回目: T≥1200ms（スロットル解除後）
 * - 3 回目: T≥2400ms
 *
 * Wave 2/3 でプール窓が実装されれば、各 Ctrl+N は 300ms 以内に応答するため
 * 1.5 秒連打は実際には「1 回 + 待機 + 1 回 + 待機 + 1 回」になる。
 */
test.fixme('ctrl-n-burst: 1.5s 内に Ctrl+N を 3 回 → 3 ウィンドウ生成イベント', async ({ page }) => {
  // Wave 2/3 で実装
  //
  // 手順:
  // 1. アプリを起動（Pool 窓を事前初期化済み状態で待機）
  // 2. Ctrl+N を 3 回送信（間隔: 0ms, 1200ms, 2400ms）
  // 3. fusen:request_create が 3 回 emit されることを確認
  //
  // 期待:
  // - 3 回の fusen:request_create emit
  // - 各応答が 300ms 以内（perf.jsonl で確認）
  // - 4 回目（1.2 秒以内）は emit されない

  expect(true).toBe(true); // placeholder
});

/**
 * PERF-02 補足: 4 回目の Ctrl+N はブロックされる
 */
test.fixme('ctrl-n-burst: 1.2 秒以内の 2 回目 Ctrl+N はブロックされる', async ({ page }) => {
  // Wave 2 で実装（StickyNote.tsx の lastCtrlNRef スロットルの確認）
  // 既存テスト: app/components/StickyNote.test.tsx の「Ctrl+N 連打」テスト参照

  expect(true).toBe(true); // placeholder
});
