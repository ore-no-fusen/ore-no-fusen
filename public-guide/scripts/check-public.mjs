import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = '/ore-no-fusen-guide/';
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = join(directory, entry.name);
    if (lstatSync(file).isSymbolicLink()) throw new Error(`Links are not publishable: ${file}`);
    return entry.isDirectory() ? files(file) : [file];
  });
}
const allowed = new Set(JSON.parse(readFileSync(join(root, 'publish-files.json'), 'utf8')));
// The same explicit list is used for export and CI; no directory-wide copy.
function sourceFiles(directory = root) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = join(directory, entry.name), name = relative(root, file).replaceAll('\\', '/');
    if (['node_modules', '.git', '.vitepress/dist', '.vitepress/cache'].includes(name)) return [];
    if (lstatSync(file).isSymbolicLink()) throw new Error(`Links are not publishable: ${name}`);
    return entry.isDirectory() ? sourceFiles(file) : [name];
  });
}
for (const file of sourceFiles()) if (!allowed.has(file)) throw new Error(`Not in publish list: ${file}`);
for (const file of allowed) {
  if (file.includes('..') || file.startsWith('/') || !existsSync(join(root, file))) throw new Error(`Invalid publish file: ${file}`);
}
const dist = join(root, '.vitepress/dist');
const all = files(dist);
const errors = [];
const forbidden = /(?:00\d_[A-Z_]+|DESIGN DOCS PORTAL|設計書ポータル|https:\/\/github\.com\/ore-no-fusen\/ore-no-fusen(?:[\/"'<>\s]|$)|https:\/\/ore-no-fusen\.github\.io\/ore-no-fusen\/)/;
const pages = all.filter(file => file.endsWith('.html'));
let references = 0;
for (const file of all) {
  const name = relative(dist, file).replaceAll('\\', '/');
  if (/\.(?:map|rs|tsx|pem|key)$/.test(name) || /(?:serviceAccount|\.env|Cargo|AppState)/.test(name)) errors.push(`Private artifact: ${name}`);
  if (!/\.(?:html|js|json)$/.test(file)) continue;
  if (forbidden.test(readFileSync(file, 'utf8'))) errors.push(`Development resource in output: ${name}`);
}
for (const page of pages) {
  const pageUrl = new URL(base + relative(dist, page).replaceAll('\\', '/'), 'https://guide.test');
  for (const match of readFileSync(page, 'utf8').matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    const raw = match[1].replaceAll('&amp;', '&');
    const url = new URL(raw, pageUrl);
    if (url.origin !== pageUrl.origin) continue;
    references++;
    if (!url.pathname.startsWith(base)) { errors.push(`Missing base: ${raw}`); continue; }
    let target = join(dist, decodeURIComponent(url.pathname.slice(base.length)));
    if (existsSync(target) && lstatSync(target).isDirectory()) target = join(target, 'index.html');
    if (!existsSync(target)) { errors.push(`Missing target: ${raw}`); continue; }
    if (url.hash && target.endsWith('.html')) {
      const ids = [...readFileSync(target, 'utf8').matchAll(/\sid="([^"]+)"/g)].map(item => item[1].normalize('NFC'));
      if (!ids.includes(decodeURIComponent(url.hash.slice(1)).normalize('NFC'))) errors.push(`Missing fragment: ${raw}`);
    }
  }
}
console.log(JSON.stringify({ pages: pages.length, references, publishedSourceFiles: allowed.size, errors }, null, 2));
if (errors.length) process.exitCode = 1;
