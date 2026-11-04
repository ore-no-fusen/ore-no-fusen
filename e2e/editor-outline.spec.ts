import { expect, test } from '@playwright/test';
import { mockTauriAPI } from './mock-tauri';

test('editing and reading share folding without deleting hidden text', async ({ page }) => {
    await mockTauriAPI(page);
    await page.goto('/?path=C:/test/note.md');
    const article = page.locator('article.notePaper');
    await expect(article).toBeVisible();
    await article.dblclick();
    const editor = page.locator('.cm-content');
    await editor.fill('親\n  子\n    孫\n    ![画像](https://example.test/x.png)\n次');
    const toggle = editor.getByRole('button', { name: '閉じる' }).first();
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(editor.getByRole('button', { name: '開く' })).toBeVisible();
    await expect(editor).not.toContainText('孫');
    await expect(editor.locator('.cm-image-widget')).toHaveCount(0);
    await editor.press('Control+a');
    await editor.press('Backspace');
    await expect(editor).toContainText('親');
    await editor.getByRole('button', { name: '開く' }).click();
    await expect(editor).toContainText('孫');
    await expect(editor.locator('.cm-image-widget')).toHaveCount(1);
    await editor.getByRole('button', { name: '閉じる' }).first().click();
    await editor.press('Escape');
    await expect(article).not.toContainText('孫');
    await article.dblclick();
    await expect(editor.getByRole('button', { name: '開く' })).toBeVisible();
    await editor.getByRole('button', { name: '開く' }).click();
    await expect(editor).toContainText('孫');
});

test('image indentation allows the caret to move through every space', async ({ page }) => {
    await mockTauriAPI(page);
    await page.goto('/?path=C:/test/note.md');
    const article = page.locator('article.notePaper');
    await expect(article).toBeVisible();
    await article.dblclick();
    const editor = page.locator('.cm-content');
    await editor.fill('    ![x](https://example.test/image.png)');
    const widths = await editor.locator('.cm-line').first().evaluate(line => {
        const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
        const text = walker.nextNode();
        if (!text || (text.textContent?.length ?? 0) < 4) throw new Error('画像前の4文字を取得できません');
        const one = document.createRange(); one.setStart(text, 0); one.setEnd(text, 1);
        const four = document.createRange(); four.setStart(text, 0); four.setEnd(text, 4);
        return { one: one.getBoundingClientRect().width, four: four.getBoundingClientRect().width };
    });
    expect(widths.one).toBeGreaterThan(0);
    expect(widths.four).toBeGreaterThan(widths.one * 3.5);
    await editor.press('Control+Home');
    await editor.press('ArrowRight');
    await editor.press('ArrowRight');
    await editor.press('X');
    const line = await editor.locator('.cm-line').first().textContent();
    expect(line).toContain('  X  ');
});
