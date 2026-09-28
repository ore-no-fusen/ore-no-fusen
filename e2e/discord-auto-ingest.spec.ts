import { expect, test } from '@playwright/test';
import { mockTauriAPI } from './mock-tauri';

test('作者PCでsecretを保存した場合だけDiscord返信の自動取り込みを有効にできる', async ({ page }) => {
  await mockTauriAPI(page);
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__MOCK_HAS_LISTENER__('fusen:open_settings'));
  await page.evaluate(() => (window as any).__MOCK_EMIT__('fusen:open_settings', { tab: 'advanced' }));
  await page.locator('summary').filter({ hasText: '開発者専用' }).click();
  const automatic = page.getByRole('checkbox', { name: 'このPCのアプリが起動中はDiscord返信を約1分ごとに自動取り込みする' });
  await expect(automatic).toBeDisabled();
  await page.locator('#discord-ingest-secret').fill('author-secret');
  await page.getByRole('checkbox', { name: 'このPCにingest secretを保存する' }).check();
  await expect(automatic).toBeEnabled();
  await automatic.check();
  await expect.poll(() => page.evaluate(() => ({
    enabled: localStorage.getItem('ore-no-fusen.feedback.discord_auto_ingest'),
    secret: localStorage.getItem('ore-no-fusen.feedback.discord_ingest_secret'),
  }))).toEqual({ enabled: 'true', secret: 'author-secret' });
  await page.getByRole('checkbox', { name: 'このPCにingest secretを保存する' }).uncheck();
  await expect(automatic).toBeDisabled();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('ore-no-fusen.feedback.discord_auto_ingest'))).toBeNull();

  let manualRequestBody: string | null = null;
  await page.route('**/api/feedback/discord/ingest', async (route) => {
    manualRequestBody = route.request().postData();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ingested: 0, rejected: [] }) });
  });
  await page.getByRole('button', { name: '取り込み実行' }).click();
  await expect(page.getByText('取り込み: 0 件')).toBeVisible();
  expect(manualRequestBody).toBe('{}');
});
