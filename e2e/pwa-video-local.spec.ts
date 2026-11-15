import { test, expect } from '@playwright/test';
import path from 'node:path';

test('iPhone付箋の動画コピーを再表示・再生し、付箋削除で消す', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'matchMedia', { value: (q: string) => ({ matches: q === '(display-mode: standalone)', media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } }) });
    localStorage.setItem('viewer_access_token', 'isolated-video-test');
    localStorage.setItem('viewer_push_done', 'true');
    localStorage.setItem('viewer_expires_at', String(Date.now() + 3600000));
  });
  await page.route('**/sw.js', route => route.fulfill({ body: '', contentType: 'application/javascript' }));
  await page.route('https://www.googleapis.com/**', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.goto('/viewer');
  await page.locator('[contenteditable="true"]').fill('動画コピーの確認');
  await page.locator('input[accept="video/mp4,video/quicktime,.mp4,.mov"]').setInputFiles(path.resolve('public/screenshots/fusen-intro-30s.mp4'));
  await expect(page.getByText('動画を端末に保存中…', { exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: '一覧', exact: true }).click();
  await expect(page.locator('li', { hasText: '動画コピーの確認' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '一覧', exact: true }).click();
  await page.locator('li', { hasText: '動画コピーの確認' }).click();
  const video = page.locator('video');
  await expect(video).toBeVisible();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0);
  await video.evaluate(async (v: HTMLVideoElement) => { v.muted = true; await v.play(); });
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0);
  await page.getByRole('button', { name: '一覧', exact: true }).click();
  await page.locator('li', { hasText: '動画コピーの確認' }).getByRole('button', { name: '消す', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: '一覧', exact: true }).click();
  await expect(page.locator('li', { hasText: '動画コピーの確認' })).toHaveCount(0);
  const result = await page.evaluate(async () => {
    const open = indexedDB.open('fusen-drafts', 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
    const get = db.transaction('drafts').objectStore('drafts').getAll();
    return new Promise<unknown[]>((resolve, reject) => { get.onsuccess = () => resolve(get.result); get.onerror = () => reject(get.error); });
  });
  expect(result).toEqual([expect.objectContaining({ deleted: true })]);
  expect(result[0]).not.toHaveProperty('videos');
});
