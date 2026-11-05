import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

function fixture(t, list = ['manual.md']) {
  const root = mkdtempSync(join(tmpdir(), 'public-guide-boundary-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'scripts')); mkdirSync(join(root, 'public-guide'));
  const script = join(root, 'scripts/export-public-guide.mjs');
  copyFileSync(join(dirname(fileURLToPath(import.meta.url)), 'export-public-guide.mjs'), script);
  writeFileSync(join(root, 'public-guide/publish-files.json'), JSON.stringify(list));
  writeFileSync(join(root, 'public-guide/manual.md'), 'Public manual');
  writeFileSync(join(root, 'public-guide/.env'), 'private fixture');
  return { root, run: destination => spawnSync(process.execPath, [script, destination], { encoding: 'utf8' }) };
}

test('export includes approved manuals only, excluding unlisted private data and history', t => {
  const f = fixture(t), output = join(f.root, 'output');
  assert.equal(f.run(output).status, 0);
  assert.equal(readFileSync(join(output, 'manual.md'), 'utf8'), 'Public manual');
  assert.equal(existsSync(join(output, '.env')), false);
  assert.equal(existsSync(join(output, '.git')), false);
});

test('export rejects traversal before creating output and does not overwrite local work', t => {
  const f = fixture(t, ['manual.md', '../private.txt']), output = join(f.root, 'output');
  writeFileSync(join(f.root, 'private.txt'), 'Must stay private');
  assert.notEqual(f.run(output).status, 0);
  assert.equal(existsSync(output), false);
  mkdirSync(output); writeFileSync(join(output, 'local.txt'), 'Keep local work');
  assert.notEqual(f.run(output).status, 0);
  assert.equal(readFileSync(join(output, 'local.txt'), 'utf8'), 'Keep local work');
});
