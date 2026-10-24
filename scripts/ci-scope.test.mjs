import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gatePasses, needsMsix } from './ci-scope.mjs';

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
  const green = { scope: 'success', usage: 'success', frontend: 'success', rust: 'success', msix: 'success' };
  assert.equal(gatePasses('true', green), true);
  assert.equal(gatePasses('false', { ...green, msix: 'skipped' }), true);
  for (const name of Object.keys(green)) for (const result of ['failure', 'cancelled', 'skipped', 'pending', undefined]) {
    assert.equal(gatePasses('true', { ...green, [name]: result }), false, `${name}: ${result}`);
  }
  assert.equal(gatePasses('unknown', green), false);
  assert.equal(gatePasses('false', { ...green, msix: 'failure' }), false);
});

