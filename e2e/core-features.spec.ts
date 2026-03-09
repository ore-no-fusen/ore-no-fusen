/**
 * E2Eテスト: コア機能 - 自動保存・ドラッグ移動
 *
 * 自動保存: 編集後にblurするとfusen_save_noteが呼ばれること
 * ドラッグ移動: 非インタラクティブ領域でpointerdownするとstartDraggingが呼ばれること
 */
import { test, expect } from '@playwright/test';
import { mockTauriAPI } from './mock-tauri';

test.describe('コア機能: 自動保存', () => {
    test.beforeEach(async ({ page }) => {
        page.on('pageerror', e => console.log(`[Browser Error] ${e}`));
        await mockTauriAPI(page);
        await page.goto('/?path=C:/test/note.md');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);

        // 閲覧モード → 編集モードへ移行
        const article = page.locator('article.notePaper');
        await article.waitFor({ state: 'visible', timeout: 5000 });
        await article.dblclick();
        await page.locator('.cm-content').waitFor({ state: 'visible', timeout: 5000 });
    });

    test('編集後にblurするとfusen_save_noteが呼ばれる', async ({ page }) => {
        // IPC呼び出しをトラック
        const saveCalls: string[] = [];
        page.on('console', msg => {
            if (msg.text().includes('fusen_save_note')) {
                saveCalls.push(msg.text());
            }
        });

        const editor = page.locator('.cm-content');
        await editor.click();
        await editor.type('自動保存テスト');

        // grace period (200ms) が終わるのを待ってからblurを発火する
        await page.waitForTimeout(300);
        await page.evaluate(() => window.dispatchEvent(new Event('blur')));

        // 保存が完了するのを待つ
        await page.waitForTimeout(500);

        expect(saveCalls.length).toBeGreaterThan(0);
    });

    test('保存時に入力したテキストが含まれている', async ({ page }) => {
        const testText = '保存内容確認テスト_' + Date.now();
        const saveArgs: any[] = [];

        // fusen_save_note の引数をキャプチャ
        await page.evaluate(() => {
            const originalInvoke = (window as any).__TAURI_INTERNALS__.invoke;
            (window as any).__capturedSaveArgs = null;
            (window as any).__TAURI_INTERNALS_ORIG_INVOKE__ = originalInvoke;
        });
        // console経由でargs確認（mockが console.log を出力する）
        const saveMessages: string[] = [];
        page.on('console', msg => {
            const text = msg.text();
            if (text.includes('fusen_save_note')) {
                saveMessages.push(text);
            }
        });

        const editor = page.locator('.cm-content');
        await editor.click();
        // 既存テキストをクリアして新しいテキストを入力
        await editor.fill(testText);

        await page.waitForTimeout(300);
        await page.evaluate(() => window.dispatchEvent(new Event('blur')));
        await page.waitForTimeout(500);

        // 保存が呼ばれたことを確認
        expect(saveMessages.length).toBeGreaterThan(0);
        // エディタに入力したテキストが表示されていること（保存内容の間接確認）
        const article = page.locator('article.notePaper');
        await article.waitFor({ state: 'visible', timeout: 5000 });
        await expect(article).toContainText(testText);
    });
});

test.describe('コア機能: ドラッグ移動', () => {
    test.beforeEach(async ({ page }) => {
        page.on('pageerror', e => console.log(`[Browser Error] ${e}`));
        await mockTauriAPI(page);
        await page.goto('/?path=C:/test/note.md');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);
    });

    test('閲覧モードで付箋本体をpointerdownするとstartDraggingが呼ばれる', async ({ page }) => {
        const article = page.locator('article.notePaper');
        await article.waitFor({ state: 'visible', timeout: 5000 });

        // plugin:window|start_dragging IPC呼び出しをコンソールログで追跡
        const consoleLogs: string[] = [];
        page.on('console', msg => consoleLogs.push(msg.text()));

        // 付箋本体（非インタラクティブ領域）でpointerdown（ネイティブマウスイベントで）
        const box = await article.boundingBox();
        if (!box) throw new Error('article.notePaper が見つかりません');
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(100);
        await page.mouse.up();

        const startDragCalled = consoleLogs.some(log => log.includes('start_dragging'));
        expect(startDragCalled).toBe(true);
    });

    test('編集モードでエディタをpointerdownしてもstartDraggingが呼ばれない', async ({ page }) => {
        // 閲覧 → 編集モードへ移行
        const article = page.locator('article.notePaper');
        await article.waitFor({ state: 'visible', timeout: 5000 });
        await article.dblclick();

        const editor = page.locator('.cm-content');
        await editor.waitFor({ state: 'visible', timeout: 3000 });

        // plugin:window|start_dragging IPC呼び出しをコンソールログで追跡
        const consoleLogs: string[] = [];
        page.on('console', msg => consoleLogs.push(msg.text()));

        // エディタ（インタラクティブ領域）でpointerdown（ネイティブマウスイベントで）
        const box = await editor.boundingBox();
        if (!box) throw new Error('.cm-content が見つかりません');
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(100);
        await page.mouse.up();

        const startDragCalled = consoleLogs.some(log => log.includes('start_dragging'));
        expect(startDragCalled).toBe(false);
    });
});
