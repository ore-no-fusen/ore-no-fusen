import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Only known non-app paths may omit the installer test. Unknown paths fail closed.
export function needsMsix(paths) {
  return paths.length === 0 || paths.some(path => !(
    /^(docs\/|docs-v2\/|\.planning\/|app\/landing\/|workers\/badges\/)/.test(path) ||
    /^(README[^/]*|LICENSE|AGENTS\.md|CLAUDE\.md)$/.test(path) ||
    /^scripts\/member-(stats|usage-analysis)(\.test)?\.mjs$/.test(path)
  ));
}

export function gatePasses(scope, results) {
  return ['scope', 'usage', 'frontend', 'rust'].every(name => results[name] === 'success') &&
    (scope === 'true' ? results.msix === 'success' : scope === 'false' && results.msix === 'skipped');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === 'gate') {
    const results = Object.fromEntries(['scope', 'usage', 'frontend', 'rust', 'msix'].map(name => [name, process.env[`${name.toUpperCase()}_RESULT`]]));
    console.log(JSON.stringify({ scope: process.env.SCOPE, results }));
    process.exit(gatePasses(process.env.SCOPE, results) ? 0 : 1);
  }
  const [base, head] = process.argv.slice(2);
  if (![base, head].every(value => /^[a-f0-9]{40}$/.test(value ?? ''))) throw new Error('Expected two full commit SHAs');
  // Include both sides of renames, including moves out of app paths.
  const paths = execFileSync('git', ['diff', '--name-only', '--no-renames', '-z', `${base}...${head}`], { encoding: 'utf8' }).split('\0').filter(Boolean);
  const msix = needsMsix(paths);
  console.log(JSON.stringify({ base, head, paths, msix }));
  if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required');
  appendFileSync(process.env.GITHUB_OUTPUT, `msix=${msix}\n`);
}

