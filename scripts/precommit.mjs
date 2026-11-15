import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { classifyChangedFiles } from './precommit-classify.mjs';

export function runPrecommit(files, run, log = console.log) {
  run('git', ['diff', '--cached', '--check']);
  if (classifyChangedFiles(files) === 'skip') {
    log('[pre-commit] Documentation content only: application checks are not applicable.');
    return;
  }
  log('[pre-commit] Diff checks passed. Confirm the relevant tests separately; no automatic full-suite rerun.');
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
