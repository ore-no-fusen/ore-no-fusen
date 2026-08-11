import { expect, test } from '@playwright/test';
import { setupViewerWithNotes } from './fixtures/setup-viewer';

test('[PWA-URL-01] 編集画面のURLをクリックすると本文を変えずに外部リンクを開く', async ({ page }) => {
  const url = 'https://example.com/viewer';
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
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');

  await page.evaluate(() => {
    (window as unknown as { __openedUrl?: unknown[] }).__openedUrl = undefined;
    window.open = (...args) => {
      (window as unknown as { __openedUrl?: unknown[] }).__openedUrl = args;
      return null;
    };
  });
  await link.click();

  await expect.poll(() => page.evaluate(
    () => (window as unknown as { __openedUrl?: unknown[] }).__openedUrl,
  )).toEqual([url, '_blank', 'noopener,noreferrer']);
});
