import { expect, test } from '@playwright/test';
import { mockTauriAPI } from './mock-tauri';

for (const language of ['ja', 'en'] as const) {
    test(`${language}: settings opens user guides instead of code and internal designs`, async ({ page }) => {
        await mockTauriAPI(page, { language });
        await page.goto('/');
        await page.waitForFunction(() => (window as any).__MOCK_HAS_LISTENER__('fusen:open_settings'));
        await page.evaluate(() => {
            const w = window as any;
            const internals = w.__TAURI_INTERNALS__;
            w.__PUBLIC_GUIDE_OPENED__ = [];
            // The shared mock uses a get trap, so wrapping the object is necessary;
            // assigning its invoke property would be ignored by that trap.
            w.__TAURI_INTERNALS__ = new Proxy(internals, {
                get(target, key, receiver) {
                    if (key !== 'invoke') return Reflect.get(target, key, receiver);
                    return (command: string, args: any) => {
                        if (command === 'plugin:shell|open') {
                            w.__PUBLIC_GUIDE_OPENED__.push(args.path);
                            return Promise.resolve();
                        }
                        return internals.invoke(command, args);
                    };
                },
            });
            w.__MOCK_EMIT__('fusen:open_settings', { tab: 'about' });
        });
        const names = language === 'ja'
            ? ['漫画で分かる 俺の付箋', 'お問い合わせ', '更新情報', 'マニュアル', 'プライバシーポリシー', '利用規約']
            : ['Comic Guide to Ore-no-Fusen', 'Contact the Developer', 'Updates', 'User Guide', 'Privacy Policy', 'Terms of Service'];
        for (const name of names) await page.getByRole('button', { name, exact: true }).click();
        const base = 'https://ore-no-fusen.github.io/ore-no-fusen-guide';
        const manual = `${base}/${language === 'en' ? 'en/' : ''}user-guide/`;
        await expect.poll(() => page.evaluate(() => (window as any).__PUBLIC_GUIDE_OPENED__)).toEqual([
            `${manual}comic.html`, `${base}/contact.html`, `${base}/updates.html`, manual,
            `${base}/100_PRIVACY.html`, `${base}/101_TERMS.html`,
        ]);
        await page.locator('aside').getByRole('button', { name: language === 'ja' ? '使い方' : 'Help', exact: true }).click();
        await page.locator('summary').filter({ hasText: language === 'ja' ? '一覧・トラブル解決' : 'References & Troubleshooting' }).click();
        await page.getByRole('button', { name: language === 'ja' ? '完全版ユーザーガイドを開く' : 'Open Full User Guide', exact: true }).click();
        await expect.poll(() => page.evaluate(() => (window as any).__PUBLIC_GUIDE_OPENED__.at(-1))).toBe(manual);
    });
}
