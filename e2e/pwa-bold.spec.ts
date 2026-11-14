import { expect, test } from '@playwright/test';
import { setupViewerWithNotes } from './fixtures/setup-viewer';

test('PC受信の太字をPWAの一覧と編集画面で赤く表示し、再表示後も保持する', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupViewerWithNotes(page, [{ id: 'bold-from-pc', title: '太字の実画面試験',
    body: '前 **赤い太字** 後\n- [ ] **確認項目**', created_at: '', images: [], tags: [], status: 'received_pc' }]);
  await page.getByRole('button', { name: '一覧', exact: true }).click();
  const row = page.getByRole('listitem').filter({ hasText: '太字の実画面試験' });
  await expect(row.locator('strong')).toHaveCount(2);
  await expect(row.locator('strong').first()).toHaveCSS('color', 'rgb(255, 0, 0)');
  await row.click();
  const editor = page.locator('[contenteditable="true"]').first();
  await expect(editor.locator('strong')).toHaveCount(2);
  await expect(editor.locator('strong').first()).toHaveCSS('color', 'rgb(255, 0, 0)');
  await page.screenshot({ path: info.outputPath('pwa-bold-actual-editor.png') });
  await page.getByRole('button', { name: '一覧', exact: true }).click();
  await row.click();
  await expect(editor.locator('strong')).toHaveCount(2);
});
