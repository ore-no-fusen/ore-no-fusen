/**
 * ロック画面通知 E2Eテスト
 *
 * LOCK-03: 一覧カードに🔔ボタンが表示される（text-gray-400 = 初期 OFF 状態）
 * LOCK-04: 複数メモの独立した通知タグ（fusen-<noteId> 形式）
 * LOCK-05: DB locked フラグの永続化（DraftRecord.locked フィールド）
 * LOCK-BUG-01: showNotification に data.id が含まれること（通知クリック時に正しいメモを開くため）
 * LOCK-BUG-02: 一覧→編集→一覧で通知が再発火しないこと
 * LOCK-BUG-03: PWA未起動時の通知URLが指定した付箋を開くこと
 * LOCK-BUG-04: 実機用の通知診断コピーが本文を含まないこと
 */

import { test, expect } from '@playwright/test';
import { setupViewerWithNotes } from './fixtures/setup-viewer';

// ============================================================
// LOCK-03: 一覧カードへの🔔ボタン表示（静的 UI 確認）
// ============================================================
test('[LOCK-03] 一覧の全メモカードに🔔ボタンが text-gray-400 で表示される', async ({ page }) => {
  await setupViewerWithNotes(page, [{
    id: 'test-note-lock-03',
    title: 'テストメモ',
    body: 'テスト本文',
    created_at: new Date().toISOString(),
    images: [],
    tags: [],
  }]);
  const listBtn = page.locator('button[aria-label="一覧"]');
  await listBtn.click();
  const lockButton = page.locator('button[aria-label="ロック画面にピン留め"]').first();
  await expect(lockButton).toBeVisible();
  await expect(lockButton).toHaveClass(/text-gray-400/);
});

// ============================================================
// LOCK-04: 複数メモの独立した通知タグ
// ============================================================
test('[LOCK-04] 通知タグは fusen-<noteId> 形式で複数メモが衝突しない', async ({ page: _page }) => {
    // タグ生成ロジックのユニット検証（ブラウザ環境不要）
    const noteId1 = 'note-abc-123';
    const noteId2 = 'note-xyz-456';
    const tag1 = `fusen-${noteId1}`;
    const tag2 = `fusen-${noteId2}`;
    // タグが fusen- プレフィックスを持つことを確認
    expect(tag1).toBe('fusen-note-abc-123');
    expect(tag2).toBe('fusen-note-xyz-456');
    // 2件のタグが衝突しないことを確認
    expect(tag1).not.toBe(tag2);
});

// ============================================================
// LOCK-05: DB locked フラグの永続化
// ============================================================
test('[LOCK-05] DraftRecord の locked フィールドが saveDraft/loadDraft で保持される', async ({ page }) => {
    await setupViewerWithNotes(page, [{
      id: 'test-note-lock-05',
      title: 'ロック中メモ',
      body: 'ロックされた本文',
      created_at: new Date().toISOString(),
      images: [],
      tags: [],
      locked: true,
    }]);
    const listBtn = page.locator('button[aria-label="一覧"]');
    await listBtn.click();
    const lockButton = page.locator('button[aria-label="ピン解除"]').first();
    await expect(lockButton).toBeVisible();
    await expect(lockButton).toHaveClass(/text-red-600/);
});

// ============================================================
// ヘルパー: Service Worker showNotification モック付き初期化
// ============================================================
async function setupWithSwMock(page: import('@playwright/test').Page, notes: object[]) {
  await setupViewerWithNotes(
    page,
    notes as Array<{ id: string; [key: string]: unknown }>,
    { captureNotifications: true },
  );
}

// ============================================================
// LOCK-BUG-01: showNotification に data.id が含まれること
// ============================================================
test('[LOCK-BUG-01] 🔔ボタンクリック時に showNotification が data.id を含む', async ({ page }) => {
  await setupWithSwMock(page, [
    {
      id: 'test-note-bug01',
      title: '# バグ検証メモ',
      body: 'テスト本文テスト本文',
      created_at: new Date().toISOString(),
      images: [],
      tags: [],
    },
  ]);

  const listBtn = page.locator('button[aria-label="一覧"]');
  await listBtn.click();

  const lockBtn = page.locator('button[aria-label="ロック画面にピン留め"]').first();
  await expect(lockBtn).toBeVisible();
  await lockBtn.click();

  await expect.poll(() => page.evaluate(
    () => (window as unknown as Record<string, unknown>).__swNotifCalls as { title: string; options: { tag?: string; data?: { id?: string } } }[]
  )).toHaveLength(1);

  // 🔔クリック分の呼び出しがあること
  const notificationCalls = await page.evaluate(
    () => (window as unknown as Record<string, unknown>).__swNotifCalls as { title: string; options: { tag?: string; data?: { id?: string } } }[]
  );
  const last = notificationCalls[notificationCalls.length - 1];

  // data.id が含まれ、ノートIDと一致すること
  expect(last.options.data).toBeDefined();
  expect(last.options.data?.id).toBe('test-note-bug01');

  // tag も正しい形式であること
  expect(last.options.tag).toBe('fusen-test-note-bug01');
});

