import { expect, test } from '@playwright/test';
import { mockTauriAPI } from './mock-tauri';

const TEST_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="384" height="108" viewBox="0 0 384 108">
  <rect width="384" height="108" fill="#ffffff"/>
  <rect x="8" y="8" width="368" height="92" fill="#e5e7eb" stroke="#111827" stroke-width="2"/>
  <text x="24" y="60" font-family="sans-serif" font-size="24" fill="#111827">annotation e2e</text>
</svg>`;

function testImageDataUrl() {
    return `data:image/svg+xml;base64,${Buffer.from(TEST_SVG, 'utf8').toString('base64')}`;
}

test.describe('Image annotation save', () => {
    test.beforeEach(async ({ page }) => {
        await mockTauriAPI(page, { language: 'ja' });
    });

    test('draws on the Konva canvas and sends a non-empty PNG to Tauri save', async ({ page }) => {
        const image = testImageDataUrl();
        await page.goto(`/e2e/annotation?path=${encodeURIComponent(image)}`);

        await expect(page.getByTestId('annotation-e2e-page')).toBeVisible();

        // 保存時に Rust 側へ渡される引数を記録する。
        await page.evaluate(() => {
            const internals = (window as any).__TAURI_INTERNALS__;
            const originalInvoke = internals.invoke.bind(internals);
            (window as any).__ANNOTATION_SAVE_ARGS__ = null;
            internals.invoke = async (cmd: string, args: any) => {
                if (cmd === 'fusen_save_annotated_image') {
                    (window as any).__ANNOTATION_SAVE_ARGS__ = args;
                }
                return originalInvoke(cmd, args);
            };
        });

        const stage = page.locator('.konvajs-content');
        await expect(stage).toBeVisible();

        // 明示的にペンを選択し、Konva Stage 上へ実際のマウスイベントで線を描く。
        await page.getByRole('button', { name: 'ペン' }).click();

        const box = await stage.boundingBox();
        expect(box).not.toBeNull();
        if (!box) throw new Error('Konva stage bounding box was not available');

        const startX = box.x + Math.max(20, box.width * 0.2);
        const startY = box.y + Math.max(20, box.height * 0.3);
        const endX = box.x + Math.min(box.width - 20, box.width * 0.75);
        const endY = box.y + Math.min(box.height - 20, box.height * 0.7);

        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(endX, endY, { steps: 12 });
        await page.mouse.up();

        await expect(page.getByRole('button', { name: '元に戻す' })).toBeEnabled();

        await page.getByRole('button', { name: '保存' }).click();

        await expect.poll(async () =>
            page.locator('html').getAttribute('data-annotation-e2e-result'),
        ).toBe('saved');

        const savedArgs = await page.evaluate(() => (window as any).__ANNOTATION_SAVE_ARGS__);
        expect(savedArgs).toBeTruthy();
        expect(savedArgs.data).toMatch(/^data:image\/png;base64,/);
        expect(savedArgs.data.length).toBeGreaterThan('data:image/png;base64,'.length + 100);
    });
});
