
/**
 * 範囲選択・編集テスト (E2E)
 *
 * 責務:
 * - テキスト選択範囲の維持と編集操作の検証
 * - 書式適用（太字など）の動作確認
 * - ドラッグ操作による範囲選択のテスト
 */

import { test, expect, Page } from '@playwright/test';
import { mockTauriAPI } from './mock-tauri';


test.describe('範囲選択と編集モード', () => {
    test.beforeEach(async ({ page }) => {
        // [Debug] Log browser console
        page.on('console', msg => console.log(`[Browser] ${msg.type()}: ${msg.text()}`));

        await mockTauriAPI(page);
        await page.goto('/?path=C:/test/note.md');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);
    });

    test('ダブルクリックで編集モードに入り、テキストを編集できる', async ({ page }) => {
        const article = page.locator('article.notePaper');
        await expect(article).toBeVisible();

        // ダブルクリックで編集モードへ
        await article.dblclick();
        const editor = page.locator('.cm-content');
        await expect(editor).toBeVisible({ timeout: 3000 });

        // テキスト入力して確認
        await editor.press('Control+a');
        await editor.type('REPLACED');
        await expect(editor).toContainText('REPLACED');
    });

    test('編集モードで太字ボタンを押すと適用される', async ({ page }) => {
        const article = page.locator('article.notePaper');
        await expect(article).toBeVisible();

        // ダブルクリックで編集モードへ
        await article.dblclick();
        const editor = page.locator('.cm-content');
        await expect(editor).toBeVisible({ timeout: 3000 });

        // テキストをすべて選択
        await editor.press('Control+a');
        await page.waitForTimeout(200);

        // 太字ボタンをクリック
        await page.locator('button[title="太字 (赤)"]').click();

        const content = await editor.innerText();
        expect(content).toMatch(/\*\*.*\*\*/);
    });
});