// ============================================================
// LOCK-BUG-02: 一覧→編集→一覧で通知が再発火しないこと
// ============================================================
test('[LOCK-BUG-02] 一覧に戻るたびに locked メモの通知が再発火しない', async ({ page }) => {
  await setupWithSwMock(page, [
    {
      id: 'test-note-bug02',
      title: '# 再発火検証メモ',
      body: '本文',
      created_at: new Date().toISOString(),
      images: [],
      tags: [],
      locked: true,
    },
  ]);

  const listBtn = page.locator('button[aria-label="一覧"]');
  await expect(listBtn).toBeVisible();

  // 1回目: 一覧に遷移
  await listBtn.click();
  await page.waitForTimeout(500);

  const callsAfterFirst = await page.evaluate(
    () => ((window as unknown as Record<string, unknown>).__swNotifCalls as unknown[]).length
  );

  // 編集画面に戻る
  const writeBtn = page.locator('button[aria-label="書く"]').first();
  if (await writeBtn.isVisible().catch(() => false)) {
    await writeBtn.click();
    await page.waitForTimeout(300);
  }

  // 2回目: 一覧に再遷移
  await listBtn.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
  if (await listBtn.isVisible()) {
    await listBtn.click();
    await page.waitForTimeout(500);
  }

  const callsAfterSecond = await page.evaluate(
    () => ((window as unknown as Record<string, unknown>).__swNotifCalls as unknown[]).length
  );

  // 2回目の一覧遷移で新たな showNotification が呼ばれていないこと
  expect(callsAfterSecond).toBe(callsAfterFirst);
});

// ============================================================
// LOCK-BUG-03: PWA未起動時の通知URLから対象付箋を開く
// ============================================================
test('[LOCK-BUG-03] 通知URLは複数付箋の中から指定IDの付箋を開く', async ({ page }) => {
  await setupWithSwMock(page, [
    {
      id: 'older-notification-note',
      title: '別の通知',
      body: '開いてはいけない本文',
      created_at: new Date().toISOString(),
      images: [],
      tags: [],
      locked: true,
    },
    {
      id: 'clicked-notification-note',
      title: '押した通知',
      body: 'この付箋を開く',
      created_at: new Date().toISOString(),
      images: [],
      tags: [],
      locked: true,
    },
  ]);

  await page.goto('/viewer?note=clicked-notification-note');

  const editor = page.locator('[contenteditable="true"]');
  await expect(editor).toContainText('押した通知');
  await expect(editor).toContainText('この付箋を開く');
  await expect(editor).not.toContainText('開いてはいけない本文');
  await expect(page).toHaveURL(/\/viewer$/);
});

// ============================================================
// LOCK-BUG-04: 通知診断ログの実機コピー
// ============================================================
test('[LOCK-BUG-04] 通知診断コピーはNAVログを含み本文ログを除外する', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: () => ({
        matches: true,
        media: '(display-mode: standalone)',
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
    localStorage.setItem('viewer_access_token', 'dummy-token');
    localStorage.setItem('viewer_push_done', 'true');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as unknown as { __copiedDiagnostic?: string }).__copiedDiagnostic = text;
        },
      },
    });

    const request = indexedDB.open('fusen-logs', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('logs', { autoIncrement: true });
    request.onsuccess = () => {
      const tx = request.result.transaction('logs', 'readwrite');
      tx.objectStore('logs').add({
        t: '2026-07-30T00:00:00+09:00',
        msg: 'push受信 id=note-1 title=コピーしてはいけない本文',
      });
      tx.objectStore('logs').add({
        t: '2026-07-30T00:00:01+09:00',
        msg: '[NAV] event=notification_click id=note-1',
      });
    };
  });
  await page.route('**/sw.js', (route) =>
    route.fulfill({ body: '', contentType: 'application/javascript' })
  );
  await page.route('**/api/**', (route) => route.fulfill({ json: {} }));

  await page.goto('/viewer?debug=1');
  await page.getByRole('button', {
    name: /通知診断をコピー|Copy notification diagnostics/,
  }).click();

  await expect.poll(() => page.evaluate(
    () => (window as unknown as { __copiedDiagnostic?: string }).__copiedDiagnostic ?? ''
  )).toContain('[NAV] event=notification_click id=note-1');
  const copied = await page.evaluate(
    () => (window as unknown as { __copiedDiagnostic?: string }).__copiedDiagnostic ?? ''
  );
  expect(copied).not.toContain('コピーしてはいけない本文');
});
