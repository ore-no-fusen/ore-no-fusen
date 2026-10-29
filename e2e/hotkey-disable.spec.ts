import { expect, test } from '@playwright/test';
import { mockTauriAPI } from './mock-tauri';

for (const language of ['ja', 'en'] as const) {
    test(`global keyboard triggers can be disabled individually and restored after reload (${language})`, async ({ page }) => {
        await mockTauriAPI(page, { language });
        const openHotkeys = async () => {
            await page.goto('/');
            await expect.poll(() => page.evaluate(() => (window as any).__MOCK_HAS_LISTENER__?.('fusen:open_settings'))).toBe(true);
            await page.evaluate(() => (window as any).__MOCK_EMIT__('fusen:open_settings', { tab: 'hotkeys' }));
            await expect(page.locator('[data-settings-content]')).toBeVisible();
        };
        await openHotkeys();
        const content = page.locator('[data-settings-content]');
        const switches = content.getByRole('switch').filter({ hasNot: page.locator('[disabled]') });
        await expect(switches).toHaveCount(4);
        for (let index = 0; index < 4; index++) {
            await switches.nth(index).click();
            await expect(switches.nth(index)).not.toBeChecked();
            await expect(content.getByText(language === 'ja' ? '保存しました。' : 'Saved.', { exact: true })).toBeVisible();
        }
        await openHotkeys();
        await expect(switches).toHaveCount(4);
        for (let index = 0; index < 4; index++) await expect(switches.nth(index)).not.toBeChecked();
        // Re-enable only new-note: other actions stay OFF and the saved key remains Ctrl+N.
        await switches.first().click();
        await expect(switches.first()).toBeChecked();
        await expect(switches.nth(1)).not.toBeChecked();
        await expect(content).toContainText('Ctrl + N');
        await page.screenshot({ path: test.info().outputPath(`hotkey-off-${language}.png`), fullPage: true });
    });
}
