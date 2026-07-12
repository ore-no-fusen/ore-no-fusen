/**
 * app/hooks/useStickyNoteContextMenu.ts のテストスタブ
 * Wave 0 で先行作成 — Wave 1 (Plan 03) 実装後に GREEN になること
 * 対象要件: SEND-02（右クリック「iPhoneに送る」から fusen_send_to_iphone を invoke する）
 */
import { describe, it, expect, vi } from 'vitest';
import { contextMenuTagItemId, filterAssignableTags, getOpenFolderRequest, getShortcutShelfMenuState } from './useStickyNoteContextMenu';

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

describe('contextMenuTagItemId', () => {
  it('uses stable ASCII ids instead of raw tag names', () => {
    const tags = ['仕事/重要', 'foo:bar', 'recipe', '空 白'];
    const ids = tags.map((_tag, index) => contextMenuTagItemId('tag', index));

    expect(ids).toEqual(['ctx_tag_0', 'ctx_tag_1', 'ctx_tag_2', 'ctx_tag_3']);
    expect(ids.join('|')).not.toContain('仕事');
    expect(ids.join('|')).not.toContain('foo:bar');
    expect(ids.join('|')).not.toContain('空 白');
  });

  it('keeps ids unique across tag menu groups', () => {
    expect(contextMenuTagItemId('tag', 0)).toBe('ctx_tag_0');
    expect(contextMenuTagItemId('tag_del', 0)).toBe('ctx_tag_del_0');
    expect(contextMenuTagItemId('archive_tag', 0)).toBe('ctx_archive_tag_0');
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

describe('getOpenFolderRequest', () => {
  it('selects the saved note in its containing folder', () => {
    expect(getOpenFolderRequest('C:\\notes\\note.md', 'C:\\notes')).toEqual({
      command: 'fusen_open_containing_folder',
      path: 'C:\\notes\\note.md',
    });
  });

  it('opens the base folder for an unsaved empty note', () => {
    expect(getOpenFolderRequest(undefined, 'C:\\notes')).toEqual({
      command: 'fusen_open_file',
      path: 'C:\\notes',
    });
  });

  it('returns no request when neither note nor base folder exists', () => {
    expect(getOpenFolderRequest(undefined, null)).toBeNull();
  });
});
