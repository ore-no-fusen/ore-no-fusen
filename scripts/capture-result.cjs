#!/usr/bin/env node
// Capture first; inspect the PNG; use --image <path> --share for public sharing.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const args = process.argv.slice(2);
const value = key => { const i = args.indexOf(key); return i < 0 ? undefined : args[i + 1]; };
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8' }).trim();
const root = path.dirname(git(process.cwd(), 'rev-parse', '--path-format=absolute', '--git-common-dir'));
const evidence = path.join(root, 'my/保全/画面キャプチャ');
const css = 'body{font:17px/1.6 Meiryo,sans-serif;margin:24px;color:#222}h1{font-size:26px}h2{font-size:21px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #ccd2da;padding:10px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#eef2f6}th:first-child{width:7%}th:nth-child(2){width:9%}th:nth-child(3){width:32%}a{color:#284c91}strong{color:#a32323}';
async function main() {
  if (args.includes('--last')) { console.log(fs.readFileSync(path.join(evidence, 'latest.reply.md'), 'utf8')); return; }
  if (args.includes('--help')) {
    console.log('Capture: node scripts/capture-result.cjs --file docs-v2/TEST_TRACEABILITY_LIST.md [--selector CSS] [--height 1120]\nLive page: node scripts/capture-result.cjs --url http://localhost:3002 [--selector CSS]\nShare inspected PNG: node scripts/capture-result.cjs --image ABSOLUTE_PATH --share\nSharing uses the existing image-only worktree. No main/develop merge, build or CI.'); return;
  }
  fs.mkdirSync(evidence, { recursive: true });
  let png = value('--image');
  if (!png) {
    const file = value('--file'), url = value('--url');
    if (!!file === !!url) throw Error('Specify exactly one of --file or --url');
    const height = Number(value('--height') || 1120);
    if (!Number.isInteger(height) || height < 200 || height > 5000) throw Error('Invalid height');
    if (url && !/^https?:\/\//.test(url)) throw Error('Only http/https page URLs allowed');
    const source = file ? fs.readFileSync(path.resolve(file), 'utf8') : url;
    const hash = crypto.createHash('sha256').update(source + css + height + (value('--selector') || '')).digest('hex').slice(0, 16);
    png = path.join(evidence, `capture-${hash}.png`);
    const { chromium } = require('@playwright/test');
    const browser = await chromium.launch({ headless: true, channel: 'msedge' });
    try {
      const page = await browser.newPage({ viewport: { width: 1050, height } });
      if (file) {
        const { marked } = require('marked');
        await page.setContent('<meta charset="utf-8"><style>' + css + '</style>' + marked.parse(source));
      } else await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.evaluate(() => document.fonts.ready);
      if (value('--selector')) await page.locator(value('--selector')).screenshot({ path: png });
      else await page.screenshot({ path: png });
    } finally { await browser.close(); }
    fs.writeFileSync(png + '.json', JSON.stringify({ source: file ? path.resolve(file) : url, kind: file ? 'Markdown standalone preview' : 'Live page', capturedAt: new Date().toISOString(), sourceCommit: git(process.cwd(), 'rev-parse', 'HEAD') }, null, 2));
  }
  png = path.resolve(png);
  const bytes = fs.readFileSync(png);
  if (!bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) throw Error('Not a PNG');
  console.log('PNG: ' + png);
  if (!args.includes('--share')) return;
  const share = path.join(root, '.w/キャプチャ画像の共有');
  if (git(share, 'remote', 'get-url', 'origin') !== 'https://github.com/ore-no-fusen/ore-no-fusen.git') throw Error('Unexpected image repository');
  if (git(share, 'branch', '--show-current') !== 'codex/キャプチャ画像の共有') throw Error('Unexpected image branch');
  if (git(share, 'status', '--porcelain')) throw Error('Image worktree has uncommitted changes; preserve them first');
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  const relative = `docs/images/result-${hash}.png`;
  const target = path.join(share, relative);
  if (!fs.existsSync(target)) {
    fs.copyFileSync(png, target);
    git(share, 'add', '--', relative);
    git(share, 'commit', '--only', '-m', 'docs: 修正結果の画面キャプチャ', '--', relative);
  }
  git(share, 'push', 'origin', 'codex/キャプチャ画像の共有');
  const sha = git(share, 'rev-parse', 'HEAD');
  const url = `https://raw.githubusercontent.com/ore-no-fusen/ore-no-fusen/${sha}/${relative}`;
  const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(20000) });
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw Error('Image URL not confirmed: ' + url);
  const result = `[修正後のキャプチャを開く](${url})\n\n${url}\n\n![修正後の画面](${url})\n`;
  fs.writeFileSync(png + '.reply.md', result);
  fs.writeFileSync(path.join(evidence, 'latest.reply.md'), result);
  console.log(result);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
