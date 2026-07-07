/**
 * app/hooks/useStickyNoteContextMenu.ts のテストスタブ
 * Wave 0 で先行作成 — Wave 1 (Plan 03) 実装後に GREEN になること
 * 対象要件: SEND-02（右クリック「iPhoneに送る」から fusen_send_to_iphone を invoke する）
 */
import { describe, it, expect, vi } from 'vitest';
import { filterAssignableTags, getShortcutShelfMenuState } from './useStickyNoteContextMenu';

// Wave 1 で有効化される — Plan 03 完了まで TODO
// invoke のモック
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));


// Placeholder: vitest が 0 failures で終わるための空テスト
it('Wave 0 スタブが読み込める', () => {
  expect(true).toBe(true);
});

describe('filterAssignableTags', () => {
  it('hides reserved tags from the add-tag context submenu', () => {
    expect(filterAssignableTags(['project', 'recipe', 'QA', 'shortcut', 'memo'])).toEqual(['project', 'memo']);
  });

  it('keeps non-reserved tags visible', () => {
    expect(filterAssignableTags(['recipes', 'my-qa', 'term-note'])).toEqual(['recipes', 'my-qa', 'term-note']);
  });
});

describe('getShortcutShelfMenuState', () => {
  it('hides the shortcut shelf item for recipe notes', () => {
    expect(getShortcutShelfMenuState(['project', 'recipe'])).toEqual({
      visible: false,
      isRegistered: false,
      label: null,
    });
  });

  it('shows register label when shortcut tag is absent', () => {
    expect(getShortcutShelfMenuState(['project'])).toEqual({
      visible: true,
      isRegistered: false,
      label: '📌 お気に入りに登録',
    });
  });

  it('shows unregister label when shortcut tag is present', () => {
    expect(getShortcutShelfMenuState(['project', 'SHORTCUT'])).toEqual({
      visible: true,
      isRegistered: true,
      label: '📌 お気に入りを解除',
    });
  });
});
