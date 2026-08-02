import { expect, test } from '@playwright/test';

test('[PWA-LANG-01] PWAの言語は日本語から手動で英語へ切り替え、再起動後も保持する', async ({ page }) => {
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
  await page.route('**/api/**', (route) => route.fulfill({ json: {} }));

  await page.goto('/viewer');
  await page.getByRole('button', { name: '一覧', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Englishに切り替える', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Englishに切り替える', exact: true }).click();
  await expect(page.getByText('Notes', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Switch to Japanese', exact: true })).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  await expect(page.getByText('Notes', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Switch to Japanese', exact: true }).click();
  await expect(page.getByText('一覧', { exact: true })).toBeVisible();
});
