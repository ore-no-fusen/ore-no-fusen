import { expect, test } from '@playwright/test';
import { setupViewerWithNotes } from './fixtures/setup-viewer';

test('[PWA-URL-01] 編集画面のURLをクリックすると同じ画面でURLへ移動する', async ({ page, baseURL }) => {
  const url = new URL('/viewer?link-test=1', baseURL).href;
  await setupViewerWithNotes(page, [{
    id: 'url-link-note',
    title: 'URLリンク確認',
    body: `検証版URL\n${url}`,
    created_at: '2026-08-11T13:00:00+09:00',
    images: [],
    tags: [],
    status: 'received_pc',
  }]);

  await page.getByRole('button', { name: '一覧', exact: true }).click();
  await page.getByRole('listitem').filter({ hasText: 'URLリンク確認' }).click();

  const link = page.locator(`a[data-pwa-link][href="${url}"]`);
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('target', '_self');

  await Promise.all([
    page.waitForURL(url),
    link.click(),
  ]);
  await expect(page).toHaveURL(url);
  await expect.poll(() => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('fusen-logs', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise<Array<{ msg?: string }>>((resolve, reject) => {
      const request = db.transaction('logs').objectStore('logs').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return records.map(({ msg }) => msg ?? '').filter((msg) => msg.includes('url_'));
  })).toEqual(expect.arrayContaining([
    expect.stringContaining('[NAV] event=url_tapped'),
    expect.stringContaining('[NAV] event=url_assign_started'),
  ]));
});
