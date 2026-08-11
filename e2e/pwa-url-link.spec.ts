import { expect, test } from '@playwright/test';
import { setupViewerWithNotes } from './fixtures/setup-viewer';

test('[PWA-URL-01] 編集画面のURLをタッチすると同じ画面でURLへ移動する', async ({ page, baseURL }) => {
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
  await expect(link).toHaveAttribute('contenteditable', 'false');

  await Promise.all([
    page.waitForURL(url),
    link.dispatchEvent('touchend'),
  ]);
  await expect(page).toHaveURL(url);
});
