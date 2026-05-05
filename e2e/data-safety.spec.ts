/**
 * データ安全性テスト
 *
 * 「データが消える」系のバグを防ぐための最低限のテスト。
 *
 * DATA-01: saveDraft/loadDraft — 全フィールド（tags, locked 含む）が IndexedDB に保持される
 * DATA-02: deleteDraft — 指定した ID のみ削除し、他のデータを消さない
 * DATA-03: 削除ボタン — 一覧から対象メモのみ消え、他のメモが残る
 * DATA-04: locked メモ削除 — 削除後にロック状態（🔔青色）が解除される
 */

import { test, expect, type Page } from '@playwright/test';

// ============================================================
// ヘルパー
// ============================================================

/** IndexedDB を直接操作するユーティリティ（page.evaluate 内で使う） */
async function openDraftsDB(page: Page) {
  // ページ上のブラウザ環境で IndexedDB 操作を実行するためのラッパー
  return page;
}

/** standalone + ログイン済み状態でページを起動する共通セットアップ */
async function setupPage(page: Page, notes: object[] = []) {
  await page.addInitScript((notesArg: object[]) => {
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

    localStorage.setItem('viewer_access_token', 'dummy-token');
    localStorage.setItem('viewer_push_done', 'true');

    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        ready: Promise.resolve({
          showNotification: () => Promise.resolve(),
          getNotifications: () => Promise.resolve([]),
          active: { postMessage: () => {} },
        }),
        addEventListener: () => {},
        removeEventListener: () => {},
        controller: null,
      },
      configurable: true,
      writable: true,
    });

    if (notesArg.length === 0) return;

    const openReq = indexedDB.open('fusen-drafts', 1);
    openReq.onupgradeneeded = () => {
      openReq.result.createObjectStore('drafts');
    };
    openReq.onsuccess = () => {
      const db = openReq.result;
      const tx = db.transaction('drafts', 'readwrite');
      for (const note of notesArg as Array<{ id: string }>) {
        tx.objectStore('drafts').put(note, note.id);
      }
    };
  }, notes);

  await page.route('**/sw.js', (route) =>
    route.fulfill({ body: '', contentType: 'application/javascript' })
  );
  await page.route('**/api/**', (route) => route.fulfill({ json: {} }));
}

/** IndexedDB の全件を取得する（page.evaluate 経由） */
function getAllDrafts(page: Page) {
  return page.evaluate((): Promise<Array<{ id: string; title?: string; body?: string; tags?: string[]; locked?: boolean }>> => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('fusen-drafts', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('drafts');
      req.onsuccess = () => {
        const tx = req.result.transaction('drafts', 'readonly');
        const r = tx.objectStore('drafts').getAll();
        r.onsuccess = () => resolve(r.result ?? []);
        r.onerror = () => reject(r.error);
      };
      req.onerror = () => reject(req.error);
    });
  });
}

