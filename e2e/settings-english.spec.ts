import { expect, test } from '@playwright/test';
import { mockTauriAPI } from './mock-tauri';

const JAPANESE_TEXT = /[ぁ-んァ-ヶ一-龯]/;

test('English settings tabs and expanded cards do not leak Japanese UI text', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await mockTauriAPI(page, { language: 'en' });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.evaluate(() => {
        (window as unknown as { __MOCK_EMIT__: (event: string, payload: unknown) => void })
            .__MOCK_EMIT__('fusen:open_settings', {});
    });
    await expect(page.getByText('Settings').first()).toBeVisible({ timeout: 5000 });

    const sections = [
        'General',
        'Data Management',
        'iPhone Sync',
        'Hotkeys',
        'Templates',
        'Help',
        'About',
        'Feedback',
        'Developer Messages',
        'Admin Tools',
    ];

    for (const section of sections) {
        await page.locator('aside button').filter({ hasText: section }).click();
        const details = page.getByText('Details', { exact: true });
        for (let index = 0; index < await details.count(); index += 1) {
            const item = details.nth(index);
            if (await item.isVisible()) await item.click();
        }

        expect(pageErrors, `Page error in ${section}`).toEqual([]);
        const text = await page.locator('[data-settings-content]').innerText();
        const allowedNativeLanguageName = section === 'General' ? text.replace('日本語', '') : text;
        expect(allowedNativeLanguageName, `Japanese text leaked in ${section}`).not.toMatch(JAPANESE_TEXT);
    }
});
