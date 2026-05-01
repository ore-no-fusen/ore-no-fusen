/**
 * perf-300ms.spec.ts
 *
 * PERF-01: Ctrl+N → T2_READY 300ms 計測 E2E（Wave 0 スケルトン）
 *
 * 責務:
 * - Ctrl+N が押された時の JS レベルの経路を検証する
 * - fusen:request_create イベントが emit されることを確認する
 * - Win32 レベルの 300ms 計測は実機 + perf:check で行う（docs/manual-verify-phase19.md 参照）
 *
 * 実装方針:
 * - Wave 2/3 で Pool 窓ロジックが実装されたあとに test.fixme を外して有効化する
 * - Tauri webview の Win32 計測は E2E では行わず、手動検証に委ねる（CONTEXT.md 妥協ルート禁止）
 *
 * 参照: docs/manual-verify-phase19.md — 300ms 実機計測手順
 */

import { test, expect } from '@playwright/test';

/**
 * PERF-01: Ctrl+N → fusen:request_create が emit されることを検証（JS 経路）
 *
 * Wave 2/3 で Pool 窓ロジック実装後に test.fixme を外す。
 * 実際の 300ms 計測は Tauri ビルド実機 + npm run perf:check で行う。
 */
test.fixme('ctrl-n-300ms: Ctrl+N を押すと fusen:request_create が emit される', async ({ page }) => {
  // Wave 2/3 で実装
  //
  // 手順:
  // 1. ページを開く（/?path=... で付箋ウィンドウとして表示）
  // 2. Tauri のイベントリスナーをモックして fusen:request_create を捕捉
  // 3. Ctrl+N を送信
  // 4. fusen:request_create が emit されることを確認
  //
  // 注意:
  // - createThrottleRef（1.2 秒スロットル）があるため、前回操作から 1.2 秒以上空ける
  // - perf T0 (Date.now()) は emit 時に payload に含まれる
  //
  // 期待:
  // - emit が 1 回だけ呼ばれる
  // - payload に folderPath, context, t0 が含まれる

  expect(true).toBe(true); // placeholder
});

/**
 * PERF-01 補足: 5 サンプルの中央値検証
 *
 * Playwright から Tauri 実機の Win32 タイミングにアクセスする手段がないため、
 * この spec では JS 経路の正確さのみを検証する。
 * 5 サンプルの中央値 ≤ 300ms の検証は npm run perf:check で行う。
 */
test.fixme('ctrl-n-300ms: 5 サンプルの中央値が 300ms 以内（perf:check で検証）', async () => {
  // Wave 3 実装後に確認手順を記載
  // 実際のテストは: npm run perf:check
  expect(true).toBe(true); // placeholder
});
