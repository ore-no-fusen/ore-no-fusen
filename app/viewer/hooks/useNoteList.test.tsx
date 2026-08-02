import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DraftRecord } from '../types';
import { useNoteList } from './useNoteList';

const mocks = vi.hoisted(() => ({
  loadAllDrafts: vi.fn(),
  loadDeletedDraftIds: vi.fn(),
  saveDraft: vi.fn(),
  downloadWithAutoRefresh: vi.fn(),
  downloadBinaryWithAutoRefresh: vi.fn(),
  deleteFileFromDrive: vi.fn(),
  removeNotesFromIphoneQueue: vi.fn(),
}));

vi.mock('../lib/indexeddb', () => ({
  loadAllDrafts: mocks.loadAllDrafts,
  loadDeletedDraftIds: mocks.loadDeletedDraftIds,
  saveDraft: mocks.saveDraft,
}));

vi.mock('../lib/drive', () => ({
  downloadWithAutoRefresh: mocks.downloadWithAutoRefresh,
  uploadWithAutoRefresh: vi.fn(),
  downloadBinaryWithAutoRefresh: mocks.downloadBinaryWithAutoRefresh,
  deleteFileFromDrive: mocks.deleteFileFromDrive,
  removeNotesFromIphoneQueue: mocks.removeNotesFromIphoneQueue,
}));

describe('useNoteList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadDeletedDraftIds.mockResolvedValue([]);
    mocks.deleteFileFromDrive.mockResolvedValue(undefined);
    mocks.removeNotesFromIphoneQueue.mockResolvedValue(undefined);
  });

  it('Driveの応答前にIndexedDBの一覧を表示してローディングを解除する', async () => {
    const localDraft: DraftRecord = {
      id: 'local-1',
      title: 'ローカルメモ',
      body: '本文',
      created_at: '2026-07-27T00:00:00+09:00',
      images: [],
    };
    let resolveDrive!: (value: { items: unknown[] }) => void;
    const drivePromise = new Promise<{ items: unknown[] }>((resolve) => {
      resolveDrive = resolve;
    });
    mocks.loadAllDrafts.mockResolvedValue([localDraft]);
    mocks.downloadWithAutoRefresh.mockReturnValue(drivePromise);

    const setHistoryNotes = vi.fn();
    const setIsHistoryLoading = vi.fn();
    const setThumbnailUrls = vi.fn();
    const initLockedNoteIds = vi.fn();

    const { unmount } = renderHook(() => useNoteList({
      step: 'list',
      accessToken: 'token',
      setHistoryNotes,
      setIsHistoryLoading,
      setThumbnailUrls,
      initLockedNoteIds,
    }));

    await waitFor(() => {
      expect(setHistoryNotes).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'local-1', title: 'ローカルメモ' }),
      ]);
      expect(setIsHistoryLoading).toHaveBeenCalledWith(false);
    });

    await act(async () => {
      resolveDrive({ items: [] });
      await drivePromise;
    });
    unmount();
  });

  it('削除済みIDをDriveから再取込せず、未処理キューから除去する', async () => {
    mocks.loadAllDrafts.mockResolvedValue([]);
    mocks.loadDeletedDraftIds.mockResolvedValue(['deleted-1']);
    mocks.downloadWithAutoRefresh.mockResolvedValue({
      items: [
        { id: 'deleted-1', title: '削除済み', body: '復活させない' },
        { id: 'active-1', title: '新着', body: '残す' },
      ],
    });
    mocks.saveDraft.mockResolvedValue(undefined);

    const setHistoryNotes = vi.fn();
    const { unmount } = renderHook(() => useNoteList({
      step: 'list',
      accessToken: 'token',
      setHistoryNotes,
      setIsHistoryLoading: vi.fn(),
      setThumbnailUrls: vi.fn(),
      initLockedNoteIds: vi.fn(),
    }));

    await waitFor(() => {
      expect(mocks.removeNotesFromIphoneQueue).toHaveBeenCalledWith('token', ['deleted-1']);
      expect(mocks.saveDraft).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'active-1' })
      );
    });
    expect(mocks.saveDraft).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: 'deleted-1' })
    );
    expect(setHistoryNotes).not.toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'deleted-1' })])
    );
    unmount();
  });
});
