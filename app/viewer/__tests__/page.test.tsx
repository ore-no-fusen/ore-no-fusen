/**
 * Phase 09 — IPHONE-MGT-01〜04 テストスタブ
 * 実装完了後に TODO を実際のアサーションに置き換える
 */
import { describe, it, vi } from 'vitest';

// IndexedDB モック（vitest の IDBFactory をスタブ化）
const mockPut = vi.fn().mockResolvedValue(undefined);
const mockGet = vi.fn().mockResolvedValue(undefined);
const mockDelete = vi.fn().mockResolvedValue(undefined);
const mockGetAll = vi.fn().mockResolvedValue([]);

// idb モック（IndexedDB wrapper）
vi.mock('idb', () => ({
  openDB: vi.fn().mockResolvedValue({
    put: mockPut,
    get: mockGet,
    delete: mockDelete,
    getAll: mockGetAll,
  }),
}));

describe('IPHONE-MGT-01: pendingHydrate バグ修正', () => {
  it.todo('list の li onClick が setPendingHydrate を呼び、editorRef.current に依存しない');
  it.todo('pendingHydrate が非 null のとき useEffect が 50ms 後に hydrateEditor を呼ぶ');
  it.todo('pendingHydrate が null のとき useEffect は何もしない');
});

describe('IPHONE-MGT-02: 保存フロー（上書き vs 新規）', () => {
  it.todo('currentDraftId が存在する場合、同じ ID で saveDraft が呼ばれる（上書き）');
  it.todo('currentDraftId が null の場合、新しい UUID で saveDraft が呼ばれる（新規）');
});

describe('IPHONE-MGT-03: 一覧 ＋ボタン', () => {
  it.todo('＋ボタンクリック後、setPendingHydrate({ markdown: "", draftId: null }) が呼ばれる');
  it.todo('＋ボタンクリック後、write 画面がエディタ空状態で開く（前のノートの内容が残らない）');
});

describe('IPHONE-MGT-04: 下書き削除', () => {
  it.todo('削除ボタンクリックで deleteDraft(note.id) が呼ばれる');
  it.todo('削除後に loadAllDrafts() が呼ばれて historyNotes が更新される');
  it.todo('削除ボタンクリックで li の onClick（編集遷移）が発火しない（stopPropagation）');
});
