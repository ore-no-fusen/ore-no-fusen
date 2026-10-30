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
        await expect(content.getByText(language === 'ja' ? '押すとホットキーを無効にする' : 'Press to disable hotkey')).toHaveCount(4);
        await page.setViewportSize({ width: 640, height: 900 });
        for (const control of await switches.all()) {
            const box = await control.boundingBox();
            const card = control.locator('xpath=ancestor::div[contains(@class,"overflow-hidden")][1]');
            const cardBox = await card.boundingBox();
            const details = await card.getByRole('button', { name: language === 'ja' ? '詳細' : 'Details' }).boundingBox();
            expect(box && cardBox && box.x >= cardBox.x && box.x + box.width <= cardBox.x + cardBox.width).toBeTruthy();
            expect(details && cardBox && details.x >= cardBox.x && details.x + details.width <= cardBox.x + cardBox.width).toBeTruthy();
        }
        await page.setViewportSize({ width: 1280, height: 720 });
        for (let index = 0; index < 4; index++) {
            await switches.nth(index).click();
            await expect(switches.nth(index)).not.toBeChecked();
            await expect(content.getByText(language === 'ja' ? '保存しました。' : 'Saved.', { exact: true })).toBeVisible();
        }
        await openHotkeys();
        await expect(switches).toHaveCount(4);
        for (let index = 0; index < 4; index++) await expect(switches.nth(index)).not.toBeChecked();
        await expect(content.getByText(language === 'ja' ? '押すとホットキーを有効にする' : 'Press to enable hotkey')).toHaveCount(4);
        // Re-enable only new-note: other actions stay OFF and the saved key remains Ctrl+N.
        await switches.first().click();
        await expect(switches.first()).toBeChecked();
        await expect(switches.nth(1)).not.toBeChecked();
        await expect(content).toContainText('Ctrl + N');
        await page.screenshot({ path: test.info().outputPath(`hotkey-off-${language}.png`), fullPage: true });
    });
}
