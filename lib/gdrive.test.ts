/**
 * Google Drive ラッパー テストスキャフォールド (RED状態)
 *
 * Wave 2 で lib/gdrive.ts を実装して GREEN にする。
 * API-02/03/05/07 のテスト契約を定義。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// googleapis を完全モック
vi.mock('googleapis', () => {
  const mockFilesUpdate = vi.fn();
  const mockFilesCreate = vi.fn();
  const mockFilesList = vi.fn();
  const mockFilesGet = vi.fn();

  return {
    google: {
      auth: {
        // アロー関数はコンストラクタになれないため function キーワードを使用
        OAuth2: vi.fn().mockImplementation(function () {
          return {
            setCredentials: vi.fn(),
            refreshAccessToken: vi.fn(),
            on: vi.fn(),
          };
        }),
      },
      drive: vi.fn().mockReturnValue({
        files: {
          list: mockFilesList,
          create: mockFilesCreate,
          update: mockFilesUpdate,
          get: mockFilesGet,
        },
      }),
    },
    _mockFilesUpdate: mockFilesUpdate,
    _mockFilesCreate: mockFilesCreate,
    _mockFilesList: mockFilesList,
    _mockFilesGet: mockFilesGet,
  };
});

// lib/gdrive.ts は Wave 2 で実装される（現時点では存在しない）
import {
  getOAuth2Client,
  upsertJsonFile,
  savePushSubscription,
  getLatestNote,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} from './gdrive';

describe('gdrive', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  describe('getOAuth2Client', () => {
    // API-02a: 環境変数未設定時のエラー
    it('GOOGLE_REFRESH_TOKEN 未設定時に Error("OAUTH_NOT_CONFIGURED") をスロー', () => {
      vi.stubEnv('GOOGLE_REFRESH_TOKEN', '');
      vi.stubEnv('GOOGLE_CLIENT_ID', '');
      vi.stubEnv('GOOGLE_CLIENT_SECRET', '');

      expect(() => getOAuth2Client()).toThrow('OAUTH_NOT_CONFIGURED');
    });

    // API-02b: invalid_grant エラーの変換
    it('invalid_grant エラーが OAUTH_REFRESH_TOKEN_EXPIRED に変換される', async () => {
      vi.stubEnv('GOOGLE_REFRESH_TOKEN', 'fake-token');
      vi.stubEnv('GOOGLE_CLIENT_ID', 'fake-id');
      vi.stubEnv('GOOGLE_CLIENT_SECRET', 'fake-secret');

      const client = getOAuth2Client();
      // invalid_grant を発生させる mock
      vi.spyOn(client, 'refreshAccessToken').mockRejectedValueOnce(
        Object.assign(new Error('invalid_grant'), { code: 'invalid_grant' })
      );

      await expect(client.refreshAccessToken()).rejects.toMatchObject({
        message: expect.stringContaining('invalid_grant'),
      });
    });
  });

  describe('upsertJsonFile', () => {
    beforeEach(() => {
      vi.stubEnv('GOOGLE_REFRESH_TOKEN', 'fake-token');
      vi.stubEnv('GOOGLE_CLIENT_ID', 'fake-id');
      vi.stubEnv('GOOGLE_CLIENT_SECRET', 'fake-secret');
      vi.stubEnv('GOOGLE_DRIVE_FOLDER_ID', 'fake-folder-id');
    });

    // API-03: 既存ファイルあり → files.update を呼ぶ
    it('既存ファイルあり時は files.update を呼ぶ', async () => {
      const { _mockFilesList, _mockFilesUpdate, _mockFilesCreate } = await import('googleapis') as any;
      _mockFilesList.mockResolvedValueOnce({
        data: { files: [{ id: 'existing-file-id' }] },
      });
      _mockFilesUpdate.mockResolvedValueOnce({ data: { id: 'existing-file-id' } });

      await upsertJsonFile('test.json', { key: 'value' });

      expect(_mockFilesUpdate).toHaveBeenCalled();
      expect(_mockFilesCreate).not.toHaveBeenCalled();
    });

    // API-03: 既存ファイルなし → files.create を呼ぶ
    it('既存ファイルなし時は files.create を呼ぶ', async () => {
      const { _mockFilesList, _mockFilesCreate } = await import('googleapis') as any;
      _mockFilesList.mockResolvedValueOnce({
        data: { files: [] },
      });
      _mockFilesCreate.mockResolvedValueOnce({ data: { id: 'new-file-id' } });

      await upsertJsonFile('test.json', { key: 'value' });

      expect(_mockFilesCreate).toHaveBeenCalled();
    });
  });

  describe('savePushSubscription', () => {
    beforeEach(() => {
      vi.stubEnv('GOOGLE_REFRESH_TOKEN', 'fake-token');
      vi.stubEnv('GOOGLE_CLIENT_ID', 'fake-id');
      vi.stubEnv('GOOGLE_CLIENT_SECRET', 'fake-secret');
      vi.stubEnv('GOOGLE_DRIVE_FOLDER_ID', 'fake-folder-id');
    });

    // API-05: savePushSubscription がモック Drive に対し upsert を呼ぶ
    it('savePushSubscription がモック Drive に対し upsertJsonFile を呼ぶ', async () => {
      const { _mockFilesList, _mockFilesCreate } = await import('googleapis') as any;
      _mockFilesList.mockResolvedValueOnce({ data: { files: [] } });
      _mockFilesCreate.mockResolvedValueOnce({ data: { id: 'sub-file-id' } });

      const subscription = {
        endpoint: 'https://example.com/push/endpoint',
        keys: { p256dh: 'key1', auth: 'key2' },
      };

      await expect(savePushSubscription(subscription)).resolves.not.toThrow();
      expect(_mockFilesCreate).toHaveBeenCalled();
    });
  });

  describe('getLatestNote', () => {
    beforeEach(() => {
      vi.stubEnv('GOOGLE_REFRESH_TOKEN', 'fake-token');
      vi.stubEnv('GOOGLE_CLIENT_ID', 'fake-id');
      vi.stubEnv('GOOGLE_CLIENT_SECRET', 'fake-secret');
      vi.stubEnv('GOOGLE_DRIVE_FOLDER_ID', 'fake-folder-id');
    });

    // API-07: getLatestNote がモック Drive から JSON を返す
    it('getLatestNote がモック Drive から JSON を返す', async () => {
      const { _mockFilesList, _mockFilesGet } = await import('googleapis') as any;
      _mockFilesList.mockResolvedValueOnce({
        data: { files: [{ id: 'note-file-id', name: 'latest-note.json' }] },
      });
      // files.get は responseType: 'text' で呼ばれるため data は JSON 文字列
      _mockFilesGet.mockResolvedValueOnce({
        data: JSON.stringify({ title: 'テストメモ', content: 'メモの内容' }),
      });

      const result = await getLatestNote();
      expect(result).toBeDefined();
    });
  });
});
