import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = fs.readFileSync(
  path.resolve(process.cwd(), '.github/workflows/do-release.yml'),
  'utf8',
);

describe('release verification gate', () => {
  it('runs all required checks before main is changed', () => {
    const verifyJob = workflow.indexOf('verify-release:');
    const prepareJob = workflow.indexOf('prepare-store-release:');
    const verifySection = workflow.slice(verifyJob, prepareJob);

    expect(verifyJob).toBeGreaterThan(-1);
    expect(prepareJob).toBeGreaterThan(verifyJob);
    expect(verifySection).toContain('run: npm ci');
    expect(verifySection).toContain('run: npx tsc --noEmit --pretty false');
    expect(verifySection).toContain('run: npm test');
    expect(verifySection).toContain('run: npm run build:tauri');
    expect(verifySection).toContain('run: cargo test --locked --lib');
  });
});
