import { expect, test } from '@playwright/test';
import { mockTauriAPI } from './mock-tauri';

for (const mode of ['individual', 'bulk'] as const) {
    test(`${mode} storage keeps launcher registrations visible after repeated opening and reordering`, async ({ page }, info) => {
        await mockTauriAPI(page);
        await page.addInitScript(() => {
            const notes = [
                { path: 'C:/test/a.md', title: '登録A', tags: ['shortcut', '仕事'], launches: 0, is_recipe: false },
                { path: 'C:/test/b.md', title: '登録B', tags: ['shortcut', '仕事'], launches: 0, is_recipe: false },
                { path: 'C:/test/plain.md', title: '未登録C', tags: ['仕事'], launches: 0, is_recipe: false },
            ];
            const stored = new Set<string>();
            const order = [notes[0].path, notes[1].path];
            const calls: string[] = [];
            const original = Reflect.get(window, '__TAURI_INTERNALS__');
            const emit = () => Reflect.get(window, '__MOCK_EMIT__')('fusen:storage_changed', {});
            Reflect.set(window, '__LAUNCHER_TEST_CALLS__', calls);
            Reflect.set(window, '__TAURI_INTERNALS__', new Proxy(original, {
                get(target, prop) {
                    if (prop !== 'invoke') return Reflect.get(target, prop);
                    return async (cmd: string, args: { path?: string; direction?: string } = {}) => {
                        calls.push(cmd);
                        switch (cmd) {
                            case 'fusen_get_launcher_state': return { last_tab: 'shortcut', orders: {}, selected_tags: {} };
                            case 'fusen_quick_open_notes': return order.map(path => notes.find(note => note.path === path));
                            case 'fusen_storage_snapshot': return { paths: [...stored], items: notes.filter(note => stored.has(note.path)), tags: ['仕事'] };
                            case 'fusen_request_store': stored.add(args.path!); emit(); return;
                            case 'fusen_store_tag':
                                notes.forEach(note => {
                                    if (!note.tags.includes('shortcut')) note.tags.push('shortcut');
                                    if (!order.includes(note.path)) order.push(note.path);
                                    stored.add(note.path);
                                });
                                emit(); return { stored: 3, failed: [] };
                            case 'fusen_open_quick_note': stored.delete(args.path!); emit(); return;
                            case 'fusen_reorder_quick_note': {
                                const index = order.indexOf(args.path!);
                                const other = args.direction === 'up' ? index - 1 : index + 1;
                                if (other >= 0 && other < order.length) [order[index], order[other]] = [order[other], order[index]];
                                return;
                            }
                            case 'fusen_set_launcher_last_tab':
                            case 'fusen_set_launcher_tag_filter': return;
                            default: return original.invoke(cmd, args);
                        }
                    };
                },
            }));
        });
        await page.goto('/launcher');
        await expect(page.getByText('登録A', { exact: true })).toBeVisible();
        if (mode === 'bulk') {
            await page.getByRole('button', { name: '仕事', exact: true }).click();
            await expect(page.getByRole('button', { name: 'このタグの付箋をランチャーに登録して画面から隠す' })).toHaveCount(0);
            await page.setViewportSize({ width: 420, height: 520 });
            await page.getByRole('button', { name: '仕事', exact: true }).click({ button: 'right' });
            const menuBounds = await page.getByRole('menu', { name: 'タグ操作' }).boundingBox();
            expect(menuBounds).not.toBeNull();
            expect(menuBounds!.x).toBeGreaterThanOrEqual(0);
            expect(menuBounds!.y).toBeGreaterThanOrEqual(0);
            expect(menuBounds!.x + menuBounds!.width).toBeLessThanOrEqual(420);
            expect(menuBounds!.y + menuBounds!.height).toBeLessThanOrEqual(520);
            await expect(page.getByRole('menuitem', { name: 'このタグの付箋をランチャーに登録', exact: true })).toBeVisible();
            await page.screenshot({ path: info.outputPath('tag-bulk-menu.png') });
            await page.getByRole('menuitem', { name: 'このタグの付箋をランチャーに登録して画面から隠す' }).click();
            await page.setViewportSize({ width: 1000, height: 760 });
        } else {
            await page.getByRole('button', { name: '登録Aを画面から隠す', exact: true }).click();
        }
        await expect(page.getByRole('button', { name: '登録Aを画面に表示', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'ランチャー登録済み', exact: true })).toHaveClass(/text-sky-300/);
        await expect(page.getByText('未登録C', { exact: true })).toHaveCount(mode === 'bulk' ? 1 : 0);
        if (mode === 'bulk') {
            await page.getByText('未登録C', { exact: true }).click();
            await expect(page.getByRole('button', { name: '未登録Cを画面から隠す', exact: true })).toBeVisible();
            await page.getByText('未登録C', { exact: true }).click();
            await expect(page.getByText('未登録C', { exact: true })).toBeVisible();
        }
        await page.getByText('登録A', { exact: true }).click();
        await expect(page.getByRole('button', { name: '登録Aを画面から隠す', exact: true })).toBeVisible();
        await page.getByText('登録A', { exact: true }).click();
        await expect(page.getByText('登録A', { exact: true })).toBeVisible();
        const rowB = page.getByRole('button').filter({ has: page.getByText('登録B', { exact: true }) });
        await rowB.hover();
        await rowB.getByRole('button', { name: '上へ', exact: true }).click();
        await expect(page.locator('span.truncate')).toHaveText(mode === 'bulk' ? ['登録B', '登録A', '未登録C'] : ['登録B', '登録A']);
        const calls: string[] = await page.evaluate(() => Reflect.get(window, '__LAUNCHER_TEST_CALLS__'));
        expect(calls.filter(cmd => cmd === 'fusen_open_quick_note')).toHaveLength(mode === 'bulk' ? 4 : 2);
        expect(calls).not.toContain('fusen_remove_from_shelf');
        await page.screenshot({ path: info.outputPath(`${mode}-registrations-remain.png`) });
    });
}
