import { expect, test } from '@playwright/test';

test('共有Webからの認証ではデスクトップでもGoogleログイン画面を表示する', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
    localStorage.setItem('viewer_return_to', '/shared');
    localStorage.setItem('viewer_access_token', 'expired-test-token');
    localStorage.setItem('viewer_push_done', 'true');
  });

  await page.goto('/viewer?shared=1');

  await expect(page.getByRole('button', { name: /Googleでログイン|Sign in with Google/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'ホーム画面に追加してください' })).toHaveCount(0);
});

test('通常のPCブラウザーでviewerを開いたときは従来のPWA案内を表示する', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  });

  await page.goto('/viewer');

  await expect(page.getByRole('heading', { name: 'ホーム画面に追加してください' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Googleでログイン|Sign in with Google/ })).toHaveCount(0);
});
