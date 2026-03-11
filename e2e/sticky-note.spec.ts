/**
 * 付箋アプリ E2Eテスト（全13件）
 *
 * テスト環境の仕組み:
 * - ブラウザ上でアプリを動かすため、Windowsとの通信部分はダミーに差し替えてテストする
 *
 * グループの並び（ユーザーが得られるメリット・優先度順）:
 * 1. すぐ書ける   ← 思いついたらすぐ書き留められる
 * 2. 強調できる   ← 大事なことを目立たせられる
 * 3. そこに残る   ← 書いたことが消えない・いつでも見つかる
 *
 * 番号の小さいものほど優先度が高い（ユーザーにとって価値が高い）
 */

import { test, expect } from '@playwright/test';
import { mockTauriAPI } from './mock-tauri';

// ============================================================
// 共通セットアップ
// ============================================================
async function setupEditMode(page: any) {
    page.on('console', (msg: any) => console.log(`[Browser] ${msg.type()}: ${msg.text()}`));
    page.on('pageerror', (e: any) => console.log(`[Browser Error] ${e}`));
    await mockTauriAPI(page);
    await page.goto('/?path=C:/test/note.md');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    const article = page.locator('article.notePaper');
    await article.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    if (await article.isVisible().catch(() => false)) {
        await article.dblclick();
        await page.locator('.cm-content').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    }
}

async function setupViewMode(page: any) {
    page.on('console', (msg: any) => console.log(`[Browser] ${msg.type()}: ${msg.text()}`));
    page.on('pageerror', (e: any) => console.log(`[Browser Error] ${e}`));
    await mockTauriAPI(page);
    await page.goto('/?path=C:/test/note.md');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
}


