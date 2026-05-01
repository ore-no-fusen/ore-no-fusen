/**
 * seed-17-notes.ts
 *
 * 17 個のマークダウンノートファイルをテストフォルダに書き出すヘルパ。
 * PERF-03「17付箋負荷テスト」で使用する。
 *
 * 使い方:
 *   import { seedNotes, cleanupNotes } from './fixtures/seed-17-notes';
 *   const created = seedNotes('/path/to/test-folder', 17);
 *   // ... テスト実行 ...
 *   cleanupNotes(created);
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * 指定フォルダに count 個の .md ファイルを書き出す。
 * ファイル名: 2026-04-30_001.md 〜 2026-04-30_NNN.md
 * フロントマター付き最小コンテンツ（読み込みコスト再現用）。
 *
 * @param folderPath - ノートを配置するフォルダのパス
 * @param count      - 作成するノートの数（デフォルト 17）
 * @returns          - 作成したファイルパスの配列
 */
export function seedNotes(folderPath: string, count: number = 17): string[] {
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }

  const created: string[] = [];
  const dateStr = '2026-04-30';

  for (let i = 1; i <= count; i++) {
    const seq = String(i).padStart(3, '0');
    const filename = `${dateStr}_${seq}.md`;
    const filePath = path.join(folderPath, filename);

    const content = [
      '---',
      `seq: ${i}`,
      `context: load-test-${seq}`,
      `created: ${dateStr}`,
      `updated: ${dateStr}`,
      'tags: []',
      '---',
      '',
      `負荷テスト用付箋 #${seq}`,
      '',
      'このファイルは Phase 19 PERF-03 の負荷テスト用に自動生成されました。',
    ].join('\n');

    fs.writeFileSync(filePath, content, 'utf-8');
    created.push(filePath);
  }

  return created;
}

/**
 * seedNotes で作成したファイルを削除する。
 * テスト後のクリーンアップに使用。
 *
 * @param filePaths - 削除するファイルパスの配列（seedNotes の戻り値）
 */
export function cleanupNotes(filePaths: string[]): void {
  for (const filePath of filePaths) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}
