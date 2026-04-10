import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getAppFolderId, uploadToDrive, downloadFromDrive, uploadWithAutoRefresh, resetCachedFolderId } from './drive';

// fetch モックのセットアップ
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const TEST_TOKEN = 'test-access-token';
const TEST_FOLDER_ID = 'folder-id-123';
const TEST_FILE_ID = 'file-id-456';

describe('Drive API — getAppFolderId', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    resetCachedFolderId(); // モジュールスコープのキャッシュをリセット
  });

  it('getAppFolderId が Drive API の files.list を呼ぶこと', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ files: [{ id: TEST_FOLDER_ID }] }),
    });

    const result = await getAppFolderId(TEST_TOKEN);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('googleapis.com/drive');
    expect(result).toBe(TEST_FOLDER_ID);
  });

  it('フォルダ未存在時に files.create を呼ぶこと', async () => {
    // 1回目: files.list — フォルダなし
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ files: [] }),
    });
    // 2回目: files.create — 新規フォルダ作成
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: TEST_FOLDER_ID }),
    });

    const result = await getAppFolderId(TEST_TOKEN);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [createUrl] = mockFetch.mock.calls[1];
    expect(createUrl).toContain('googleapis.com/drive');
    expect(result).toBe(TEST_FOLDER_ID);
  });
});

describe('Drive API — uploadToDrive', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    resetCachedFolderId();
  });

  it('uploadToDrive が multipart アップロードリクエストを送ること', async () => {
    // getAppFolderId: フォルダ検索
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ files: [{ id: TEST_FOLDER_ID }] }),
    });
    // uploadToDrive: ファイル名検索（未存在）
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ files: [] }),
    });
    // uploadToDrive: ファイル作成
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: TEST_FILE_ID }),
    });

    await uploadToDrive(TEST_TOKEN, 'test-file.json', { key: 'value' });

    // 3回の fetch が呼ばれること
    expect(mockFetch).toHaveBeenCalledTimes(3);
    // 最後の呼び出し（アップロード）が multipart であること
    const [uploadUrl] = mockFetch.mock.calls[2];
    expect(uploadUrl).toContain('uploadType=multipart');
  });
});

describe('Drive API — downloadFromDrive', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    resetCachedFolderId();
  });

  it('downloadFromDrive が正しいファイルを検索して取得すること', async () => {
    const expectedContent = { title: 'test', body: 'content' };
    // フォルダ検索
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ files: [{ id: TEST_FOLDER_ID }] }),
    });
    // ファイル検索
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ files: [{ id: TEST_FILE_ID }] }),
    });
    // ファイルダウンロード
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => expectedContent,
    });

    const result = await downloadFromDrive(TEST_TOKEN, 'notes_to_iphone.json');

    expect(mockFetch).toHaveBeenCalledTimes(3);
    const [downloadUrl] = mockFetch.mock.calls[2];
    expect(downloadUrl).toContain(TEST_FILE_ID);
    expect(result).toEqual(expectedContent);
  });
});

describe('Drive API — uploadWithAutoRefresh', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    resetCachedFolderId();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uploadWithAutoRefresh が成功した場合はそのまま完了すること', async () => {
    // getAppFolderId
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ files: [{ id: TEST_FOLDER_ID }] }),
    });
    // ファイル検索（未存在）
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ files: [] }),
    });
    // ファイル作成
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: TEST_FILE_ID }),
    });

    await expect(
      uploadWithAutoRefresh(TEST_TOKEN, 'test.json', { data: 'value' })
    ).resolves.not.toThrow();
  });
});
