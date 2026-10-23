import { test, expect } from '@playwright/test';
import * as os from 'node:os';
import * as path from 'node:path';
import { seedNotes, cleanupNotes } from './fixtures/seed-17-notes';

// データ生成ヘルパの検証。実際の17窓負荷試験ではない。
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
