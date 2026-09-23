import { test, expect } from '@playwright/test';

test('お便りを表示し、本文のHTMLと危険なリンクを無効にする', async ({ page }) => {
  const params = new URLSearchParams({
    title: '開発者からのお便り',
    body: '**大切**\n[案内](https://example.com/help) [危険](javascript:alert(1)) <img src=x onerror=alert(1)>',
    createdAt: '2026-09-24T00:00:00Z',
  });
  await page.goto(`/announcement?${params}`);
  await expect(page.getByRole('heading', { name: '開発者からのお便り' })).toBeVisible();
  await expect(page.locator('strong')).toHaveText('大切');
  await expect(page.getByRole('link', { name: '案内' })).toHaveAttribute('href', 'https://example.com/help');
  await expect(page.getByRole('link', { name: '危険' })).toHaveCount(0);
  await expect(page.locator('img')).toHaveCount(0);
  await expect(page.getByText('<img src=x onerror=alert(1)>', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: /返信する/ })).toBeVisible();
});
