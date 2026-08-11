import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = fs.readFileSync(
  path.resolve(process.cwd(), '.github/workflows/do-release.yml'),
  'utf8',
);

describe('release verification gate', () => {
  it('validates the version before main is changed and builds from the committed source', () => {
    const verifyJob = workflow.indexOf('verify-release:');
    const prepareJob = workflow.indexOf('prepare-store-release:');
    const buildJob = workflow.indexOf('build-store-package:');
    const verifySection = workflow.slice(verifyJob, prepareJob);
    const prepareSection = workflow.slice(prepareJob, buildJob);
    const buildSection = workflow.slice(buildJob);

    expect(verifyJob).toBeGreaterThan(-1);
    expect(prepareJob).toBeGreaterThan(verifyJob);
    expect(buildJob).toBeGreaterThan(prepareJob);
    expect(verifySection).toContain('Normalize and validate version');
    expect(verifySection).toContain('Verify locked dependencies without changes');
    expect(verifySection).not.toContain('run: npm test');
    expect(verifySection).not.toContain('cargo test');
    expect(prepareSection).toContain('needs: [verify-release]');
    expect(prepareSection).toContain('Merge develop into main');
    expect(prepareSection).toContain('Commit and push main');
    expect(buildSection).toContain('needs: [verify-release, prepare-store-release]');
    expect(buildSection).toContain('run: npm ci');
    expect(buildSection).toContain('run: npm run tauri build -- --no-bundle --ci');
    expect(buildSection).toContain('packaging\\msix\\build-msix.ps1');
    expect(buildSection).toContain('packaging\\msix\\validate-msix.ps1');
    expect(workflow).not.toContain('verify-rust:');
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

  it('keeps the StartupTask extension in the development MSIX', () => {
    const script = fs.readFileSync(
      path.resolve(process.cwd(), 'packaging/msix/test-msix.ps1'),
      'utf8',
    );

    expect(script).not.toContain("<Extensions>.*?</Extensions>");
    expect(script).toContain('$Manifest.Replace(\'Id="OreNoFusen"\'');
    expect(script).toContain('$DevDisplayName = "Ore No Fusen Dev"');
    expect(script).toContain("'DisplayName=\"[^\"]*\"'");
  });
});
