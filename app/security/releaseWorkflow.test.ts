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
    const verifyRustJob = workflow.indexOf('verify-rust:');
    const prepareJob = workflow.indexOf('prepare-store-release:');
    const verifySection = workflow.slice(verifyJob, verifyRustJob);
    const verifyRustSection = workflow.slice(verifyRustJob, prepareJob);

    expect(verifyJob).toBeGreaterThan(-1);
    expect(verifyRustJob).toBeGreaterThan(verifyJob);
    expect(prepareJob).toBeGreaterThan(verifyRustJob);
    expect(verifySection).toContain('run: npm ci');
    expect(verifySection).toContain('run: npx tsc --noEmit --pretty false');
    expect(verifySection).toContain('run: npm test');
    expect(verifySection).toContain('run: npm run build:tauri');
    expect(verifySection).not.toContain('playwright install chromium');
    expect(verifyRustSection).toContain('run: cargo test --locked --release --lib');
    expect(verifyRustSection).toContain('${{ github.run_id }}');
    expect(verifyRustSection).toContain('src-tauri/target/release/');
    expect(verifyRustSection).not.toContain('cargo check');
    expect(workflow).toContain('needs: [verify-release, verify-rust]');
  });

  it('uses the Tauri build wrapper that always restores server-only API routes', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
    const buildScript = fs.readFileSync(
      path.resolve(process.cwd(), 'scripts/build-tauri.mjs'),
      'utf8',
    );

    expect(packageJson.scripts['build:tauri']).toBe('node scripts/build-tauri.mjs');
    expect(buildScript).toContain("entry.name === 'route.ts'");
    expect(buildScript).toContain('renameSync(routeFile, parkedFile)');
    expect(buildScript).toContain('finally');
    expect(buildScript).toContain('renameSync(parkedFile, routeFile)');
  });

  it('supports an isolated MSIX dry run without committing a release version', () => {
    expect(workflow).toContain('dry_run:');
    expect(workflow).toContain('if: ${{ !inputs.dry_run }}');
    expect(workflow).toContain("ref: ${{ inputs.dry_run && 'develop' || needs.prepare-store-release.outputs.main_ref }}");
    expect(workflow).toContain('Apply version only inside the dry-run workspace');
    expect(workflow).toContain("name: ${{ inputs.dry_run && 'store-msix-dry-run' || 'store-msix' }}");
    expect(workflow).toContain('Dry run completed. No branch, tag, release, or Store submission was changed.');
  });
});
