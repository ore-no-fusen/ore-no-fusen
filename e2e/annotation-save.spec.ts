import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { mockTauriAPI } from './mock-tauri';

const TEST_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="384" height="108" viewBox="0 0 384 108">
  <rect width="384" height="108" fill="#ffffff"/>
  <rect x="8" y="8" width="368" height="92" fill="#e5e7eb" stroke="#111827" stroke-width="2"/>
  <text x="24" y="60" font-family="sans-serif" font-size="24" fill="#111827">annotation e2e</text>
</svg>`;

const EVIDENCE_DIR = path.join(process.cwd(), 'test-results', 'annotation-evidence');

function testImageDataUrl() {
    return `data:image/svg+xml;base64,${Buffer.from(TEST_SVG, 'utf8').toString('base64')}`;
}

test.describe('Image annotation save', () => {
    test.beforeEach(async ({ page }) => {
        await mockTauriAPI(page, { language: 'ja' });
        await mkdir(EVIDENCE_DIR, { recursive: true });
    });

    test('draws on the Konva canvas and completes PNG save', async ({ page }) => {
        let savedDataUrl: string | undefined;

        // Mock Tauri が受け取った実際の保存payloadを捕捉する。
        // これにより「保存成功コールだけ」ではなく、0 byteではないPNG本体まで検証できる。
        page.on('console', async (message) => {
            try {
                const args = message.args();
                if (args.length < 3) return;
                const prefix = await args[0].jsonValue();
                const cmd = await args[1].jsonValue();
                if (prefix !== '[Mock Tauri] IPC:' || cmd !== 'fusen_save_annotated_image') return;
                const payload = await args[2].jsonValue() as { data?: string };
                if (typeof payload?.data === 'string') savedDataUrl = payload.data;
            } catch {
                // Console messages unrelated to Tauri IPC may not be serializable. Ignore them.
            }
        });

        const image = testImageDataUrl();
        await page.goto(`/e2e/annotation?path=${encodeURIComponent(image)}`);

        // The harness <main> only contains a fixed-position modal, so the parent itself
        // can legitimately have a zero-sized box. Assert that the harness mounted here;
        // actual visibility is verified by the Konva stage immediately below.
        await expect(page.getByTestId('annotation-e2e-page')).toBeAttached();

        const stage = page.locator('.konvajs-content');
        await expect(stage).toBeVisible();
        await page.screenshot({
            path: path.join(EVIDENCE_DIR, '01-original-before-annotation.png'),
            fullPage: true,
        });

        // 明示的にペンを選択し、Konva Stage 上へ実際のマウスイベントで線を描く。
        await page.getByRole('button', { name: 'ペン', exact: true }).click();

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

        // 「何を書いたのか」がスクショで分かるよう、文字入り吹き出しも実際に描画する。
        page.once('dialog', async (dialog) => {
            await dialog.accept('MSIX保存テスト');
        });
        await page.getByRole('button', { name: '吹き出し', exact: true }).click();
        await page.mouse.click(box.x + box.width * 0.58, box.y + box.height * 0.42);

        // Undo が有効になることで、描画オブジェクトが履歴へ登録されたことも確認する。
        await expect(page.getByRole('button', { name: '元に戻す' })).toBeEnabled();
        await page.screenshot({
            path: path.join(EVIDENCE_DIR, '02-annotated-before-save.png'),
            fullPage: true,
        });

        await page.getByRole('button', { name: '保存' }).click();

        // ImageAnnotationModal は、PNG Data URL生成とTauri保存コマンドが成功した時だけ onSaved を呼ぶ。
        await expect.poll(async () =>
            page.locator('html').getAttribute('data-annotation-e2e-result'),
        ).toBe('saved');

        // 保存payloadそのものがPNGで、かつ0 byteではないことを検証する。
        await expect.poll(() => savedDataUrl).toMatch(/^data:image\/png;base64,/);
        if (!savedDataUrl) throw new Error('Annotated PNG payload was not captured');

        const encoded = savedDataUrl.slice(savedDataUrl.indexOf(',') + 1);
        const savedPng = Buffer.from(encoded, 'base64');
        const pngSignature = savedPng.subarray(0, 8).toString('hex');
        expect(pngSignature).toBe('89504e470d0a1a0a');
        expect(savedPng.byteLength).toBeGreaterThan(1000);

        await writeFile(path.join(EVIDENCE_DIR, '03-saved-output.png'), savedPng);
        await writeFile(
            path.join(EVIDENCE_DIR, 'annotation-save-evidence.json'),
            JSON.stringify({
                result: 'saved',
                annotationText: 'MSIX保存テスト',
                savedPngBytes: savedPng.byteLength,
                pngSignature,
                zeroByteRegression: savedPng.byteLength === 0 ? 'FAILED' : 'PASSED',
            }, null, 2) + '\n',
            'utf8',
        );

        // 保存後PNGをもう一度表示して、保存物が実際に画像として開ける証拠も残す。
        await page.setContent(`
            <main style="margin:0;min-height:100vh;display:grid;place-items:center;background:#111;color:white;font-family:sans-serif">
                <section style="text-align:center">
                    <h1>Saved PNG reopened (${savedPng.byteLength} bytes)</h1>
                    <img data-testid="saved-png" src="${savedDataUrl}" style="max-width:90vw;border:2px solid #fff" />
                </section>
            </main>
        `);
        await expect(page.getByTestId('saved-png')).toBeVisible();
        await page.screenshot({
            path: path.join(EVIDENCE_DIR, '04-saved-output-reopened.png'),
            fullPage: true,
        });
    });
});
