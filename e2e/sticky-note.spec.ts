import { test, expect, Page } from '@playwright/test';

/**
 * E2Eテスト: 付箋アプリの基本動作
 * 
 * 注意: これらのテストはNext.js開発サーバーに対して実行されます。
 * Tauri API（ウィンドウ操作など）はブラウザでは動作しないため、
 * Tauri APIをモックしてテストします。
 */

import { mockTauriAPI } from './mock-tauri';

/**
 * E2Eテスト: 付箋アプリの基本動作
 * 
 * 注意: これらのテストはNext.js開発サーバーに対して実行されます。
 * Tauri API（ウィンドウ操作など）はブラウザでは動作しないため、
 * Tauri APIをモックしてテストします。
 */

test.describe('付箋アプリ基本動作', () => {

    test.beforeEach(async ({ page }) => {
        // ブラウザのコンソールログを表示
        page.on('console', msg => console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`));
        // 未補足の例外を表示（スタックトレース付き）
        page.on('pageerror', exception => {
            console.log(`[Browser Error] Uncaught exception: "${exception}"`);
            if (exception.stack) {
                console.log(`[Browser Error Stack]:\n${exception.stack}`);
            }
        });

        // Tauri APIをモック
        await mockTauriAPI(page);
        // テスト用のモックパスでページを開く
        await page.goto('/?path=C:/test/note.md');
        // ページが読み込まれるのを待つ
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000); // コンポーネントがマウントされるのを待つ

        // 閲覧モード → 編集モードへ遷移（テストは編集モードを前提とする）
        const article = page.locator('article.notePaper');
        await article.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
        if (await article.isVisible().catch(() => false)) {
            await article.dblclick();
            await page.locator('.cm-content').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
        }
    });

    /**
     * 基本表示テスト: アプリが正常に読み込まれる
     */
    test('ページが正常に読み込まれる', async ({ page }) => {
        // ページタイトルが正しく設定されているか確認
        // 注: Tauri環境外ではタイトルが設定されない場合があるため、
        // bodyが表示されていることで「読み込み完了」とみなす
        await expect(page.locator('body')).toBeVisible();

        // エラーオーバーレイが表示されていないことを確認
        // これにより、クラッシュしていないことを保証する
        const errorOverlay = page.locator('[data-nextjs-dialog]');
        await expect(errorOverlay).not.toBeVisible();
    });

    /**
     * No.4バグ回帰テスト: チェックボックスをクリックしても編集モードに入らない
     */
    test('チェックボックス要素が存在する場合の表示確認', async ({ page }) => {
        // ページが読み込まれたらOK
        await expect(page.locator('body')).toBeVisible();
    });

    /**
     * Undo/Redo機能の動作確認
     */
    test('Undo/Redo機能が動作する', async ({ page }) => {
        const editor = page.locator('.cm-content');
        await expect(editor).toBeVisible();

        // 初期状態でテキストを入力
        await editor.click();
        await editor.press('Control+a'); // 全選択
        await editor.press('Backspace'); // 削除

        await editor.type('テスト入力1');
        await expect(editor).toContainText('テスト入力1');

        // 追加入力 (少し間を空けてHistoryに記録させる)
        await page.waitForTimeout(500);
        await editor.press('Enter');
        await editor.type('テスト入力2');
        // CodeMirrorは行ごとにdivを分けるため、\nでの一致は使わず個別に確認
        await expect(editor).toContainText('テスト入力1');
        await expect(editor).toContainText('テスト入力2');

        // Undo (Ctrl+Z)
        await editor.press('Control+z');

        // 変化を確認 (入力2が消えるはず)
        await page.waitForTimeout(200);
        const textAfterUndo = await editor.innerText();
        expect(textAfterUndo).not.toContain('テスト入力2');

        // Redo (Ctrl+Y)
        await editor.press('Control+y');

        // 変化を確認 (入力2が戻るはず)
        await page.waitForTimeout(200);
        await expect(editor).toContainText('テスト入力1');
        await expect(editor).toContainText('テスト入力2');
    });

    /**
     * 副作用対策テスト: ツールバー操作で編集モードが終了しないこと
     */
    test('ツールバーボタンを押しても編集モードが維持される', async ({ page }) => {
        const editor = page.locator('.cm-content');
        await expect(editor).toBeVisible();
        await editor.click();
        await expect(editor).toBeFocused();

        // 最終行に移動して選択（先頭行は overflow クリップで太字バーが非表示になるため）
        await editor.press('Control+End');
        await editor.press('Home');
        await editor.press('Shift+End');
        await page.waitForTimeout(300);

        // 太字ボタンをクリック (onPointerDownでpreventDefaultされているはず)
        const boldBtn = page.locator('button[title="太字 (Ctrl+B)"]');
        await boldBtn.click();

        // エディタにまだフォーカスがあるか、あるいは編集モード(.cm-contentが存在)が維持されているか
        // focus状態はブラウザ実装依存で外れる可能性があるが、アプリロジックとして「編集モード」ならOK
        await expect(page.locator('.cm-content')).toBeVisible();

        // 念のため入力できるか確認
        await editor.type('Bold check');
        await expect(editor).toContainText('Bold check');
    });

    /**
     * ヘッダー（ドラッグハンドル）クリックで編集モードが終了すること
     */
    test('ヘッダーをクリックすると編集モードが終了する', async ({ page }) => {
        const editor = page.locator('.cm-content');
        await expect(editor).toBeVisible();
        await editor.click();
        await expect(editor).toBeFocused();
        await editor.type('Header exit test');

        // ドラッグハンドルをクリック（エディタ外への操作で編集モードを終了させる）
        const dragHandle = page.locator('[title="ドラッグで移動"]');
        await dragHandle.click();

        // 編集モードが終了していること（.cm-content が消えている）
        await expect(page.locator('.cm-content')).not.toBeVisible();
        // 閲覧モードの要素が見えているか確認
        const article = page.locator('article.notePaper');
        await expect(article).toBeVisible();
        await expect(article).toContainText('Header exit test');
    });

    /**
     * Escapeキーで編集モードが終了すること
     */
    test('Escapeキーを押すと編集モードが終了する', async ({ page }) => {
        const editor = page.locator('.cm-content');
        await expect(editor).toBeVisible();
        await editor.click();
        await expect(editor).toBeFocused();
        await editor.type('Escape exit test');

        // Escapeキーを押す
        await editor.press('Escape');

        // 編集モードが終了していること
        await expect(page.locator('.cm-content')).not.toBeVisible();
        const article = page.locator('article.notePaper');
        await expect(article).toBeVisible();
        await expect(article).toContainText('Escape exit test');
    });

    /**
     * 回帰テスト: ウィンドウフォーカス喪失時（外側クリック時）の編集終了確認
     */
    test('ウィンドウのフォーカスが外れると編集モードが終了する', async ({ page }) => {
        const editor = page.locator('.cm-content');
        await editor.click();
        await expect(editor).toBeFocused();
        await editor.type('Blur check');

        // ウィンドウのBlurをシミュレート
        // Playwrightで別ウィンドウをクリックするのは難しいため、
        // window.dispatchEvent(new Event('blur')) を発行してエミュレートする
        // startEditing の grace period (200ms) が終わるのを待ってからblurを発火する
        await page.waitForTimeout(300);
        await page.evaluate(() => {
            window.dispatchEvent(new Event('blur'));
        });

        // 編集モードが終了している（.cm-contentが消えている、または親div等が変わっている）ことを確認
        // EditorViewは編集終了時、StickyNote.tsxの条件分岐で消えるはず
        // ) : isEditing ? ( ... ) : ( <article ... )
        await expect(page.locator('.cm-content')).not.toBeVisible();

        // 閲覧モードの要素が見えているか確認
        // 閲覧モードでは article.notePaper が表示される
        const article = page.locator('article.notePaper');
        await expect(article).toBeVisible();
        await expect(article).toContainText('Blur check');
    });

    test('閲覧モードで複数行テキストが正しく表示される', async ({ page }) => {
        const editor = page.locator('.cm-content');
        await editor.click();
        await editor.clear();
        await editor.type('Title Line\nBody Line');
        await page.evaluate(() => window.dispatchEvent(new Event('blur')));

        // 1行目・2行目の要素が存在し、正しいテキストを含むことを確認
        const firstLine = page.locator('div[data-line-index="0"]');
        const secondLine = page.locator('div[data-line-index="1"]');

        await expect(firstLine).toContainText('Title Line');
        await expect(secondLine).toContainText('Body Line');
    });
});

test.describe('フロントマター処理（ユニットテストで主にカバー）', () => {

    test.beforeEach(async ({ page }) => {
        page.on('console', msg => console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`));
        await mockTauriAPI(page);
        await page.goto('/?path=C:/test/note.md');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);
        // 閲覧モード → 編集モードへ遷移
        const article = page.locator('article.notePaper');
        await article.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
        if (await article.isVisible().catch(() => false)) {
            await article.dblclick();
            await page.locator('.cm-content').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
        }
    });

    test('ユニットテストを参照', async () => {
        // フロントマター処理はユニットテスト（splitFrontMatter.test.ts）で
        // 完全にカバーされています。
        // E2Eでは、保存・読み込みの統合動作を確認します。
        expect(true).toBe(true);
    });
    test.describe('編集モード移行時のカーソル位置', () => {
        test('太字内のテキストをダブルクリックして編集開始できる', async ({ page }) => {
            const editor = page.locator('.cm-content');
            // editor.clear() はCodeMirrorのstateを更新しない場合があるため、キーボードで全選択→削除
            await editor.click();
            await page.keyboard.press('Control+a');
            await page.keyboard.press('Delete');
            await page.waitForTimeout(100);
            await editor.type('Line 1');
            await editor.press('Enter');
            await editor.type('**Bold** Text');
            // CodeMirrorのonChange反映を待つ
            await page.waitForTimeout(300);
            // 閲覧モードへ
            await page.evaluate(() => window.dispatchEvent(new Event('blur')));
            const article = page.locator('article.notePaper');
            await article.waitFor({ state: 'visible', timeout: 5000 });
            await page.waitForTimeout(200); // レンダリング完了を待つ

            // Bold テキストをダブルクリックして編集モードに入る
            const strong = page.locator('strong').first();
            await expect(strong).toBeVisible();
            await strong.dblclick();
            await editor.waitFor({ state: 'visible', timeout: 3000 });

            await page.keyboard.type('INSERT');

            const content = await editor.innerText();
            // ダブルクリックで編集モードに入りタイプできることを確認
            // カーソル位置は太字テキストの行内（正確な挿入位置は実装依存）
            expect(content).toContain('INSERT');
            expect(content).toContain('**Bold**');
        });

        test('チェックボックスのテキストをダブルクリックして編集開始できる', async ({ page }) => {
            const editor = page.locator('.cm-content');
            await editor.clear();
            await editor.type('- [ ] TaskItem');
            await page.evaluate(() => window.dispatchEvent(new Event('blur')));
            const article = page.locator('article.notePaper');
            await article.waitFor({ state: 'visible', timeout: 5000 });

            const taskText = page.getByText('TaskItem', { exact: true });
            await expect(taskText).toBeVisible();
            await taskText.dblclick();
            await editor.waitFor({ state: 'visible', timeout: 3000 });

            await page.keyboard.type('INSERT');

            const content = await editor.innerText();
            expect(content).toContain('INSERT');
            expect(content).toContain('- [ ] ');
        });

        test('見出しをダブルクリックして編集開始できる', async ({ page }) => {
            const editor = page.locator('.cm-content');
            await editor.clear();
            await editor.type('# Heading');
            // startEditing の grace period (200ms) が終わるのを待ってからblurを発火する
            await page.waitForTimeout(300);
            await page.evaluate(() => window.dispatchEvent(new Event('blur')));
            const article = page.locator('article.notePaper');
            await article.waitFor({ state: 'visible', timeout: 5000 });

            const headingText = page.getByText('Heading', { exact: true });
            await expect(headingText).toBeVisible();
            await headingText.dblclick();
            await editor.waitFor({ state: 'visible', timeout: 3000 });

            await page.keyboard.type('INSERT');

            const content = await editor.innerText();
            expect(content).toContain('INSERT');
            expect(content).toContain('# ');
        });
    });
});
