import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { classifyChangedFiles } from './precommit-classify.mjs';

export function runPrecommit(files, run, log = console.log) {
  run('git', ['diff', '--cached', '--check']);
  if (classifyChangedFiles(files) === 'skip') {
    log('[pre-commit] Documentation content only: application checks are not applicable.');
    return;
  }
  if (files.some(file => /^(src-tauri\/|app\/components\/|app\/hooks\/|app\/utils\/|app\/page\.|app\/layout)/.test(file))) {
    log('[pre-commit] Running PC application E2E; guide-only checks run in CI.');
    run('npm', ['run', 'test:e2e', '--', '--grep-invert', '@ci-guide']);
  } else {
    log('[pre-commit] Full E2E is not applicable to these paths.');
  }
  log('[pre-commit] Local checks passed. Full unit/type validation is still required in CI.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const files = execFileSync('git', ['diff', '--cached', '--name-only', '--no-renames', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
    runPrecommit(files, (command, args) => {
      if (process.platform === 'win32' && command === 'npm') {
        // Fixed command, no interpolated paths or user input.
        execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm run test:e2e -- --grep-invert @ci-guide'], { stdio: 'inherit' });
      } else execFileSync(command, args, { stdio: 'inherit' });
    });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
