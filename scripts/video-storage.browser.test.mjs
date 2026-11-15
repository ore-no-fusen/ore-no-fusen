import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { chromium } from '@playwright/test';

test('動画実体の保持と別画面削除の永続保護', async () => {
  const js = buildSync({ entryPoints: [fileURLToPath(new URL('../app/viewer/lib/indexeddb.ts', import.meta.url))], bundle: true, write: false, format: 'iife', globalName: 'drafts' }).outputFiles[0].text;
  const fixture = fs.readFileSync(fileURLToPath(new URL('../public/screenshots/fusen-intro-30s.mp4', import.meta.url)));
  const server = http.createServer((q, r) => {
    if (q.url === '/sample.mp4') { r.setHeader('Content-Type', 'video/mp4'); r.end(fixture); return; }
    r.end('<!doctype html><title>isolated storage test</title>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const address = `http://127.0.0.1:${server.address().port}`;
    await page.goto(address); await page.addScriptTag({ content: js });
    await page.evaluate(async () => {
      const check = (value, message) => { if (!value) throw Error(message); };
      const row = { id: 'video', title: 'title', body: 'body', created_at: 'now', images: [], videos: [{ fileName: 'a.mov', originalName: 'a.mov', blob: new Blob(['movie'], { type: 'video/quicktime' }) }] };
      await drafts.saveDraft(row);
      Object.defineProperty(navigator.storage, 'estimate', { configurable: true, value: async () => ({ quota: 1, usage: 1 }) });
      await drafts.saveDraft({ ...row, videos: [{ fileName: 'a.mov', originalName: 'a.mov' }] });
      check(await (await drafts.loadDraft('video')).videos[0].blob.text() === 'movie', 'metadata update lost video');
      await drafts.saveDraft({ id: 'video', title: 'edited', body: 'edited', created_at: 'now', images: [] });
      check((await drafts.loadDraft('video')).videos[0].blob.size === 5, 'body edit lost video');
      await drafts.saveDraft({ ...row, videos: [] });
      check((await drafts.loadDraft('video')).videos.length === 0, 'attachment delete failed');
      await drafts.saveDraft(row);
    });
    await page.reload(); await page.addScriptTag({ content: js });
    assert.equal(await page.evaluate(async () => (await drafts.loadDraft('video')).videos[0].blob.text()), 'movie');
    assert.equal(await page.evaluate(async () => {
      const blob = await (await fetch('/sample.mp4')).blob();
      await drafts.saveDraft({ id: 'playback', title: 'playback', body: '', created_at: 'now', images: [], videos: [{ fileName: 'sample.mp4', originalName: 'sample.mp4', blob }] });
      const loaded = await drafts.loadDraft('playback');
      const video = document.createElement('video'); video.muted = true; video.playsInline = true; video.controls = true;
      const url = URL.createObjectURL(loaded.videos[0].blob); video.src = url; document.body.append(video);
      try { await video.play(); await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('playback timeout')), 10000); video.ontimeupdate = () => { if (video.currentTime > 0.2) { clearTimeout(timer); resolve(); } }; }); return video.duration > 0; }
      finally { video.pause(); video.remove(); URL.revokeObjectURL(url); await drafts.deleteDraft('playback'); }
    }), true);
    const other = await page.context().newPage(); await other.goto(address); await other.addScriptTag({ content: js });
    await page.evaluate(async () => {
      window.delayBlob = new Blob(['late']);
      delayBlob.arrayBuffer = () => new Promise(resolve => { window.releaseVideo = resolve; });
      window.lateSave = drafts.saveDraft({ id: 'video', title: 'late', body: 'late', created_at: 'now', images: [], videos: [{ fileName: 'late.mov', originalName: 'late.mov', blob: delayBlob }] }).then(() => 'saved', () => 'rejected');
    });
    await page.waitForFunction(() => typeof window.releaseVideo === 'function');
    await other.evaluate(() => drafts.deleteDraft('video'));
    assert.equal(await page.evaluate(async () => { releaseVideo(new TextEncoder().encode('late').buffer); return lateSave; }), 'rejected');
    await page.reload(); await page.addScriptTag({ content: js });
    assert.equal(await page.evaluate(() => drafts.loadDraft('video')), null);
    assert.equal(await page.evaluate(async () => (await drafts.loadAllDrafts()).length), 0);
    assert.equal(await page.evaluate(async () => {
      const db = await drafts.openDraftsDB();
      return new Promise(resolve => { const req = db.transaction('drafts').objectStore('drafts').get('video'); req.onsuccess = () => resolve(JSON.stringify(req.result)); });
    }), '{"id":"video","deleted":true}');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
