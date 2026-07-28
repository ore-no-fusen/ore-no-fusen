import { expect, test } from '@playwright/test';

test('[DATA-05] PC受信メモを削除後、Driveキューが残っても再表示されない', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: query === '(display-mode: standalone)',
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
    localStorage.setItem('viewer_access_token', 'e2e-token');
    localStorage.setItem('viewer_push_done', 'true');
  });

  const queue = {
    items: [
      {
        id: 'delete-and-stay-deleted',
        title: '削除後に復活させない',
        body: '削除対象',
        tags: [],
        sent_at: '2026-07-29T00:00:00Z',
      },
      {
        id: 'keep-other-note',
        title: '残すメモ',
        body: '別の未配達メモ',
        tags: [],
        sent_at: '2026-07-29T00:01:00Z',
      },
    ],
  };
  let queueUpdateCount = 0;

  await page.route('**/sw.js', (route) =>
    route.fulfill({ body: '', contentType: 'application/javascript' })
  );
  await page.route('https://www.googleapis.com/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (method === 'DELETE') {
      queueUpdateCount += 1;
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    if (method === 'PATCH') {
      queueUpdateCount += 1;
      await route.fulfill({ json: { id: 'queue-file-id' } });
      return;
    }
    if (url.searchParams.get('alt') === 'media') {
      await route.fulfill({ json: queue });
      return;
    }

    const query = url.searchParams.get('q') ?? '';
    if (query.includes("name='ore-no-fusen'")) {
      await route.fulfill({ json: { files: [{ id: 'app-folder-id' }] } });
      return;
    }
    if (query.includes("name='notes_to_iphone.json'")) {
      await route.fulfill({ json: { files: [{ id: 'queue-file-id' }] } });
      return;
    }
    await route.fulfill({ json: { files: [] } });
  });
  await page.route('**/api/**', (route) => route.fulfill({ json: {} }));

  const openList = async () => {
    await page.goto('/viewer');
    await page.getByRole('button', { name: '一覧', exact: true }).click();
  };

  await openList();
  const target = page.locator('li', { hasText: '削除後に復活させない' });
  await expect(target).toBeVisible();
  await target.getByRole('button', { name: '消す', exact: true }).click();
  await expect(target).toHaveCount(0);

  await openList();
  await expect(page.locator('li', { hasText: '削除後に復活させない' })).toHaveCount(0);
  await expect(page.locator('li', { hasText: '残すメモ' })).toBeVisible();

  const deletedIds = await page.evaluate(async () => {
    const request = indexedDB.open('fusen-meta', 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('meta', 'readonly');
    const getRequest = tx.objectStore('meta').get('deleted_draft_ids');
    return new Promise<string[]>((resolve, reject) => {
      getRequest.onsuccess = () => resolve(getRequest.result ?? []);
      getRequest.onerror = () => reject(getRequest.error);
    });
  });

  expect(deletedIds).toContain('delete-and-stay-deleted');
  expect(queueUpdateCount).toBeGreaterThan(0);
});
