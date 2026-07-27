import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DraftRecord } from '../types';
import { useNoteList } from './useNoteList';

const mocks = vi.hoisted(() => ({
  loadAllDrafts: vi.fn(),
  saveDraft: vi.fn(),
  downloadWithAutoRefresh: vi.fn(),
  downloadBinaryWithAutoRefresh: vi.fn(),
  deleteFileFromDrive: vi.fn(),
}));

vi.mock('../lib/indexeddb', () => ({
  loadAllDrafts: mocks.loadAllDrafts,
  saveDraft: mocks.saveDraft,
}));

vi.mock('../lib/drive', () => ({
  downloadWithAutoRefresh: mocks.downloadWithAutoRefresh,
  uploadWithAutoRefresh: vi.fn(),
  downloadBinaryWithAutoRefresh: mocks.downloadBinaryWithAutoRefresh,
  deleteFileFromDrive: mocks.deleteFileFromDrive,
}));

describe('useNoteList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
