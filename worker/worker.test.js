/**
 * worker/index.js のテストスタブ
 * Wave 0 で先行作成 — Wave 1 (Plan 01) 実装後に GREEN にすること
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import {
  closeClickedNotification,
  focusViewerOrOpenTarget,
} from './notification-click';

// Service Worker グローバルのモック
const mockRegistration = {
  showNotification: vi.fn().mockResolvedValue(undefined),
  getNotifications: vi.fn().mockResolvedValue([]),
};

const eventHandlers = new Map();

function createMemoryIndexedDB() {
  const databases = new Map();

  return {
    __databases: databases,
    open(name) {
      const request = {};
      queueMicrotask(() => {
        const isNew = !databases.has(name);
        const stores = databases.get(name) ?? new Map();
        databases.set(name, stores);

        const db = {
          createObjectStore(storeName) {
            if (!stores.has(storeName)) stores.set(storeName, new Map());
            return {};
          },
          transaction(storeName) {
            const transaction = {
              objectStore() {
                const store = stores.get(storeName) ?? new Map();
                stores.set(storeName, store);
                return {
                  get(key) {
                    const getRequest = {};
                    queueMicrotask(() => {
                      getRequest.result = store.get(key);
                      getRequest.onsuccess?.();
                    });
                    return getRequest;
                  },
                  put(value, key) {
                    store.set(key, value);
                  },
                  add(value) {
                    store.set(store.size, value);
                  },
                };
              },
            };
            setTimeout(() => transaction.oncomplete?.(), 0);
            return transaction;
          },
        };

        request.result = db;
        if (isNew) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  };
}

beforeAll(async () => {
  global.self = {
    registration: mockRegistration,
    location: { origin: 'https://example.com' },
    navigator: { language: 'ja-JP' },
    skipWaiting: vi.fn(),
    addEventListener: vi.fn((type, handler) => eventHandlers.set(type, handler)),
  };
  global.indexedDB = createMemoryIndexedDB();
  global.clients = {
    claim: vi.fn().mockResolvedValue(undefined),
    matchAll: vi.fn().mockResolvedValue([]),
    openWindow: vi.fn().mockResolvedValue(undefined),
  };

  await import('./index');
});

beforeEach(() => {
  mockRegistration.showNotification.mockClear();
  mockRegistration.getNotifications.mockClear();
});

describe('Service Worker — push handler', () => {
  it('push イベント受信時に showNotification が呼ばれる', async () => {
    let flow;
    eventHandlers.get('push')({
      data: {
        json: () => ({ id: 'note-1', title: '通知タイトル', body: '本文' }),
      },
      waitUntil: promise => { flow = promise; },
    });

    await flow;

    expect(mockRegistration.showNotification).toHaveBeenCalledWith(
      '通知タイトル',
      expect.objectContaining({
        body: '本文',
        tag: 'fusen-note-1',
        data: { id: 'note-1', title: '通知タイトル', body: '本文' },
      }),
    );
  });

  it('push data が空の場合でもデフォルトタイトルで showNotification が呼ばれる', async () => {
    let flow;
    eventHandlers.get('push')({
      data: null,
      waitUntil: promise => { flow = promise; },
    });

    await flow;

    expect(mockRegistration.showNotification).toHaveBeenCalledWith(
      '俺の付箋',
      expect.objectContaining({
        body: '',
        tag: 'fusen-unknown',
        data: { id: 'unknown', title: '俺の付箋', body: '' },
      }),
    );
  });

  it('R11: 画像取得に失敗しても本文を端末保存し、通知を表示する', async () => {
    const databases = global.indexedDB.__databases;
    const meta = databases.get('fusen-meta') ?? new Map();
    databases.set('fusen-meta', meta);
    const metaStore = meta.get('meta') ?? new Map();
    meta.set('meta', metaStore);
    metaStore.set('access_token', 'token');

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ files: [{ id: 'folder-id' }] }) })
      .mockRejectedValueOnce(new Error('image download failed'));
    let flow;
    eventHandlers.get('push')({
      data: {
        json: () => ({
          id: 'image-fallback-note', title: '本文を残す',
          body_rich: '本文 ![画像](fusen_img_missing.jpg)', body: '本文',
        }),
      },
      waitUntil: promise => { flow = promise; },
    });

    await flow;

    const drafts = databases.get('fusen-drafts').get('drafts');
    expect(drafts.get('image-fallback-note')).toMatchObject({
      body: '本文 ![画像](fusen_img_missing.jpg)', images: [], received_pc: true,
    });
    expect(mockRegistration.showNotification).toHaveBeenCalledWith(
      '本文を残す', expect.objectContaining({ tag: 'fusen-image-fallback-note' }),
    );
  });

  it('4KB超過のコンパクトPushはDriveから長文を取得して保存する', async () => {
    const databases = global.indexedDB.__databases;
    const meta = databases.get('fusen-meta') ?? new Map();
    databases.set('fusen-meta', meta);
    const metaStore = meta.get('meta') ?? new Map();
    meta.set('meta', metaStore);
    metaStore.set('access_token', 'token');
    const longBody = '長文'.repeat(700);

    global.fetch = vi.fn((url, options = {}) => {
      if (options.method === 'DELETE' || options.method === 'PATCH') {
        return Promise.resolve({ json: async () => ({}) });
      }
      if (url.includes("name='ore-no-fusen'")) {
        return Promise.resolve({ json: async () => ({ files: [{ id: 'folder-id' }] }) });
      }
      if (url.includes("name='notes_to_iphone.json'")) {
        return Promise.resolve({ json: async () => ({ files: [{ id: 'queue-id' }] }) });
      }
      if (url.includes('/queue-id?alt=media')) {
        return Promise.resolve({
          json: async () => ({
            items: [{ id: 'long-note', title: '長文テスト', body: longBody }],
          }),
        });
      }
      return Promise.resolve({ json: async () => ({}) });
    });

    let flow;
    eventHandlers.get('push')({
      data: {
        json: () => ({
          id: 'long-note',
          title: '長文テスト',
          body: '',
          fetch_from_drive: true,
        }),
      },
      waitUntil: promise => { flow = promise; },
    });

    await flow;

    const drafts = databases.get('fusen-drafts').get('drafts');
    expect(drafts.get('long-note')).toMatchObject({
      title: '長文テスト',
      body: longBody,
      received_pc: true,
    });
    expect(mockRegistration.showNotification).toHaveBeenCalledWith(
      '長文テスト',
      expect.objectContaining({ body: longBody, tag: 'fusen-long-note' }),
    );
  });
});

describe('Service Worker — notificationclick handler', () => {
  it('notificationclick で notification.close() が呼ばれる', () => {
    const notification = {
      data: { id: 'note-1' },
      close: vi.fn(),
    };

    expect(closeClickedNotification(notification)).toEqual({ id: 'note-1' });
    expect(notification.close).toHaveBeenCalledOnce();
  });

  it('既存 /viewer クライアントへ通知IDを送り focus() する', async () => {
    const viewer = {
      url: 'https://example.com/viewer',
      postMessage: vi.fn(),
      focus: vi.fn().mockResolvedValue(undefined),
    };
    const openWindow = vi.fn();

    await focusViewerOrOpenTarget({
      clientList: [viewer],
      id: 'note-2',
      origin: 'https://example.com',
      openWindow,
    });

    expect(viewer.postMessage).toHaveBeenCalledWith({ type: 'OPEN_NOTE', id: 'note-2' });
    expect(viewer.focus).toHaveBeenCalledOnce();
    expect(openWindow).not.toHaveBeenCalled();
  });

  it('既存クライアントがなければ通知ID付き絶対URLを開く', async () => {
    const openWindow = vi.fn().mockResolvedValue(undefined);

    await focusViewerOrOpenTarget({
      clientList: [],
      id: 'note / 日本語',
      origin: 'https://example.com',
      openWindow,
    });

    expect(openWindow).toHaveBeenCalledWith(
      'https://example.com/viewer?note=note%20%2F%20%E6%97%A5%E6%9C%AC%E8%AA%9E',
    );
  });
});
