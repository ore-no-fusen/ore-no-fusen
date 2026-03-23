/**
 * Web Push ラッパー テストスキャフォールド (RED状態)
 *
 * Wave 2 で lib/webpush.ts を実装して GREEN にする。
 * API-04/06 のテスト契約を定義。
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

// web-push を完全モック
const mockSendNotification = vi.fn();
const mockSetVapidDetails = vi.fn();

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: mockSetVapidDetails,
    sendNotification: mockSendNotification,
  },
  setVapidDetails: mockSetVapidDetails,
  sendNotification: mockSendNotification,
}));

// lib/webpush.ts は Wave 2 で実装される（現時点では存在しない）
import { initVapid, sendNoteToIphone } from './webpush';

describe('webpush', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  describe('initVapid', () => {
    // API-04: VAPID_PUBLIC_KEY 未設定時にエラーをスロー
    it('VAPID_PUBLIC_KEY 未設定時に Error をスロー', () => {
      vi.stubEnv('VAPID_PUBLIC_KEY', '');
      vi.stubEnv('VAPID_PRIVATE_KEY', '');

      expect(() => initVapid()).toThrow();
    });

    // API-04: VAPID_PRIVATE_KEY 未設定時にもエラーをスロー
    it('VAPID_PRIVATE_KEY 未設定時に Error をスロー', () => {
      vi.stubEnv('VAPID_PUBLIC_KEY', 'fake-public-key');
      vi.stubEnv('VAPID_PRIVATE_KEY', '');

      expect(() => initVapid()).toThrow();
    });

    // VAPID 設定が正常な場合はエラーなし
    it('VAPID キーが設定済みの場合はエラーなし', () => {
      vi.stubEnv('VAPID_PUBLIC_KEY', 'BEl62iUYgUivxIkv69yViEuiBIa40MgMv0_HtYnG2PYs4wLVTWKG');
      vi.stubEnv('VAPID_PRIVATE_KEY', 'fake-private-key');
      vi.stubEnv('VAPID_SUBJECT', 'mailto:test@example.com');

      expect(() => initVapid()).not.toThrow();
      expect(mockSetVapidDetails).toHaveBeenCalled();
    });
  });

  describe('sendNoteToIphone', () => {
    // API-06: sendNoteToIphone がモック sendNotification を呼ぶ
    it('sendNoteToIphone がモック sendNotification を呼ぶ', async () => {
      vi.stubEnv('VAPID_PUBLIC_KEY', 'BEl62iUYgUivxIkv69yViEuiBIa40MgMv0_HtYnG2PYs4wLVTWKG');
      vi.stubEnv('VAPID_PRIVATE_KEY', 'fake-private-key');
      vi.stubEnv('VAPID_SUBJECT', 'mailto:test@example.com');

      mockSendNotification.mockResolvedValueOnce({ statusCode: 201 });

      const subscription = {
        endpoint: 'https://example.com/push/endpoint',
        keys: { p256dh: 'key1', auth: 'key2' },
      };
      const payload = { title: '付箋', body: 'テスト内容' };

      await sendNoteToIphone(subscription, payload);

      expect(mockSendNotification).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: subscription.endpoint }),
        expect.any(String)
      );
    });
  });
});
