import { expect, test } from '@playwright/test';
import { mockTauriAPI } from './mock-tauri';

for (const language of ['ja', 'en'] as const) {
    test(`Help shows configured shortcuts and current note operations (${language})`, async ({ page }) => {
        await mockTauriAPI(page, { language, settings: {
            new_note_trigger: 'double_ctrl', shortcut_quick_launcher: 'ctrl+alt+p',
            shortcut_toggle_visibility: 'alt+shift+h', shortcut_arrange: 'ctrl+alt+l',
        } });
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        await expect.poll(() => page.evaluate(() => typeof (window as any).__MOCK_EMIT__)).toBe('function');
        await page.waitForTimeout(1500);
        await page.evaluate(() => (window as any).__MOCK_EMIT__('fusen:open_settings', { tab: 'help' }));
        const content = page.locator('[data-settings-content]');
        await expect(content).toBeVisible();
        for (const item of await content.getByText(language === 'ja' ? '詳細' : 'Details', { exact: true }).all()) {
            if (await item.isVisible()) await item.click();
        }
        const shortcuts = content.locator('table').filter({ hasText: 'Shift+Win+S' });
        await expect(shortcuts.locator('tr').filter({ hasText: /Ctrl\s*\+\s*Alt\s*\+\s*P/ })).toContainText(language === 'ja' ? 'クイックランチャー' : 'Quick Launcher');
        await expect(shortcuts).toContainText(/Alt\s*\+\s*Shift\s*\+\s*H/);
        await expect(shortcuts).toContainText(/Ctrl\s*\+\s*Alt\s*\+\s*L/);
        await expect(shortcuts).not.toContainText('Ctrl+N');
        const fold = content.locator('details').filter({ hasText: language === 'ja' ? '付箋や本文を折りたたむ' : 'Fold a note or part of its text' }).last();
        await fold.locator('summary').click();
        await expect(fold).toContainText('Shift+Tab');
        await expect(fold).toContainText('›');
        const text = await content.innerText();
        expect(text).not.toMatch(/ロックだぜ|Lock-Da-Ze|0\.3/);
        expect(text).toContain(language === 'ja' ? 'Windowsのごみ箱とは別' : 'Windows Recycle Bin');
        if (language === 'en') expect(text).not.toMatch(/[ぁ-んァ-ヶ一-龯]/);
        await page.screenshot({ path: test.info().outputPath(`help-${language}.png`), fullPage: true });
        await shortcuts.locator('tr').filter({ hasText: /Ctrl\s*\+\s*Alt\s*\+\s*P/ }).scrollIntoViewIfNeeded();
        await page.screenshot({ path: test.info().outputPath(`shortcuts-${language}.png`) });
        await content.getByRole('heading', { name: language === 'ja' ? '付箋を作って、書く' : 'Create a note and write', exact: true }).scrollIntoViewIfNeeded();
        await page.screenshot({ path: test.info().outputPath(`basics-${language}.png`) });
    });
}
