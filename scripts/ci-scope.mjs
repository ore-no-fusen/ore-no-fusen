import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Only content is eligible. Executable/configuration changes retain app validation.
export function isDocumentContent(file) {
  return /^(?:[^/]+\.md|LICENSE(?:\.(?:md|txt))?)$/.test(file) ||
    /^(?:docs|docs-v2|public-guide)\/.+\.(?:md|mdx|txt|png|jpe?g|gif|webp|svg|ico|pdf)$/i.test(file) ||
    /^\.planning\/.+\.(?:md|json)$/i.test(file) ||
    /^public-guide\/LICENSE(?:\.(?:md|txt))?$/.test(file);
}

export function classifyScope(paths) {
  const docsOnly = paths.length > 0 && paths.every(isDocumentContent);
  return {
    docsOnly,
    msix: docsOnly ? false : needsMsix(paths),
    designDocs: paths.some(file => file.startsWith('docs-v2/')),
    publicGuide: paths.some(file => file.startsWith('public-guide/')),
  };
}

// Only known non-app paths may omit the installer test. Unknown paths fail closed.
export function needsMsix(paths) {
  if (paths.length > 0 && paths.every(isDocumentContent)) return false;
  return paths.length === 0 || paths.some(path => !(
    /^(docs\/|docs-v2\/|\.planning\/|app\/landing\/|workers\/badges\/)/.test(path) ||
    /^(README[^/]*|LICENSE|AGENTS\.md|CLAUDE\.md)$/.test(path) ||
    /^scripts\/member-(stats|usage-analysis)(\.test)?\.mjs$/.test(path)
  ));
}

export function gatePasses(scope, results) {
  if (!scope || typeof scope !== 'object' || !['docsOnly', 'msix', 'designDocs', 'publicGuide'].every(name => typeof scope[name] === 'boolean')) return false;
  if (scope.docsOnly && scope.msix) return false;
  const expected = {
    scope: 'success',
    usage: scope.docsOnly ? 'skipped' : 'success',
    frontend: scope.docsOnly ? 'skipped' : 'success',
    rust: scope.docsOnly ? 'skipped' : 'success',
    msix: scope.msix ? 'success' : 'skipped',
    documentation: scope.docsOnly ? 'success' : 'skipped',
    designDocs: scope.designDocs ? 'success' : 'skipped',
  };
  return Object.entries(expected).every(([name, result]) => results[name] === result);
}

function changedPaths(base, head) {
  if (![base, head].every(value => /^[a-f0-9]{40}$/.test(value ?? ''))) throw new Error('Expected two full commit SHAs');
  // Include deleted paths and both sides of renames, including app -> docs moves.
  return execFileSync('git', ['diff', '--name-only', '--no-renames', '-z', `${base}...${head}`], { encoding: 'utf8' }).split('\0').filter(Boolean);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === 'gate') {
    const inputs = { docsOnly: process.env.DOCS_ONLY, msix: process.env.SCOPE, designDocs: process.env.DESIGN_DOCS, publicGuide: process.env.PUBLIC_GUIDE };
    const valid = Object.values(inputs).every(value => ['true', 'false'].includes(value));
    const scope = valid ? Object.fromEntries(Object.entries(inputs).map(([name, value]) => [name, value === 'true'])) : null;
    const results = Object.fromEntries(['scope', 'usage', 'frontend', 'rust', 'msix', 'documentation', 'designDocs'].map(name => [name, process.env[`${name === 'designDocs' ? 'DESIGN_DOCS' : name.toUpperCase()}_RESULT`]]));
    console.log(JSON.stringify({ scope, results }));
    process.exit(gatePasses(scope, results) ? 0 : 1);
  }
  const documents = process.argv[2] === 'documents';
  const [base, head] = process.argv.slice(documents ? 3 : 2);
  const paths = changedPaths(base, head);
  const scope = classifyScope(paths);
  if (documents) {
    if (!scope.docsOnly) throw new Error('Documentation-only validation requires content-only changes');
    execFileSync('git', ['diff', '--check', `${base}...${head}`], { stdio: 'inherit' });
    console.log(JSON.stringify({ base, head, paths, ...scope }));
    process.exit(0);
  }
  console.log(JSON.stringify({ base, head, paths, ...scope }));
  if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required');
  const outputs = { msix: scope.msix, docs_only: scope.docsOnly, design_docs: scope.designDocs, public_guide: scope.publicGuide };
  appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(outputs).map(([name, value]) => `${name}=${value}\n`).join(''));
}

