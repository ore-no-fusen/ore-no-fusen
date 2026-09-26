import { expect, test } from '@playwright/test';
import { mockTauriAPI } from './mock-tauri';

test('お便りと返信を古い順に表示し、開いたときは最新が見える', async ({ page }) => {
  await mockTauriAPI(page, { announcements: [
    { id: 'new', title: '新しいお便り', body: '新しい本文', createdAt: '2026-09-26T10:00:00Z' },
    { id: 'old', title: '古いお便り', body: '古い本文', createdAt: '2026-09-25T10:00:00Z' },
  ] });
  await page.route('**/conversation/poll', route => route.fulfill({ json: { messages: [
    { messageId: 'latest', authorType: 'user', body: 'お便り「新しいお便り」（ID: new）への返信:\n最新の返事', createdAt: '2026-09-26T11:00:00Z', readByUser: true },
    { messageId: 'middle', authorType: 'developer', body: '途中の返事', createdAt: '2026-09-25T11:00:00Z', readByUser: true },
  ] } }));
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => (window as any).__MOCK_HAS_LISTENER__('fusen:open_settings'));
  await page.evaluate(() => (window as any).__MOCK_EMIT__('fusen:open_settings', { tab: 'conversation' }));
  const history = page.locator('[data-conversation-history]');
  await expect(history.getByText('最新の返事')).toBeVisible();
  const order = await history.locator('article, [data-conversation-message]').allTextContents();
  expect(order[0]).toContain('古いお便り');
  expect(order[1]).toContain('途中の返事');
  expect(order[2]).toContain('新しいお便り');
  expect(order[3]).toContain('最新の返事');
  expect(order[3]).toContain('↳ お便り「新しいお便り」への返信');
  expect(order[3]).not.toContain('ID: new');
  await expect.poll(() => history.evaluate(element => element.scrollHeight - element.scrollTop - element.clientHeight)).toBeLessThan(2);
});