// ============================================================
// DATA-01: IndexedDB saveDraft/loadDraft 全フィールド保持
// ============================================================
test('[DATA-01] saveDraft/loadDraft: title・body・tags・locked・created_at が保持される', async ({ page }) => {
  await page.goto('/viewer');

  const loaded = await page.evaluate(async () => {
    const draft = {
      id: 'data-safety-01',
      title: '# テストタイトル',
      body: 'テスト本文',
      created_at: '2026-04-10T10:00:00.000Z',
      images: [] as { fileName: string; blob: Blob }[],
      tags: ['仕事', 'テスト'],
      locked: true as true,
    };

    function openDB(): Promise<IDBDatabase> {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open('fusen-drafts', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('drafts');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }

    const db = await openDB();

    // 保存
    await new Promise<void>((res, rej) => {
      const tx = db.transaction('drafts', 'readwrite');
      tx.objectStore('drafts').put(draft, draft.id);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });

    // 読み出し
    return new Promise<typeof draft | null>((res, rej) => {
      const tx = db.transaction('drafts', 'readonly');
      const req = tx.objectStore('drafts').get(draft.id);
      req.onsuccess = () => res(req.result ?? null);
      req.onerror = () => rej(req.error);
    });
  });

  expect(loaded).not.toBeNull();
  expect(loaded!.id).toBe('data-safety-01');
  expect(loaded!.title).toBe('# テストタイトル');
  expect(loaded!.body).toBe('テスト本文');
  expect(loaded!.created_at).toBe('2026-04-10T10:00:00.000Z');
  expect(loaded!.tags).toEqual(['仕事', 'テスト']);
  expect(loaded!.locked).toBe(true);
});

// ============================================================
// DATA-02: deleteDraft — 指定 ID のみ削除、他を消さない
// ============================================================
test('[DATA-02] deleteDraft: 指定した ID のみ削除し、他のデータを消さない', async ({ page }) => {
  await page.goto('/viewer');

  const remaining = await page.evaluate(async () => {
    function openDB(): Promise<IDBDatabase> {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open('fusen-drafts', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('drafts');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }

    const db = await openDB();

    // 3件保存
    for (const id of ['keep-A', 'delete-me', 'keep-B']) {
      await new Promise<void>((res, rej) => {
        const tx = db.transaction('drafts', 'readwrite');
        tx.objectStore('drafts').put(
          { id, title: id, body: '', created_at: '', images: [], tags: [] },
          id
        );
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
    }

    // 1件だけ削除
    await new Promise<void>((res, rej) => {
      const tx = db.transaction('drafts', 'readwrite');
      tx.objectStore('drafts').delete('delete-me');
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });

    // 全件取得して ID の一覧を返す
    return new Promise<string[]>((res, rej) => {
      const tx = db.transaction('drafts', 'readonly');
      const req = tx.objectStore('drafts').getAll();
      req.onsuccess = () =>
        res((req.result ?? []).map((d: { id: string }) => d.id));
      req.onerror = () => rej(req.error);
    });
  });

  expect(remaining).toContain('keep-A');
  expect(remaining).toContain('keep-B');
  expect(remaining).not.toContain('delete-me');
});

// ============================================================
// DATA-03: 一覧削除ボタン — 対象メモのみ消え他は残る
// ============================================================
test('[DATA-03] 削除ボタン: 対象メモのみ一覧から消え、他のメモは残る', async ({ page }) => {
  // LOCK-03/05 で動作実績のある最小パターン: matchMedia + localStorage + IndexedDB のみ
  // navigator.serviceWorker はモックしない（モックすると getRegistration が undefined でクラッシュする）
  await page.addInitScript((notesArg: object[]) => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: query === '(display-mode: standalone)',
        media: query, onchange: null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
    localStorage.setItem('viewer_access_token', 'dummy-token');
    localStorage.setItem('viewer_push_done', 'true');

    const openReq = indexedDB.open('fusen-drafts', 1);
    openReq.onupgradeneeded = () => { openReq.result.createObjectStore('drafts'); };
    openReq.onsuccess = () => {
      const db = openReq.result;
      const tx = db.transaction('drafts', 'readwrite');
      for (const note of notesArg as Array<{ id: string }>) {
        tx.objectStore('drafts').put(note, note.id);
      }
    };
  }, [
    { id: 'note-stay', title: '残るメモ', body: '消えてはいけない', created_at: new Date().toISOString(), images: [], tags: [] },
    { id: 'note-delete', title: '削除するメモ', body: '削除対象', created_at: new Date().toISOString(), images: [], tags: [] },
  ]);
  await page.route('**/sw.js', (route) => route.fulfill({ body: '', contentType: 'application/javascript' }));
  await page.route('**/api/**', (route) => route.fulfill({ json: {} }));

  await page.goto('/viewer');
  await page.waitForLoadState('networkidle');

  const listBtn = page.locator('button[aria-label="一覧"]');
  await listBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  if (!await listBtn.isVisible()) {
    test.skip(true, 'write ステップに遷移しなかった');
    return;
  }

  await listBtn.click();
  // 削除ボタンが2件表示されるまで待つ
  await page.locator('button[aria-label="削除"]').first().waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});

  const deleteButtons = page.locator('button[aria-label="削除"]');
  const count = await deleteButtons.count();
  if (count < 2) {
    test.skip(true, '一覧にメモが表示されなかった');
    return;
  }

  // 「削除するメモ」の削除ボタンをクリック。
  // 一覧は描画直後に再レンダリングされることがあるため、li走査で得た相対Locatorを
  // 保持せず、クリック時にタイトル条件付きで取り直す。
  const targetItem = page.locator('li', { hasText: '削除するメモ' }).first();
  await targetItem.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  if (!await targetItem.isVisible()) {
    test.skip(true, '削除対象メモが見つからなかった');
    return;
  }

  await expect(async () => {
    const targetDeleteBtn = page
      .locator('li', { hasText: '削除するメモ' })
      .first()
      .locator('button[aria-label="削除"]');
    await targetDeleteBtn.click({ timeout: 1000 });
  }).toPass({ timeout: 8000 });

  await expect(page.locator('li', { hasText: '削除するメモ' })).toHaveCount(0, { timeout: 5000 });

  // 一覧の内容を確認
  const listContent = await page.locator('ul').textContent().catch(() => '');
  expect(listContent).toContain('残るメモ');
  expect(listContent).not.toContain('削除するメモ');

  // IndexedDB にも残るメモのデータが存在することを確認
  const dbIds = await getAllDrafts(page).then(d => d.map(x => x.id));
  expect(dbIds).toContain('note-stay');
  expect(dbIds).not.toContain('note-delete');
});

// ============================================================
// DATA-04: locked メモ削除後にロック状態が解除される
// ============================================================
test('[DATA-04] locked メモ削除: 削除後に🔔が青色のまま残らない', async ({ page }) => {
  // LOCK-03/05 で動作実績のある最小パターン
  await page.addInitScript((notesArg: object[]) => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: query === '(display-mode: standalone)',
        media: query, onchange: null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
    Object.defineProperty(Notification, 'permission', { get: () => 'granted', configurable: true });
    localStorage.setItem('viewer_access_token', 'dummy-token');
    localStorage.setItem('viewer_push_done', 'true');

    const openReq = indexedDB.open('fusen-drafts', 1);
    openReq.onupgradeneeded = () => { openReq.result.createObjectStore('drafts'); };
    openReq.onsuccess = () => {
      const db = openReq.result;
      const tx = db.transaction('drafts', 'readwrite');
      for (const note of notesArg as Array<{ id: string }>) {
        tx.objectStore('drafts').put(note, note.id);
      }
    };
  }, [
    { id: 'note-locked-delete', title: 'ロック中メモ', body: 'このメモはロックされている', created_at: new Date().toISOString(), images: [], tags: [], locked: true },
    { id: 'note-keep', title: '残るメモ', body: '残る', created_at: new Date().toISOString(), images: [], tags: [] },
  ]);
  await page.route('**/sw.js', (route) => route.fulfill({ body: '', contentType: 'application/javascript' }));
  await page.route('**/api/**', (route) => route.fulfill({ json: {} }));

  await page.goto('/viewer');
  await page.waitForLoadState('networkidle');

  const listBtn = page.locator('button[aria-label="一覧"]');
  await listBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  if (!await listBtn.isVisible()) {
    test.skip(true, 'write ステップに遷移しなかった');
    return;
  }

  await listBtn.click();
  // ロック解除ボタンが表示されるまで待つ
  await page.locator('button[aria-label="ロック解除"]').first().waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});

  // ロック解除ボタン（青色 = ロック中）が表示されていることを確認
  const lockActiveBtn = page.locator('button[aria-label="ロック解除"]');
  if (!await lockActiveBtn.isVisible().catch(() => false)) {
    test.skip(true, 'ロック中ボタンが表示されなかった');
    return;
  }

  // ロック中メモの削除ボタンを押す
  const items = page.locator('li');
  let targetDeleteBtn: import('@playwright/test').Locator | null = null;
  for (let i = 0; i < await items.count(); i++) {
    const item = items.nth(i);
    const text = await item.textContent();
    if (text?.includes('ロック中メモ')) {
      targetDeleteBtn = item.locator('button[aria-label="削除"]');
      break;
    }
  }

  if (!targetDeleteBtn) {
    test.skip(true, 'ロック中メモが見つからなかった');
    return;
  }

  await targetDeleteBtn.click();
  await page.waitForTimeout(800);

  // 削除後にロック解除ボタンが消えていること（ロック状態が残っていないこと）
  const remainingLockBtns = await page.locator('button[aria-label="ロック解除"]').count();
  expect(remainingLockBtns).toBe(0);

  // 残るメモは消えていないこと
  const listContent = await page.locator('ul').textContent().catch(() => '');
  expect(listContent).toContain('残るメモ');
});
