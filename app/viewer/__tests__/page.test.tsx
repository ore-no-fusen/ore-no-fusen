/**
 * Phase 09 — IPHONE-MGT-01〜04 テストスタブ
 * 実装完了後に TODO を実際のアサーションに置き換える
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hydrateEditor, serializeEditor, loadKnownTags, mergeKnownTags, extractTitleBody } from '../editor-helpers';

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


describe('REQ-IMG-HYDRATE: hydrateEditor 画像変換', () => {
  it('blobMap にあるファイル名は blob URL の img になる', () => {
    const el = document.createElement('div');
    const blob = new Blob(['dummy'], { type: 'image/jpeg' });
    hydrateEditorForTest(el, '![](photo.jpg)', new Map([['photo.jpg', blob as File]]));
    const img = el.querySelector('img') as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.src).toMatch(/^blob:/);
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


describe('REQ-IMG-SERIALIZE: hydrateEditor → serializeEditor ラウンドトリップ', () => {
  it('blobMap 画像: hydrate → serialize でファイル名が保持される', () => {
    const el = document.createElement('div');
    const blob = new Blob(['dummy'], { type: 'image/jpeg' });
    hydrateEditorForTest(el, '![](photo.jpg)', new Map([['photo.jpg', blob as File]]));
    const result = serializeEditorForTest(el);
    expect(result).toBe('![](photo.jpg)');
  });

  it('data: URI 画像: hydrate → serialize で data URI が保持される（編集保存時に消えない）', () => {
    const el = document.createElement('div');
    hydrateEditorForTest(el, '![](data:image/jpeg;base64,abc123)', new Map());
    const result = serializeEditorForTest(el);
    expect(result).toContain('data:image/jpeg;base64,abc123');
  });

  it('alt text あり data: URI 画像: hydrate → serialize で data URI が保持される', () => {
    const el = document.createElement('div');
    hydrateEditorForTest(el, '![image|0.1](data:image/png;base64,abc123)', new Map());
    const result = serializeEditorForTest(el);
    expect(result).toContain('data:image/png;base64,abc123');
  });
});

describe('REQ-MERMAID-HYDRATE: mermaid ブロック変換', () => {
  it('```mermaid ブロックを data-mermaid-code 属性付き div に変換する', () => {
    const el = document.createElement('div');
    hydrateEditorForTest(el, '```mermaid\ngraph TD\nA --> B\n```', new Map());
    const div = el.querySelector('[data-mermaid-code]');
    expect(div).not.toBeNull();
    expect(div!.getAttribute('data-mermaid-code')).toBe('graph TD\nA --> B');
  });

  it('mermaid ブロック: hydrate → serialize でコードが保持される', () => {
    const el = document.createElement('div');
    hydrateEditorForTest(el, '```mermaid\ngraph TD\nA --> B\n```', new Map());
    const result = serializeEditorForTest(el);
    expect(result).toContain('```mermaid');
    expect(result).toContain('graph TD\nA --> B');
    expect(result).toContain('```');
  });
});

describe('REQ-EXTRACT-TITLE: extractTitleBody', () => {
  it('# プレフィックスありの1行目をタイトルとして分離する', () => {
    const { title, body } = extractTitleBody('# タイトル\n本文');
    expect(title).toBe('タイトル');
    expect(body).toBe('本文');
  });

  it('# プレフィックスなしの1行目もタイトルになる', () => {
    const { title, body } = extractTitleBody('タイトル\n本文');
    expect(title).toBe('タイトル');
    expect(body).toBe('本文');
  });

  it('1行だけのとき body は空文字', () => {
    const { title, body } = extractTitleBody('# タイトルのみ');
    expect(title).toBe('タイトルのみ');
    expect(body).toBe('');
  });

  it('空文字のとき title も body も空文字', () => {
    const { title, body } = extractTitleBody('');
    expect(title).toBe('');
    expect(body).toBe('');
  });

  it('タイトルと本文の間の空行は body に含まれない', () => {
    const { title, body } = extractTitleBody('# タイトル\n\n本文');
    expect(title).toBe('タイトル');
    expect(body).toBe('本文');
  });
});
