import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../.vitepress/dist');
const base = '/ore-no-fusen/';
const origin = 'https://docs.test';
function filesIn(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? filesIn(path) : [path];
    });
}
const pages = filesIn(root).filter(path => path.endsWith('.html'));
const broken = [];
const seen = new Set();
let references = 0;
for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    const pageUrl = new URL(base + relative(root, page).replaceAll('\\', '/'), origin);
    for (const match of html.matchAll(/\s(href|src)="([^"]+)"/g)) {
        const value = match[2].replaceAll('&amp;', '&');
        if (/^(?:data:|mailto:|tel:|javascript:)/i.test(value)) continue;
        const url = new URL(value, pageUrl);
        if (url.origin !== origin) continue;
        references++;
        const key = url.href;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!url.pathname.startsWith(base)) {
            broken.push({ page: relative(root, page), url: value, issue: 'Missing site base' });
            continue;
        }
        let target = join(root, decodeURIComponent(url.pathname.slice(base.length)));
        if (existsSync(target) && statSync(target).isDirectory()) target = join(target, 'index.html');
        if (!existsSync(target) && existsSync(target + '.html')) target += '.html';
        if (!existsSync(target)) {
            broken.push({ page: relative(root, page), url: value, issue: 'Target file missing' });
            continue;
        }
        if (url.hash && target.endsWith('.html')) {
            const fragment = decodeURIComponent(url.hash.slice(1));
            const targetHtml = readFileSync(target, 'utf8');
            const ids = [...targetHtml.matchAll(/\sid="([^"]+)"/g)].map(item => item[1]);
            if (!ids.includes(fragment)) broken.push({ page: relative(root, page), url: value, issue: 'Fragment missing' });
        }
    }
}
console.log(JSON.stringify({ pages: pages.length, references, uniqueTargets: seen.size, broken }, null, 2));
if (broken.length) process.exitCode = 1;
