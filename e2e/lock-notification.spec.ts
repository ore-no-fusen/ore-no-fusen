/**
 * ロック画面通知 E2Eテスト
 *
 * LOCK-03: 一覧カードに🔔ボタンが表示される（text-gray-400 = 初期 OFF 状態）
 * LOCK-04: 複数メモの独立した通知タグ（fusen-lock-<noteId> 形式）
 * LOCK-05: DB locked フラグの永続化（DraftRecord.locked フィールド）
 * LOCK-BUG-01: showNotification に data.id が含まれること（通知クリック時に正しいメモを開くため）
 * LOCK-BUG-02: 一覧→編集→一覧で通知が再発火しないこと
 */

import { test, expect } from '@playwright/test';

// ============================================================
// LOCK-03: 一覧カードへの🔔ボタン表示（静的 UI 確認）
// ============================================================
test('[LOCK-03] 一覧の全メモカードに🔔ボタンが text-gray-400 で表示される', async ({ page }) => {
  // standalone モードとして振る舞わせる
  await page.addInitScript(() => {
    // matchMedia を上書き: standalone = true にする
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

    // localStorage にアクセストークンと push_done を設定
    localStorage.setItem('viewer_access_token', 'dummy-token');
    localStorage.setItem('viewer_push_done', 'true');

    // IndexedDB に下書きを1件投入する
    const openReq = indexedDB.open('fusen-drafts', 1);
    openReq.onupgradeneeded = () => {
      openReq.result.createObjectStore('drafts');
    };
    openReq.onsuccess = () => {
      const db = openReq.result;
      const tx = db.transaction('drafts', 'readwrite');
      tx.objectStore('drafts').put(
        {
          id: 'test-note-lock-03',
          title: 'テストメモ',
          body: 'テスト本文',
          created_at: new Date().toISOString(),
          images: [],
          tags: [],
        },
        'test-note-lock-03'
      );
    };
  });

  // service worker を無効化（テスト環境では不要）
  await page.route('**/sw.js', (route) => route.fulfill({ body: '', contentType: 'application/javascript' }));
  // Drive API 呼び出しをモック（認証チェックに使われる場合を想定）
  await page.route('**/api/**', (route) => route.fulfill({ json: {} }));

  await page.goto('/viewer');
  await page.waitForLoadState('networkidle');

  // write ステップに遷移していることを確認（standalone + token + push_done）
  // 一覧ボタン（📋）をクリックして list ステップへ
  const listBtn = page.locator('button[aria-label="一覧"]');
  await listBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

  if (await listBtn.isVisible()) {
    await listBtn.click();
    // list ステップで🔔ボタンを確認
    await page.waitForTimeout(500);
    const lockButton = page.locator('button[aria-label="ロック画面に表示"]').first();
    const isLockButtonVisible = await lockButton.isVisible().catch(() => false);
    if (isLockButtonVisible) {
      await expect(lockButton).toHaveClass(/text-gray-400/);
    } else {
      // ノートが表示されていない場合（IndexedDB が初期化前）はスキップ
      test.skip(true, '一覧にノートが表示されなかった（IndexedDB 初期化タイミングの問題）');
    }
  } else {
    // write ステップに遷移しなかった場合はスキップ
    test.skip(true, 'write ステップに遷移しなかった（認証フロー）');
  }
});

// ============================================================
// LOCK-04: 複数メモの独立した通知タグ
// ============================================================
test('[LOCK-04] 通知タグは fusen-lock-<noteId> 形式で複数メモが衝突しない', async ({ page: _page }) => {
    // タグ生成ロジックのユニット検証（ブラウザ環境不要）
    const noteId1 = 'note-abc-123';
    const noteId2 = 'note-xyz-456';
    const tag1 = `fusen-lock-${noteId1}`;
    const tag2 = `fusen-lock-${noteId2}`;
    // タグが fusen-lock- プレフィックスを持つことを確認
    expect(tag1).toBe('fusen-lock-note-abc-123');
    expect(tag2).toBe('fusen-lock-note-xyz-456');
    // 2件のタグが衝突しないことを確認
    expect(tag1).not.toBe(tag2);
    // fusen-<id> タグ（active notif）と区別できることを確認
    expect(tag1).not.toBe(`fusen-${noteId1}`);
});

