import { expect, test } from '@playwright/test';
import { setupViewerWithNotes } from './fixtures/setup-viewer';

test('[PWA-RECOVERY-01] PC受信本文はDriveが使えない再起動後も端末保存から開ける', async ({ page }) => {
  await setupViewerWithNotes(page, [{
    id: 'offline-recovery-note',
    title: 'オフラインでも残す',
    body: '端末保存した本文',
    created_at: new Date().toISOString(),
    images: [],
    tags: ['重要'],
    received_pc: true,
  }]);

  await page.unroute('**/api/**');
  await page.route('**/api/**', (route) => route.abort());
  await page.reload();
  await page.getByRole('button', { name: '一覧', exact: true }).click();
  const note = page.locator('li', { hasText: 'オフラインでも残す' });
  await expect(note).toBeVisible();
  await note.click();
  await expect(page.locator('[contenteditable="true"]')).toContainText('端末保存した本文');
});

test('[PWA-RECOVERY-02] ローカル画像は再起動後もIndexedDBから一覧と本文へ復元される', async ({ page }) => {
  await setupViewerWithNotes(page, []);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('fusen-drafts', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite');
      tx.objectStore('drafts').put({
        id: 'local-image-recovery',
        title: 'ローカル画像',
        body: '![保存画像](local-photo.png)',
        created_at: new Date().toISOString(),
        tags: [],
        images: [{
          fileName: 'local-photo.png',
          blob: new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }),
        }],
      }, 'local-image-recovery');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });

  await page.reload();
  await page.getByRole('button', { name: '一覧', exact: true }).click();
  const card = page.locator('li', { hasText: 'ローカル画像' });
  await expect(card.locator('img')).toBeVisible();
  await card.click();
  await expect(page.locator('[contenteditable="true"] img')).toHaveAttribute('src', /^blob:/);
});
