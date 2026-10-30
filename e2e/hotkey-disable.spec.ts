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
        await expect(switches).toHaveCount(8);
        await expect(content.getByText(language === 'ja' ? '押すとホットキーを無効にする' : 'Press to disable hotkey')).toHaveCount(8);
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
        for (let index = 0; index < 8; index++) {
            await switches.nth(index).click();
            await expect(switches.nth(index)).not.toBeChecked();
            await expect(content.getByText(language === 'ja' ? '保存しました。' : 'Saved.', { exact: true })).toBeVisible();
        }
        await openHotkeys();
        await expect(switches).toHaveCount(8);
        for (let index = 0; index < 8; index++) await expect(switches.nth(index)).not.toBeChecked();
        await expect(content.getByText(language === 'ja' ? '押すとホットキーを有効にする' : 'Press to enable hotkey')).toHaveCount(8);
        // Re-enable only new-note: other actions stay OFF and the saved key remains Ctrl+N.
        await switches.first().click();
        await expect(switches.first()).toBeChecked();
        await expect(switches.nth(1)).not.toBeChecked();
        await expect(content).toContainText('Ctrl + N');
        await page.screenshot({ path: test.info().outputPath(`hotkey-off-${language}.png`), fullPage: true });
        await switches.last().scrollIntoViewIfNeeded();
        await page.screenshot({ path: test.info().outputPath(`hotkey-editor-off-${language}.png`), fullPage: true });
        for (let index = 4; index < 8; index++) await expect(switches.nth(index)).not.toBeChecked();
        await switches.nth(4).click();
        await expect(switches.nth(4)).toBeChecked();
        await expect(switches.nth(1)).not.toBeChecked();
        await expect(switches.nth(5)).not.toBeChecked();
    });
}

for (const enabled of [true, false]) {
    test(`editor format hotkeys ${enabled ? 'run' : 'do not run'} when ${enabled ? 'enabled' : 'disabled'}`, async ({ page }) => {
        await mockTauriAPI(page, { settings: { disabled_editor_hotkeys: enabled ? [] : ['editor_bold', 'editor_heading', 'editor_bullet_list', 'editor_checkbox'] } });
        await page.goto('/?path=C:/test/note.md');
        const article = page.locator('article.notePaper');
        await expect(article).toBeVisible();
        await article.dblclick();
        const editor = page.locator('.cm-content');
        await expect(editor).toBeVisible();
        for (const [key, expected] of [['Control+b', '**sample**'], ['Control+h', '# sample'], ['Control+l', '- sample'], ['Control+Shift+c', '- [ ] sample']]) {
            await editor.fill('sample');
            await editor.press('Control+a');
            await editor.press(key);
            await expect(editor).toHaveText(enabled ? expected : 'sample');
        }
    });
}

test('changing editor hotkey availability keeps undo history and applies immediately', async ({ page }) => {
    await mockTauriAPI(page);
    await page.goto('/?path=C:/test/note.md');
    const article = page.locator('article.notePaper');
    await expect(article).toBeVisible();
    await article.dblclick();
    const editor = page.locator('.cm-content');
    await editor.fill('sample');
    await editor.press('End');
    await editor.press('x');
    await expect(editor).toHaveText('samplex');
    await page.evaluate(async () => {
        const settings = await (window as any).__TAURI_INTERNALS__.invoke('get_settings', {});
        (window as any).__MOCK_EMIT__('settings_updated', { ...settings, disabled_editor_hotkeys: ['editor_bold'] });
    });
    await editor.press('Control+z');
    await expect(editor).toHaveText('sample');
    await editor.press('Control+a');
    await editor.press('Control+b');
    await expect(editor).toHaveText('sample');
    await page.evaluate(async () => {
        const settings = await (window as any).__TAURI_INTERNALS__.invoke('get_settings', {});
        (window as any).__MOCK_EMIT__('settings_updated', { ...settings, disabled_editor_hotkeys: [] });
    });
    await editor.press('Control+b');
    await expect(editor).toHaveText('**sample**');
});

test('an editor hotkey stays enabled when saving the disabled state fails', async ({ page }) => {
    await mockTauriAPI(page, { editorHotkeyFail: true });
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => (window as any).__MOCK_HAS_LISTENER__?.('fusen:open_settings'))).toBe(true);
    await page.evaluate(() => (window as any).__MOCK_EMIT__('fusen:open_settings', { tab: 'hotkeys' }));
    const bold = page.getByRole('switch', { name: '太字 キー操作を有効にする' });
    await expect(bold).toBeChecked();
    page.once('dialog', dialog => dialog.accept());
    await bold.click();
    await expect(bold).toBeChecked();
});
