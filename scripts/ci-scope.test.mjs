import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyScope, gatePasses, needsMsix } from './ci-scope.mjs';

test('dashboard and documentation changes do not build installers', () => {
  assert.equal(needsMsix(['scripts/member-stats.mjs', 'scripts/member-usage-analysis.test.mjs', 'docs/CI_MERGE_POLICY.md']), false);
});
test('app, dependencies, configuration, CI and unknown paths require MSIX', () => {
  for (const path of ['app/shared/page.tsx', 'components/ui/button.tsx', 'worker/index.js', 'public/icon.png', 'package-lock.json', 'src-tauri/Cargo.lock', 'next.config.mjs', 'vitest.config.ts', '.github/workflows/test.yml', 'scripts/ci-msix-certificate.ps1', 'unknown']) {
    assert.equal(needsMsix([path]), true, path);
    assert.equal(needsMsix(['docs/a.md', path]), true, path);
  }
  assert.equal(needsMsix([]), true);
});
test('gate rejects failure, cancellation, missing and unexpectedly skipped tests', () => {
  const scope = classifyScope(['app/page.tsx']);
  const green = { scope: 'success', usage: 'success', frontend: 'success', rust: 'success', msix: 'success', documentation: 'skipped', designDocs: 'skipped' };
  assert.equal(gatePasses(scope, green), true);
  assert.equal(gatePasses(classifyScope(['app/landing/page.tsx']), { ...green, msix: 'skipped' }), true);
  for (const name of Object.keys(green)) for (const result of ['failure', 'cancelled', 'skipped', 'success', 'pending', undefined]) {
    if (result === green[name]) continue;
    assert.equal(gatePasses(scope, { ...green, [name]: result }), false, `${name}: ${result}`);
  }
  for (const invalid of [null, 'unknown', {}, { ...scope, docsOnly: 'false' }]) assert.equal(gatePasses(invalid, green), false);
  assert.equal(gatePasses({ ...scope, docsOnly: true }, green), false);
});

test('only document content can omit application checks', () => {
  for (const file of ['README.md', 'AGENTS.md', 'LICENSE', 'docs/010_RELEASE.md', 'docs-v2/002_PC.md', 'docs-v2/public/diagram.svg', 'public-guide/faq.md', 'public-guide/public/help.png', '.planning/ai-collab/ACTIVE.json']) {
    const scope = classifyScope([file]);
    assert.equal(scope.docsOnly, true, file);
    assert.equal(scope.msix, false, file);
    assert.equal(needsMsix([file]), false, file);
    assert.equal(classifyScope([file, 'app/page.tsx']).docsOnly, false);
  }
  for (const file of ['docs/check.mjs', 'docs-v2/.vitepress/config.mts', 'docs-v2/package-lock.json', 'public-guide/scripts/check-public.mjs', 'public-guide/.vitepress/config.mts', 'public-guide/package.json', 'docs/file.md.js', '.planning/run.ps1', 'unknown.md/file', 'app/guide.md', 'src-tauri/src/lib.rs']) {
    assert.equal(classifyScope([file]).docsOnly, false, file);
  }
  assert.equal(classifyScope([]).docsOnly, false);
  assert.equal(classifyScope([]).msix, true);
});

test('documentation gate requires the actual document builds and rejects arbitrary skips', () => {
  const scope = classifyScope(['docs-v2/002_PC.md', 'public-guide/faq.md']);
  assert.deepEqual(scope, { docsOnly: true, msix: false, designDocs: true, publicGuide: true });
  const green = { scope: 'success', usage: 'skipped', frontend: 'skipped', rust: 'skipped', msix: 'skipped', documentation: 'success', designDocs: 'success' };
  assert.equal(gatePasses(scope, green), true);
  for (const name of Object.keys(green)) for (const result of ['failure', 'cancelled', 'skipped', 'success', 'pending', undefined]) {
    if (result === green[name]) continue;
    assert.equal(gatePasses(scope, { ...green, [name]: result }), false, `${name}: ${result}`);
  }
  assert.equal(gatePasses(classifyScope(['docs/a.md']), { ...green, designDocs: 'skipped' }), true);
  const mixed = classifyScope(['docs-v2/a.md', 'app/page.tsx']);
  assert.equal(mixed.docsOnly, false);
  assert.equal(gatePasses(mixed, green), false);
});

test('actual Git diffs include deleted app paths when renamed into docs', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-doc-scope-'));
  const git = (...args) => execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=disabled-hooks', ...args], { cwd, encoding: 'utf8', timeout: 15000 });
  const script = fileURLToPath(new URL('./ci-scope.mjs', import.meta.url));
  try {
    git('init', '--quiet'); git('config', 'user.name', 'CI scope fixture'); git('config', 'user.email', 'fixture@example.invalid');
    fs.mkdirSync(path.join(cwd, 'app')); fs.writeFileSync(path.join(cwd, 'app/page.tsx'), 'fixture\n');
    git('add', '.'); git('commit', '-qm', 'base'); const base = git('rev-parse', 'HEAD').trim();
    fs.mkdirSync(path.join(cwd, 'docs')); fs.writeFileSync(path.join(cwd, 'docs/a.md'), '# Docs\n');
    git('add', '.'); git('commit', '-qm', 'docs'); const head = git('rev-parse', 'HEAD').trim();
    const output = path.join(cwd, 'outputs');
    execFileSync(process.execPath, [script, base, head], { cwd, env: { ...process.env, GITHUB_OUTPUT: output } });
    assert.match(fs.readFileSync(output, 'utf8'), /docs_only=true/);
    execFileSync(process.execPath, [script, 'documents', base, head], { cwd });
    git('mv', 'app/page.tsx', 'docs/moved.md'); git('commit', '-qm', 'move'); const moved = git('rev-parse', 'HEAD').trim();
    const classified = JSON.parse(execFileSync(process.execPath, [script, head, moved], { cwd, env: { ...process.env, GITHUB_OUTPUT: output }, encoding: 'utf8' }));
    assert.equal(classified.docsOnly, false); assert.equal(classified.msix, true);
    assert.throws(() => execFileSync(process.execPath, [script, 'documents', head, moved], { cwd, stdio: 'pipe' }));
    assert.throws(() => execFileSync(process.execPath, [script, 'bad-sha', head], { cwd, stdio: 'pipe' }));
  } finally {
    if (path.dirname(path.resolve(cwd)) !== path.resolve(os.tmpdir())) throw new Error('Fixture cleanup target escapes the temporary directory');
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

