/**
 * Phase 09 — IPHONE-MGT-01〜04 テストスタブ
 * 実装完了後に TODO を実際のアサーションに置き換える
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hydrateEditor, serializeEditor, loadKnownTags, mergeKnownTags } from '../editor-helpers';

// テスト用ラッパー（export された関数を直接使用）
function hydrateEditorForTest(el: HTMLDivElement, markdown: string, blobMap: Map<string, File>) {
  return hydrateEditor(el, markdown, blobMap);
}
function serializeEditorForTest(el: HTMLDivElement): string {
  return serializeEditor(el);
}

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

describe('REQ-CB-LINE: チェックボックス行頭挿入', () => {
  it.todo('行頭挿入: insertCheckboxAtLineStart が editorRef 直下の先頭ノードに - [ ]  を挿入する');
});

describe('REQ-IMG-HYDRATE: hydrateEditor 画像変換', () => {
  it('blobMap にあるファイル名は blob URL の img になる', () => {
    const el = document.createElement('div');
    const blob = new Blob(['dummy'], { type: 'image/jpeg' });
    hydrateEditorForTest(el, '![](photo.jpg)', new Map([['photo.jpg', blob as File]]));
    const img = el.querySelector('img') as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.src).toMatch(/^blob:/);
  });

  it('data: URI はそのまま img.src になる（PC→iPhone送信）', () => {
    const el = document.createElement('div');
    hydrateEditorForTest(el, '![](data:image/jpeg;base64,abc123)', new Map());
    const img = el.querySelector('img') as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.src).toContain('data:image/jpeg');
  });

  it('blobMap にもない通常パスはテキストのまま残る', () => {
    const el = document.createElement('div');
    hydrateEditorForTest(el, '![](assets/photo.jpg)', new Map());
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('![](assets/photo.jpg)');
  });
});

describe('REQ-CB-HYDRATE: hydrateEditor チェックボックス変換', () => {
  it('- [ ] text を data-checkbox-line span + unchecked input に変換する', () => {
    const el = document.createElement('div');
    hydrateEditorForTest(el, '- [ ] やること', new Map());
    const cb = el.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(cb).not.toBeNull();
    expect(cb.checked).toBe(false);
    expect(el.querySelector('[data-checkbox-line]')).not.toBeNull();
  });
  it('- [x] text を data-checkbox-line span + checked input に変換する', () => {
    const el = document.createElement('div');
    hydrateEditorForTest(el, '- [x] 完了', new Map());
    const cb = el.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(cb).not.toBeNull();
    expect(cb.checked).toBe(true);
  });
});

describe('REQ-CB-SERIALIZE: serializeEditor チェックボックス逆変換', () => {
  it('unchecked input を - [ ] text に逆変換する', () => {
    const el = document.createElement('div');
    hydrateEditorForTest(el, '- [ ] やること', new Map());
    const result = serializeEditorForTest(el);
    expect(result).toBe('- [ ] やること');
  });
  it('checked input を - [x] text に逆変換する', () => {
    const el = document.createElement('div');
    hydrateEditorForTest(el, '- [ ] やること', new Map());
    const cb = el.querySelector('input[type="checkbox"]') as HTMLInputElement;
    cb.checked = true;
    const result = serializeEditorForTest(el);
    expect(result).toBe('- [x] やること');
  });
});

describe('REQ-CB-TOGGLE: チェックボックストグル', () => {
  it.todo('iOS Safari での click イベントで checked 状態が変わる（実機確認）');
});

describe('REQ-TAG-PERSIST: タグ永続化', () => {
  beforeEach(() => localStorage.clear());

  it('loadKnownTags は空のとき [] を返す', () => {
    expect(loadKnownTags()).toEqual([]);
  });
  it('loadKnownTags は保存済みタグを返す', () => {
    localStorage.setItem('fusen_known_tags', JSON.stringify(['仕事', '買い物']));
    expect(loadKnownTags()).toEqual(['仕事', '買い物']);
  });
  it('mergeKnownTags は重複なくマージする', () => {
    localStorage.setItem('fusen_known_tags', JSON.stringify(['仕事']));
    mergeKnownTags(['仕事', '買い物']);
    expect(loadKnownTags()).toEqual(['仕事', '買い物']);
  });
  it('mergeKnownTags は空配列でも既存タグを保持する', () => {
    localStorage.setItem('fusen_known_tags', JSON.stringify(['仕事']));
    mergeKnownTags([]);
    expect(loadKnownTags()).toEqual(['仕事']);
  });
});

describe('REQ-TAG-SUGGEST: タグサジェスト', () => {
  it.todo('tagInput が空のとき全 knownTags（最大10件）が候補として表示される');
  it.todo('tagInput に入力すると knownTags の includes フィルタリング結果が表示される');
  it.todo('候補タグをタップすると writeTags に追加され tagInput がクリアされる');
});
