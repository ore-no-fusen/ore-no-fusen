import { expect, test } from '@playwright/test';
import { mockTauriAPI } from './mock-tauri';

test('しまった付箋を保存場所から選んで取り出せる', async ({ page }) => {
    await mockTauriAPI(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.evaluate(() => {
        (window as any).__MOCK_EMIT__('fusen:open_archive_restore', {});
    });

    await expect(page.getByRole('heading', { name: 'しまった付箋を取り出す' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('本文 5')).toBeVisible();
    await expect(page.getByText('本文 0')).not.toBeVisible();

    await page.getByRole('button', { name: /Archive/ }).click();
    await page.getByText('本文 2').click();
    await page.getByRole('button', { name: '1枚を取り出す' }).click();

    await expect(page.getByText('1枚を取り出しました')).toBeVisible();
});
