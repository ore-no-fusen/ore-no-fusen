import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const yaml = createRequire(import.meta.url)('js-yaml') as { load(source: string): unknown };

const workflow = fs.readFileSync(
  path.resolve(process.cwd(), '.github/workflows/do-release.yml'),
  'utf8',
);

describe('release verification gate', () => {
  it('retires both legacy direct-push release workflows', () => {
    for (const name of ['do-release.yml', 'do-non-app-release.yml']) {
      const source = fs.readFileSync(path.resolve('.github/workflows', name), 'utf8');
      expect(source).toContain('contents: read');
      expect(source).toContain('exit 1');
      expect(source).not.toContain('git push');
      expect(source).not.toContain('contents: write');
    }
  });

  it('stages the static frontend without moving original API source', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
    const buildScript = fs.readFileSync(path.resolve('scripts/build-tauri.mjs'), 'utf8');
    expect(packageJson.scripts['build:tauri']).toBe('node scripts/build-tauri.mjs');
    expect(buildScript).toContain('buildFrontend');
    const stage = fs.readFileSync(path.resolve('scripts/tauri-frontend-stage.mjs'), 'utf8');
    expect(stage).toContain('fs.cpSync(source');
    expect(stage).not.toContain('renameSync(routeFile');
  });

  it('keeps standalone MSIX validation and reusable prevalidation distinct', () => {
    const msix = fs.readFileSync(path.resolve('.github/workflows/msix-ci.yml'), 'utf8');
    expect(msix).toContain('workflow_dispatch:');
    expect(msix).toContain('default: false');
    const parsed = yaml.load(msix) as { jobs: Record<string, { steps: { run?: string; if?: string }[] }> };
    const checks = Object.values(parsed.jobs).flatMap(job => job.steps).filter(step =>
      step.run?.includes('npm test') || step.run?.includes('cargo test'));
    expect(checks).toHaveLength(2);
    for (const step of checks) {
      expect(step.if).toContain("steps.validation.outputs.reused != 'true'");
      expect(step.if).toContain('!inputs.prevalidated');
    }
    expect(msix).toContain('run: npm run build');
    expect(msix).toContain('npx tauri build --no-bundle --ci');
    expect(msix).not.toContain('git push');
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
