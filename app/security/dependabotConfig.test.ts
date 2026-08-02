import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('dependency update monitoring', () => {
  const config = fs.readFileSync(
    path.resolve(process.cwd(), '.github/dependabot.yml'),
    'utf8',
  );

  it.each([
    ['npm', '/'],
    ['cargo', '/src-tauri'],
    ['github-actions', '/'],
  ])('monitors %s dependencies in %s', (ecosystem, directory) => {
    expect(config).toContain(`package-ecosystem: ${ecosystem}`);
    expect(config).toContain(`directory: ${directory}`);
  });

  it('uses bounded weekly update batches', () => {
    expect(config.match(/interval: weekly/g)).toHaveLength(3);
    expect(config.match(/open-pull-requests-limit: 5/g)).toHaveLength(3);
  });
});
