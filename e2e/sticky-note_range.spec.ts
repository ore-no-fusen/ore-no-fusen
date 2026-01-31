

import { test, expect, Page } from '@playwright/test';
import { mockTauriAPI } from './mock-tauri';


test.describe('範囲選択と編集モード', () => {
    test.beforeEach(async ({ page }) => {
        // [Debug] Log browser console
        page.on('console', msg => console.log(`[Browser] ${msg.type()}: ${msg.text()}`));

        await mockTauriAPI(page);
        await page.goto('/?path=C:/test/note.md');
        await page.waitForTimeout(500);
    });

    test('ドラッグ選択で編集モードに入り、選択範囲が維持される', async ({ page }) => {
        const article = page.locator('article.notePaper');
        await expect(article).toBeVisible();

        // テキスト "Line 2" の要素を探す
        // data-line-index="1" (2行目)
        const line2 = page.locator('div[data-line-index="1"]');
        await expect(line2).toBeVisible();
        const bbox = await line2.boundingBox();
        if (!bbox) throw new Error('No bbox');

        // Drag from middle of Line 2 to end of Line 2
        // Line 2 content is "Line 2" (length 6)
        // We select "ne 2" (approx)
        const startX = bbox.x + 10;
        const endX = bbox.x + bbox.width - 5;
        const y = bbox.y + bbox.height / 2;

        await page.mouse.move(startX, y);
        await page.mouse.down();
        await page.mouse.move(endX, y, { steps: 5 });
        await page.mouse.up();

        // Editor should appear
        const editor = page.locator('.cm-content');
        await expect(editor).toBeVisible({ timeout: 2000 });

        // Check if there is a selection in the editor
        // We can check by typing something (it should replace the selection)
        // Or checking DOM selection (unreliable in headless)
        // Or checking simpler: Type 'REPLACED'

        // Wait a bit for the effect to apply selection
        await page.waitForTimeout(300);

        await page.keyboard.type('REPLACED');

        const content = await editor.innerText();
        console.log('Result content:', content);

        // Expect "Line 2" to become "LREPLACED" or "LiREPLACED" depending on exact pixels
        expect(content).toContain('REPLACED');
        expect(content).not.toContain('Line 2'); // Should have replaced part of it
    });

    test('選択状態で太字ボタンを押すと適用される', async ({ page }) => {
        const article = page.locator('article.notePaper');
        const line1 = page.locator('div[data-line-index="0"]'); // Line 1
        const bbox = await line1.boundingBox();
        if (!bbox) throw new Error('No bbox');

        const startX = bbox.x + 5;
        const endX = bbox.x + bbox.width - 5;
        const y = bbox.y + bbox.height / 2;

        await page.mouse.move(startX, y);
        await page.mouse.down();
        await page.mouse.move(endX, y, { steps: 5 });
        await page.mouse.up();

        const editor = page.locator('.cm-content');
        await expect(editor).toBeVisible();
        await page.waitForTimeout(300);

        // Click Bold Button
        await page.locator('button[title="太字 (赤)"]').click();

        const content = await editor.innerText();
        // "Line 1" -> "**Line 1**" (approx)
        expect(content).toMatch(/\*\*.*\*\*/);
    });
});