// ============================================================
// 1. すぐ書ける（7件）
// ============================================================
test.describe('すぐ書ける', () => {
    test.beforeEach(async ({ page }) => { await setupEditMode(page); });

    test('1.1 新しい付箋をすぐ作れる', async ({ page }) => {
        await page.goto('/?path=C:/test/note_new.md&isNew=1');
        await page.waitForLoadState('networkidle');

        const editor = page.locator('.cm-content');
        await expect(editor).toBeVisible({ timeout: 10000 });

        const testText = 'テスト入力 ' + Date.now();
        await editor.click();
        await editor.fill(testText);
        await expect(editor).toContainText(testText);
    });

    test('1.2 狙った場所をダブルクリックするとそこから編集できる（見出し・太字・チェックボックス）', async ({ page }) => {
        const editor = page.locator('.cm-content');

        // 見出しで確認
        await editor.clear();
        await editor.type('# Heading');
        await page.waitForTimeout(300);
        await page.evaluate(() => window.dispatchEvent(new Event('blur')));
        await page.locator('article.notePaper').waitFor({ state: 'visible', timeout: 5000 });
        await page.getByText('Heading', { exact: true }).dblclick();
        await editor.waitFor({ state: 'visible', timeout: 3000 });
        await page.keyboard.type('INSERT');
        expect(await editor.innerText()).toContain('INSERT');
        expect(await editor.innerText()).toContain('# ');

        // 太字で確認
        await editor.click();
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Delete');
        await page.waitForTimeout(100);
        await editor.type('Line 1');
        await editor.press('Enter');
        await editor.type('**Bold** Text');
        await page.waitForTimeout(300);
        await page.evaluate(() => window.dispatchEvent(new Event('blur')));
        await page.locator('article.notePaper').waitFor({ state: 'visible', timeout: 5000 });
        await page.waitForTimeout(200);
        await page.locator('strong').first().dblclick();
        await editor.waitFor({ state: 'visible', timeout: 3000 });
        await page.keyboard.type('INSERT');
        expect(await editor.innerText()).toContain('INSERT');
        expect(await editor.innerText()).toContain('**Bold**');

        // チェックボックスで確認
        await editor.clear();
        await editor.type('- [ ] TaskItem');
        await page.waitForTimeout(300);
        await page.evaluate(() => window.dispatchEvent(new Event('blur')));
        await page.locator('article.notePaper').waitFor({ state: 'visible', timeout: 5000 });
        await page.getByText('TaskItem', { exact: true }).dblclick();
        await editor.waitFor({ state: 'visible', timeout: 3000 });
        await page.keyboard.type('INSERT');
        expect(await editor.innerText()).toContain('INSERT');
        expect(await editor.innerText()).toContain('- [ ] ');
    });

    test('1.3 間違えてもすぐ元に戻せる', async ({ page }) => {
        const editor = page.locator('.cm-content');
        await editor.click();
        await editor.press('Control+a');
        await editor.press('Backspace');

        await editor.type('テスト入力1');
        await expect(editor).toContainText('テスト入力1');

        // 少し間を空けて入力履歴を区切る
        await page.waitForTimeout(500);
        await editor.press('Enter');
        await editor.type('テスト入力2');
        await expect(editor).toContainText('テスト入力2');

        // Ctrl+Z で取り消す
        await editor.press('Control+z');
        await page.waitForTimeout(200);
        expect(await editor.innerText()).not.toContain('テスト入力2');

        // Ctrl+Y でやり直す
        await editor.press('Control+y');
        await page.waitForTimeout(200);
        await expect(editor).toContainText('テスト入力1');
        await expect(editor).toContainText('テスト入力2');
    });

    test('1.4 複数行書いた内容が見やすく表示される', async ({ page }) => {
        const editor = page.locator('.cm-content');
        await editor.click();
        await editor.clear();
        await editor.type('Title Line\nBody Line');
        await page.evaluate(() => window.dispatchEvent(new Event('blur')));

        await expect(page.locator('div[data-line-index="0"]')).toContainText('Title Line');
        await expect(page.locator('div[data-line-index="1"]')).toContainText('Body Line');
    });

    test('1.5 Escape・付箋下部クリック・他の画面への切り替えで編集が終わる', async ({ page }) => {
        const editor = page.locator('.cm-content');

        // Escapeキーで終わる
        await editor.click();
        await editor.type('Escapeキーテスト');
        await editor.press('Escape');
        await expect(page.locator('.cm-content')).not.toBeVisible();
        await expect(page.locator('article.notePaper')).toContainText('Escapeキーテスト');

        // 付箋下部をクリックして終わる
        await page.locator('article.notePaper').dblclick();
        await page.locator('.cm-content').waitFor({ state: 'visible', timeout: 3000 });
        await editor.type('フッタークリックテスト');
        await page.locator('[title="ドラッグで移動"]').click();
        await expect(page.locator('.cm-content')).not.toBeVisible();
        await expect(page.locator('article.notePaper')).toContainText('フッタークリックテスト');

        // 他のアプリに切り替えると自動で終わる
        await page.locator('article.notePaper').dblclick();
        await page.locator('.cm-content').waitFor({ state: 'visible', timeout: 3000 });
        await editor.type('フォーカス外れテスト');
        await page.waitForTimeout(300);
        await page.evaluate(() => { window.dispatchEvent(new Event('blur')); });
        await expect(page.locator('.cm-content')).not.toBeVisible();
        await expect(page.locator('article.notePaper')).toContainText('フォーカス外れテスト');
    });

    test('1.6 キーワードで目的の付箋をすぐ見つけられる', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);

        await page.evaluate(() => {
            (window as any).__MOCK_EMIT__('fusen:open_search', { sourceLabel: 'test' });
        });

        const searchInput = page.locator('input[placeholder="全付箋を検索..."]');
        await expect(searchInput).toBeVisible();
        await searchInput.fill('テスト');
        await page.keyboard.press('Enter');

        await expect(page.locator('button', { hasText: 'note.md' }).first()).toBeVisible();
    });

    test('1.7 書式ボタンを押しても書き続けられる', async ({ page }) => {
        const editor = page.locator('.cm-content');
        await editor.click();

        await editor.press('Control+End');
        await editor.press('Home');
        await editor.press('Shift+End');
        await page.waitForTimeout(300);

        await page.locator('button[title="太字 (Ctrl+B)"]').click();

        // 書式ボタン後もそのまま入力できること
        await expect(page.locator('.cm-content')).toBeVisible();
        await editor.type('太字確認');
        await expect(editor).toContainText('太字確認');
    });
});


