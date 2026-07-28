/**
 * PC→iPhone 先頭画像の回帰 E2E
 *
 * Google Drive API をブラウザ内で模擬し、PC が作る notes_to_iphone.json と
 * fusen_img_* を PWA が取得して IndexedDB に保存し、一覧・本文で画像表示するまでを確認する。
 */

import { expect, test } from '@playwright/test';

const NOTE_ID = 'pc-leading-image-e2e';
const IMAGE_FILE_NAME = 'fusen_img_20260727_e2e.png';
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X8XnWQAAAABJRU5ErkJggg==',
  'base64'
);

test('[IPHONE-IMG-01] PC送信の先頭画像が一覧と本文で画像表示される', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: query === '(display-mode: standalone)',
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
    localStorage.setItem('viewer_access_token', 'e2e-token');
    localStorage.setItem('viewer_push_done', 'true');
  });

  await page.route('**/sw.js', (route) =>
    route.fulfill({ body: '', contentType: 'application/javascript' })
  );
  await page.route('https://www.googleapis.com/drive/v3/files**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'DELETE') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    const mediaFileId = url.pathname.match(/\/files\/([^/]+)$/)?.[1];
    if (url.searchParams.get('alt') === 'media' && mediaFileId === 'queue-file-id') {
      await route.fulfill({
        json: {
          items: [{
            id: NOTE_ID,
            title: '',
            body: `![先頭画像](${IMAGE_FILE_NAME})`,
            tags: [],
            sent_at: '2026-07-27T00:00:00Z',
          }],
        },
      });
      return;
    }
    if (url.searchParams.get('alt') === 'media' && mediaFileId === 'image-file-id') {
      await route.fulfill({
        body: ONE_PIXEL_PNG,
        contentType: 'image/png',
      });
      return;
    }

    const query = url.searchParams.get('q') ?? '';
    if (query.includes("name='ore-no-fusen'")) {
      await route.fulfill({ json: { files: [{ id: 'app-folder-id' }] } });
      return;
    }
    if (query.includes("name='notes_to_iphone.json'")) {
      await route.fulfill({ json: { files: [{ id: 'queue-file-id' }] } });
      return;
    }
    if (query.includes(`name='${IMAGE_FILE_NAME}'`)) {
      await route.fulfill({ json: { files: [{ id: 'image-file-id' }] } });
      return;
    }

    await route.fulfill({ json: { files: [] } });
  });
  await page.route('**/api/**', (route) => route.fulfill({ json: {} }));

  await page.goto('/viewer');
  await page.getByRole('button', { name: '一覧', exact: true }).click();

  const receivedCard = page.locator('li').filter({ has: page.locator('img') });
  await expect(receivedCard).toBeVisible();
  await expect(receivedCard.locator('img')).toBeVisible();

  await receivedCard.click();

  const editorImage = page.locator('[contenteditable="true"] img');
  await expect(editorImage).toBeVisible();
  await expect(editorImage).toHaveAttribute('src', /^blob:/);

  const stored = await page.evaluate(async (noteId) => {
    const request = indexedDB.open('fusen-drafts', 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('drafts', 'readonly');
    const getRequest = tx.objectStore('drafts').get(noteId);
    return new Promise<{ title?: string; body?: string; images?: Array<{ fileName?: string }> } | undefined>(
      (resolve, reject) => {
        getRequest.onsuccess = () => resolve(getRequest.result);
        getRequest.onerror = () => reject(getRequest.error);
      }
    );
  }, NOTE_ID);

  expect(stored?.title).toBe('');
  expect(stored?.body).toBe(`![先頭画像](${IMAGE_FILE_NAME})`);
  expect(stored?.body).not.toContain('俺の付箋');
  expect(stored?.body).not.toContain('FUSEN');
  expect(stored?.images?.[0]?.fileName).toBe(IMAGE_FILE_NAME);
});
