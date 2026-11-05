import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '../public-guide'));
const output = process.argv[2];
if (!output) throw new Error('Usage: node scripts/export-public-guide.mjs <empty-output-directory>');
const destination = resolve(output);
if (existsSync(destination) && (lstatSync(destination).isSymbolicLink() || readdirSync(destination).length)) throw new Error('Export destination must be empty and must not be a link');
const allowed = JSON.parse(readFileSync(join(source, 'publish-files.json'), 'utf8'));
// Validate every path before copying any file. Internal docs and history cannot be exported.
const entries = allowed.map(name => {
  if (typeof name !== 'string' || isAbsolute(name) || name.split(/[\\/]/).some(part => part === '..' || part === '.git')) throw new Error('Invalid export path');
  let current = source;
  for (const part of name.split(/[\\/]/)) {
    current = join(current, part);
    if (lstatSync(current).isSymbolicLink()) throw new Error(`Do not export links: ${name}`);
  }
  const file = realpathSync(current);
  if (relative(source, file).startsWith('..') || lstatSync(file).isDirectory()) throw new Error(`Invalid source: ${name}`);
  return { file, name };
});
mkdirSync(destination, { recursive: true });
const resolvedDestination = realpathSync(destination);
if (resolvedDestination === source || !relative(source, resolvedDestination).startsWith('..')) throw new Error('Do not export into the source tree');
for (const { file, name } of entries) {
  const target = join(destination, name);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(file, target);
}
console.log(`Exported ${entries.length} reviewed public-guide files; no Git history or app source copied.`);
