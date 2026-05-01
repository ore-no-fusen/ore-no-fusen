/**
 * perf-load.spec.ts
 *
 * PERF-03: 17 付箋負荷状態での Ctrl+N E2E（Wave 0 スケルトン）
 *
 * 責務:
 * - 17 個の付箋が存在する状態で Ctrl+N を押した時の動作を検証する
 * - 負荷状態でも Pool 窓の応答が 300ms 以内であることを確認する
 *
 * 実装方針:
 * - Tauri 実機ビルドが必要なため test.fixme でスタブ化
 * - seed-17-notes フィクスチャを使ってテストデータを準備する
 * - Wave 3 で実装後に有効化
 *
 * 参照: e2e/fixtures/seed-17-notes.ts — 17 付箋データ生成ヘルパ
 */

import { test, expect } from '@playwright/test';
import * as os from 'node:os';
import * as path from 'node:path';
import { seedNotes, cleanupNotes } from './fixtures/seed-17-notes';

/**
 * PERF-03: 17 付箋が存在する状態で Ctrl+N を押すと正常に動作する
 *
 * 背景:
 * - 通常ユーザーは複数の付箋を管理しており、17 枚は実用的な負荷
 * - Pool 窓は事前初期化されているため、付箋数に関わらず 300ms 以内を目標とする
 * - fusen_list_notes が呼ばれるタイミングの遅延がないことを確認する
 */
test.fixme('ctrl-n-loaded: 17 付箋負荷状態でも Ctrl+N が正常に機能する', async ({ page }) => {
  // Wave 3 で実装
  //
  // 手順:
  // 1. 一時フォルダに 17 個のノートを seed する
  // 2. アプリを起動して該当フォルダを選択する
  // 3. 17 枚の付箋が表示されていることを確認する
  // 4. Ctrl+N を押す
  // 5. 新しい付箋が 300ms 以内に表示されることを確認する（perf.jsonl で計測）
  //
  // クリーンアップ:
  // - テスト後に一時フォルダを削除する

  const tmpDir = path.join(os.tmpdir(), `perf-load-test-${Date.now()}`);
  const created = seedNotes(tmpDir, 17);

  try {
    // Wave 3 で実装: page.goto(), フォルダ選択, Ctrl+N, perf 計測
    expect(created).toHaveLength(17);
    expect(true).toBe(true); // placeholder
  } finally {
    cleanupNotes(created);
  }
});

/**
 * PERF-03 補足: seed-17-notes ヘルパが正しく動作することを確認する
 *
 * このテストは test.fixme を外して即時実行可能（Tauri 不要）。
 * Wave 0 の動作確認として使用。
 */
test('seed-17-notes: ヘルパが 17 個のファイルを正しく作成する', async () => {
  const tmpDir = path.join(os.tmpdir(), `seed-test-${Date.now()}`);
  const created = seedNotes(tmpDir, 17);

  try {
    expect(created).toHaveLength(17);
    // ファイル名の形式を確認
    expect(created[0]).toMatch(/2026-04-30_001\.md$/);
    expect(created[16]).toMatch(/2026-04-30_017\.md$/);
  } finally {
    cleanupNotes(created);
  }
});
