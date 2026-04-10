import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openDraftsDB, saveDraft, loadDraft, loadAllDrafts, deleteDraft } from './indexeddb';

// DraftRecord 型（実装と一致させる）
interface DraftRecord {
  id: string;
  title: string;
  body: string;
  created_at: string;
  images: { fileName: string; blob: Blob }[];
  tags?: string[];
  received_pc?: true;
  sent_at?: string;
  locked?: true;
}

// IndexedDB モック
const mockGet = vi.fn();
const mockGetAll = vi.fn();
const mockPut = vi.fn();
const mockDelete = vi.fn();

const mockStore = {
  get: mockGet,
  getAll: mockGetAll,
  put: mockPut,
  delete: mockDelete,
};

const mockTransaction = {
  objectStore: vi.fn(() => mockStore),
  done: Promise.resolve(),
};

const mockDB = {
  transaction: vi.fn(() => mockTransaction),
};

vi.mock('./indexeddb', () => ({
  openDraftsDB: vi.fn(async () => mockDB),
  saveDraft: vi.fn(async (draft: DraftRecord) => {
    mockPut(draft);
  }),
  loadDraft: vi.fn(async (id: string) => {
    return mockGet(id);
  }),
  loadAllDrafts: vi.fn(async () => {
    return mockGetAll();
  }),
  deleteDraft: vi.fn(async (id: string) => {
    mockDelete(id);
  }),
}));

describe('IndexedDB — openDraftsDB', () => {
  it('openDraftsDB() を呼ぶと Promise が返ること', async () => {
    const db = await openDraftsDB();
    expect(db).toBeDefined();
  });
});

describe('IndexedDB — saveDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saveDraft(draft) で DraftRecord が DB に put されること', async () => {
    const draft: DraftRecord = {
      id: 'test-id-1',
      title: 'テストタイトル',
      body: 'テスト本文',
      created_at: new Date().toISOString(),
      images: [],
    };

    await saveDraft(draft);
    expect(mockPut).toHaveBeenCalledWith(draft);
  });
});

describe('IndexedDB — loadDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saveDraft 後に loadDraft(id) で同一レコードが返ること', async () => {
    const draft: DraftRecord = {
      id: 'test-id-2',
      title: '保存済みタイトル',
      body: '保存済み本文',
      created_at: new Date(1000000).toISOString(),
      images: [],
    };
    mockGet.mockReturnValue(draft);

    await saveDraft(draft);
    const result = await loadDraft('test-id-2');

    expect(mockGet).toHaveBeenCalledWith('test-id-2');
    expect(result).toEqual(draft);
  });

  it('存在しない id を指定すると null が返ること', async () => {
    mockGet.mockReturnValue(null);

    const result = await loadDraft('nonexistent-id');
    expect(result).toBeNull();
  });
});

describe('IndexedDB — loadAllDrafts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loadAllDrafts() が DraftRecord[] を返すこと', async () => {
    const drafts: DraftRecord[] = [
      { id: 'a', title: 'A', body: 'bodyA', created_at: new Date(1).toISOString(), images: [] },
      { id: 'b', title: 'B', body: 'bodyB', created_at: new Date(2).toISOString(), images: [] },
    ];
    mockGetAll.mockReturnValue(drafts);

    const result = await loadAllDrafts();
    expect(result).toEqual(drafts);
    expect(Array.isArray(result)).toBe(true);
  });
});

describe('IndexedDB — deleteDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deleteDraft(id) で削除後に loadDraft(id) が null を返すこと', async () => {
    mockGet.mockReturnValue(null);

    await deleteDraft('test-id-3');
    expect(mockDelete).toHaveBeenCalledWith('test-id-3');

    const result = await loadDraft('test-id-3');
    expect(result).toBeNull();
  });
});
