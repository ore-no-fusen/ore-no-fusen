/**
 * worker/index.js のテストスタブ
 * Wave 0 で先行作成 — Wave 1 (Plan 01) 実装後に GREEN にすること
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  it.todo('notificationclick で notification.close() が呼ばれる');
  it.todo('既存 /viewer クライアントがあれば focus() する');
  it.todo('既存クライアントがなければ clients.openWindow() で絶対URLを開く');
});

// Placeholder: vitest が 0 failures で終わるための空テスト
it('Wave 0 スタブが読み込める', () => {
  expect(true).toBe(true);
});
