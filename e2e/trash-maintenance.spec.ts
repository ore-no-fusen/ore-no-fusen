import { expect, test } from '@playwright/test';
import { mockTauriAPI } from './mock-tauri';

test('broken history shows safe stop and never offers unreviewed deletion', async ({ page }) => {
  await mockTauriAPI(page, { language: 'ja', trashBroken: true });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => (window as any).__MOCK_HAS_LISTENER__?.('fusen:open_settings'))).toBe(true);
  await page.evaluate(() => (window as any).__MOCK_EMIT__('fusen:open_settings', { tab: 'data' }));
  const content = page.locator('[data-settings-content]');
  await expect(content).toBeVisible();
  const details = content.getByText('詳細', { exact: true });
  for (const item of await details.all()) if (await item.isVisible()) await item.click();
  await expect(content).toContainText('オン・安全停止中');
  await expect(content).toContainText('起動1時間後から1日1回以下');
  await content.getByRole('button', { name: '対象を確認する' }).click();
  await expect(content).toContainText('ファイルは削除していません');
  await expect(content.getByRole('button', { name: '確認した90日経過分を削除する' })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('trash-stopped.png'), fullPage: true });
});