// ============================================================
// 2. 強調できる（1件）
// ============================================================
test.describe('強調できる', () => {
    test.beforeEach(async ({ page }) => { await setupEditMode(page); });

    test('2.1 文字を選んでボタンを押すだけで太字にできる', async ({ page }) => {
        const editor = page.locator('.cm-content');
        await expect(editor).toBeVisible({ timeout: 3000 });

        // 最終行に移動して1行選択（先頭行は画面端で太字ボタンが隠れる場合があるため）
        await editor.press('Control+End');
        await editor.press('Home');
        await editor.press('Shift+End');
        await page.waitForTimeout(300);

        await page.locator('button[title="太字 (Ctrl+B)"]').click();

        const content = await editor.innerText();
        expect(content).toMatch(/\*\*.*\*\*/);
    });
});


// ============================================================
// 3. そこに残る（5件）
// ============================================================
test.describe('そこに残る', () => {

    test('3.1 付箋から離れると自動で保存される', async ({ page }) => {
        await setupEditMode(page);

        const saveCalls: string[] = [];
        page.on('console', (msg: any) => {
            if (msg.text().includes('fusen_save_note')) saveCalls.push(msg.text());
        });

        const editor = page.locator('.cm-content');
        await editor.click();
        await editor.type('自動保存テスト');

        // 編集モード開始直後は保存を抑制する仕組みがあるため少し待つ
        await page.waitForTimeout(300);
        await page.evaluate(() => window.dispatchEvent(new Event('blur')));
        await page.waitForTimeout(500);

        expect(saveCalls.length).toBeGreaterThan(0);
    });

    test('3.2 書いた内容がそのまま保存される', async ({ page }) => {
        await setupEditMode(page);

        const testText = '保存内容確認テスト_' + Date.now();
        const saveMessages: string[] = [];
        page.on('console', (msg: any) => {
            if (msg.text().includes('fusen_save_note')) saveMessages.push(msg.text());
        });

        const editor = page.locator('.cm-content');
        await editor.click();
        await editor.fill(testText);

        await page.waitForTimeout(300);
        await page.evaluate(() => window.dispatchEvent(new Event('blur')));
        await page.waitForTimeout(500);

        expect(saveMessages.length).toBeGreaterThan(0);
        await page.locator('article.notePaper').waitFor({ state: 'visible', timeout: 5000 });
        await expect(page.locator('article.notePaper')).toContainText(testText);
    });

    test('3.3 付箋をつかんで好きな場所に移動できる', async ({ page }) => {
        await setupViewMode(page);

        const article = page.locator('article.notePaper');
        await article.waitFor({ state: 'visible', timeout: 5000 });

        const consoleLogs: string[] = [];
        page.on('console', (msg: any) => consoleLogs.push(msg.text()));

        const box = await article.boundingBox();
        if (!box) throw new Error('付箋が見つかりません');
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        // 移動量ベースのドラッグ開始（5px以上動かすと start_dragging が呼ばれる）
        await page.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2 + 10);
        await page.waitForTimeout(100);
        await page.mouse.up();

        expect(consoleLogs.some(log => log.includes('start_dragging'))).toBe(true);
    });

    test('3.4 編集中は誤って動かしてしまわない', async ({ page }) => {
        await setupViewMode(page);

        const article = page.locator('article.notePaper');
        await article.waitFor({ state: 'visible', timeout: 5000 });
        await article.dblclick();

        const editor = page.locator('.cm-content');
        await editor.waitFor({ state: 'visible', timeout: 3000 });

        const consoleLogs: string[] = [];
        page.on('console', (msg: any) => consoleLogs.push(msg.text()));

        const box = await editor.boundingBox();
        if (!box) throw new Error('エディタが見つかりません');
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(100);
        await page.mouse.up();

        expect(consoleLogs.some(log => log.includes('start_dragging'))).toBe(false);
    });

    test('3.5 設定画面で付箋の保存先フォルダを確認できる', async ({ page }) => {
        page.on('console', (msg: any) => console.log(`[Browser] ${msg.type()}: ${msg.text()}`));
        await mockTauriAPI(page);
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);

        await page.evaluate(() => {
            (window as any).__MOCK_EMIT__('fusen:open_settings', {});
        });

        // データ管理セクションを開く
        await expect(page.getByText('データ管理').first()).toBeVisible({ timeout: 5000 });
        await page.getByText('データ管理').first().click();

        // 保存先フォルダのパスが表示されていることを確認
        await expect(page.locator('input#path')).toBeVisible({ timeout: 3000 });
        const pathValue = await page.locator('input#path').inputValue();
        expect(pathValue).toBe('C:/test');
    });
});