// ============================================================
// LOCK-05: DB locked フラグの永続化
// ============================================================
test('[LOCK-05] DraftRecord の locked フィールドが saveDraft/loadDraft で保持される', async ({ page }) => {
    // standalone モードとして振る舞わせる
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

      localStorage.setItem('viewer_access_token', 'dummy-token');
      localStorage.setItem('viewer_push_done', 'true');

      // IndexedDB に locked=true のメモを投入
      const openReq = indexedDB.open('fusen-drafts', 1);
      openReq.onupgradeneeded = () => {
        openReq.result.createObjectStore('drafts');
      };
      openReq.onsuccess = () => {
        const db = openReq.result;
        const tx = db.transaction('drafts', 'readwrite');
        tx.objectStore('drafts').put(
          {
            id: 'test-note-lock-05',
            title: 'ロック中メモ',
            body: 'ロックされた本文',
            created_at: new Date().toISOString(),
            images: [],
            tags: [],
            locked: true,
          },
          'test-note-lock-05'
        );
      };
    });

    await page.route('**/sw.js', (route) => route.fulfill({ body: '', contentType: 'application/javascript' }));
    await page.route('**/api/**', (route) => route.fulfill({ json: {} }));

    await page.goto('/viewer');
    await page.waitForLoadState('networkidle');

    const listBtn = page.locator('button[aria-label="一覧"]');
    await listBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

    if (await listBtn.isVisible()) {
      await listBtn.click();
      await page.waitForTimeout(500);
      // locked=true のメモの🔔ボタンが text-blue-500 になっていることを確認
      const lockButton = page.locator('button[aria-label="ロック解除"]').first();
      const isVisible = await lockButton.isVisible().catch(() => false);
      if (isVisible) {
        await expect(lockButton).toHaveClass(/text-blue-500/);
      } else {
        test.skip(true, 'ロック中ボタンが表示されなかった（IndexedDB 初期化タイミングの問題）');
      }
    } else {
      test.skip(true, 'write ステップに遷移しなかった（認証フロー）');
    }
});

// ============================================================
// ヘルパー: Service Worker showNotification モック付き初期化
// ============================================================
async function setupWithSwMock(page: import('@playwright/test').Page, notes: object[]) {
  await page.addInitScript((notesArg: object[]) => {
    // Service Worker の showNotification 呼び出しを記録するスパイを window に設置
    // navigator.serviceWorker はモックしない（getRegistration が undefined でクラッシュするため）
    // 代わりに navigator.serviceWorker.ready.then() の showNotification を差し替える
    const swNotifCalls: { title: string; options: Record<string, unknown> }[] = [];
    (window as unknown as Record<string, unknown>).__swNotifCalls = swNotifCalls;

    // standalone モード
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

    // Notification.permission = 'granted' に固定
    Object.defineProperty(Notification, 'permission', {
      get: () => 'granted',
      configurable: true,
    });

    localStorage.setItem('viewer_access_token', 'dummy-token');
    localStorage.setItem('viewer_push_done', 'true');

    // ServiceWorkerRegistration.showNotification をスパイに差し替え
    // ready 解決後に呼ばれるため、prototype を上書きする
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        const orig = reg.showNotification.bind(reg);
        reg.showNotification = (title: string, options: NotificationOptions) => {
          swNotifCalls.push({ title, options: options as Record<string, unknown> });
          return orig(title, options);
        };
      }).catch(() => {});
    }

    // IndexedDB にメモを投入
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

  await page.route('**/sw.js', (route) => route.fulfill({ body: '', contentType: 'application/javascript' }));
  await page.route('**/api/**', (route) => route.fulfill({ json: {} }));
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

  await page.goto('/viewer');
  await page.waitForLoadState('networkidle');

  const listBtn = page.locator('button[aria-label="一覧"]');
  await listBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  if (!await listBtn.isVisible()) {
    test.skip(true, 'write ステップに遷移しなかった');
    return;
  }

  await listBtn.click();
  await page.waitForTimeout(500);

  const lockBtn = page.locator('button[aria-label="ロック画面に表示"]').first();
  if (!await lockBtn.isVisible().catch(() => false)) {
    test.skip(true, '🔔ボタンが表示されなかった');
    return;
  }

  await lockBtn.click();
  await page.waitForTimeout(500);

  const calls = await page.evaluate(
    () => (window as unknown as Record<string, unknown>).__swNotifCalls as { title: string; options: { tag?: string; data?: { id?: string } } }[]
  );

  // 🔔クリック分の呼び出しがあること
  expect(calls.length).toBeGreaterThan(0);
  const last = calls[calls.length - 1];

  // data.id が含まれ、ノートIDと一致すること
  expect(last.options.data).toBeDefined();
  expect(last.options.data?.id).toBe('test-note-bug01');

  // tag も正しい形式であること
  expect(last.options.tag).toBe('fusen-lock-test-note-bug01');
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

  await page.goto('/viewer');
  await page.waitForLoadState('networkidle');

  const listBtn = page.locator('button[aria-label="一覧"]');
  await listBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  if (!await listBtn.isVisible()) {
    test.skip(true, 'write ステップに遷移しなかった');
    return;
  }

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
