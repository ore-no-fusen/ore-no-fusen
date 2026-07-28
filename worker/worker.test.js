/**
 * worker/index.js のテストスタブ
 * Wave 0 で先行作成 — Wave 1 (Plan 01) 実装後に GREEN にすること
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  closeClickedNotification,
  focusViewerOrOpenTarget,
} from './notification-click';

// Service Worker グローバルのモック
const mockRegistration = {
  showNotification: vi.fn().mockResolvedValue(undefined),
};

beforeEach(() => {
  global.self = {
    registration: mockRegistration,
    location: { origin: 'https://example.com' },
    addEventListener: vi.fn(),
  };
  mockRegistration.showNotification.mockClear();
});

describe('Service Worker — push handler', () => {
  it.todo('push イベント受信時に showNotification が呼ばれる');
  it.todo('push data が空の場合でもデフォルトタイトルで showNotification が呼ばれる');
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

// Placeholder: vitest が 0 failures で終わるための空テスト
it('Wave 0 スタブが読み込める', () => {
  expect(true).toBe(true);
});
