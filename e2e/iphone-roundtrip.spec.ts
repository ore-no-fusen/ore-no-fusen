import { expect, test } from '@playwright/test';
import { mockTauriAPI } from './mock-tauri';

const source = {
  id: 'pc-roundtrip-browser', title: '往復確認', body: '送信時の本文', tags: [],
  sent_at: '2026-09-27T00:00:00Z', originNoteId: 'opaque-origin-id',
  originBodyHash: 'sent-body-hash', originPcId: 'test-pc-id',
  originAppearance: { backgroundColor: '#f7e9b0', x: 100, y: 120, width: 400, height: 300 },
};

test('ブラウザでPC付箋を編集して返送し、PC側で比較して反映を選ぶ', async ({ page, context }) => {
  test.setTimeout(60000);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({ matches: query === '(display-mode: standalone)', media: query,
        onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
        dispatchEvent: () => false }),
    });
    localStorage.setItem('viewer_access_token', 'e2e-token');
    localStorage.setItem('viewer_expires_at', String(Date.now() + 3600_000));
    localStorage.setItem('viewer_push_done', 'true');
  });
  await page.route('**/sw.js', (route) => route.fulfill({ body: '', contentType: 'application/javascript' }));

  let returned: any = null;
  await page.route('https://www.googleapis.com/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const query = url.searchParams.get('q') ?? '';
    if (request.method() === 'DELETE') return route.fulfill({ status: 204, body: '' });
    if (url.pathname.includes('/upload/drive/v3/files')) {
      const body = request.postData() ?? '';
      const start = body.indexOf('{"items":');
      const end = body.indexOf('\r\n--', start);
      if (start >= 0 && end > start) returned = JSON.parse(body.slice(start, end)).items.at(-1);
      return route.fulfill({ json: { id: 'return-queue-id' } });
    }
    if (url.searchParams.get('alt') === 'media') {
      if (url.pathname.endsWith('/source-queue-id')) return route.fulfill({ json: { items: [source] } });
      if (url.pathname.endsWith('/return-queue-id')) return route.fulfill({ json: { items: [] } });
    }
    if (query.includes("name='ore-no-fusen'")) return route.fulfill({ json: { files: [{ id: 'app-folder-id' }] } });
    if (query.includes("name='notes_to_iphone.json'")) return route.fulfill({ json: { files: [{ id: 'source-queue-id' }] } });
    if (query.includes("name='notes_from_iphone.json'")) return route.fulfill({ json: { files: [{ id: 'return-queue-id' }] } });
    return route.fulfill({ json: { files: [] } });
  });
  await page.route('**/api/**', (route) => route.fulfill({ json: {} }));

  await page.goto('/viewer');
  await page.getByRole('button', { name: '一覧', exact: true }).click();
  const card = page.locator('li', { hasText: '往復確認' });
  await expect(card).toBeVisible();
  await card.click();
  const editor = page.locator('[contenteditable="true"]');
  await expect(editor).toBeVisible();
  await expect(editor).toContainText('送信時の本文');
  await editor.fill('往復確認\nブラウザで追加した本文');
  await expect(editor).toContainText('ブラウザで追加した本文');
  await page.getByRole('button', { name: 'PCに送る', exact: true }).click();
  await expect.poll(() => returned).not.toBeNull();
  expect(returned.body).toContain('ブラウザで追加した本文');
  expect(returned.originNoteId).toBe(source.originNoteId);
  expect(returned.originBodyHash).toBe(source.originBodyHash);
  expect(returned.originPcId).toBe(source.originPcId);
  expect(returned.originAppearance).toEqual(source.originAppearance);

  const pc = await context.newPage();
  await mockTauriAPI(pc, { iphoneReturn: true });
  await pc.goto('/');
  await pc.waitForLoadState('networkidle');
  await pc.waitForFunction(() => (window as any).__MOCK_LISTENER_COUNT__?.('fusen:note_from_iphone') > 0);
  try {
    await pc.evaluate((note) => (window as any).__MOCK_EMIT__('fusen:note_from_iphone', note), returned);
  } catch (error) {
    if (!String(error).includes('Execution context was destroyed')) throw error;
    await pc.waitForLoadState('networkidle');
    await pc.waitForFunction(() => (window as any).__MOCK_LISTENER_COUNT__?.('fusen:note_from_iphone') > 0);
    await pc.evaluate((note) => (window as any).__MOCK_EMIT__('fusen:note_from_iphone', note), returned);
  }
  const dialog = pc.getByRole('dialog', { name: 'iPhoneから戻った付箋' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('PCで更新した本文');
  await expect(dialog).toContainText('ブラウザで追加した本文');
  await expect(dialog).toContainText('送信後にPC側も変更されています');
  await dialog.getByRole('button', { name: '元の付箋に反映' }).click();
  await expect.poll(() => pc.evaluate(() => (window as any).__MOCK_IPHONE_CALLS__
    .filter((call: any) => call.cmd === 'fusen_apply_iphone_return').length)).toBe(1);
  const calls = await pc.evaluate(() => (window as any).__MOCK_IPHONE_CALLS__);
  const apply = calls.find((call: any) => call.cmd === 'fusen_apply_iphone_return');
  expect(apply.args.expectedBodyHash).toBe('pc-current-hash');
  expect(apply.args.body).toContain('ブラウザで追加した本文');
  expect(calls.some((call: any) => call.cmd === 'fusen_ack_iphone_note')).toBe(true);
});
