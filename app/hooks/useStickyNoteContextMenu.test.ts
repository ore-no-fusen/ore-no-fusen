/**
 * app/hooks/useStickyNoteContextMenu.ts のテストスタブ
 * Wave 0 で先行作成 — Wave 1 (Plan 03) 実装後に GREEN になること
 * 対象要件: SEND-02（右クリック「iPhoneに送る」から fusen_send_to_iphone を invoke する）
 */
import { describe, it, expect, vi } from 'vitest';

// Wave 1 で有効化される — Plan 03 完了まで TODO
// invoke のモック
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));


// Placeholder: vitest が 0 failures で終わるための空テスト
it('Wave 0 スタブが読み込める', () => {
  expect(true).toBe(true);
});
