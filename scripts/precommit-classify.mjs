import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCUMENTATION_PATH = /^(?:\.planning\/|docs\/|docs-v2\/|[^/]+\.md$)/;

export const classifyChangedFiles = (files) =>
  files.length > 0 && files.every((file) => DOCUMENTATION_PATH.test(file)) ? 'skip' : 'run';

const isMain = process.argv[1]
  && path.resolve(fileURLToPath(import.meta.url)).toLowerCase() === path.resolve(process.argv[1]).toLowerCase();

if (isMain) {
  const files = execFileSync('git', ['diff', '--cached', '--name-only', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
  process.stdout.write(classifyChangedFiles(files));
}
