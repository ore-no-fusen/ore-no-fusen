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

  it('PC送信の元付箋IDをIndexedDBに残し、同じ本文の既存ノートにも補完する', async () => {
    mocks.loadAllDrafts.mockResolvedValue([{
      id: 'pc-note', title: '元', body: '本文', created_at: '', images: [], received_pc: true,
    }]);
    mocks.downloadWithAutoRefresh.mockResolvedValue({ items: [{
      id: 'pc-note', title: '元', body: '本文',
      originNoteId: 'origin', originBodyHash: 'hash', originPcId: 'pc-a',
      originAppearance: { backgroundColor: '#ffeeaa', x: 100, y: 200, width: 400, height: 300 },
    }] });
    mocks.saveDraft.mockResolvedValue(undefined);
    const { unmount } = renderHook(() => useNoteList({
      step: 'list', accessToken: 'token', setHistoryNotes: vi.fn(),
      setIsHistoryLoading: vi.fn(), setThumbnailUrls: vi.fn(), initLockedNoteIds: vi.fn(),
    }));
    await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      id: 'pc-note', originNoteId: 'origin', originBodyHash: 'hash', originPcId: 'pc-a',
      originAppearance: { backgroundColor: '#ffeeaa', x: 100, y: 200, width: 400, height: 300 },
    })));
    unmount();
  });
  it('一覧表示後に削除したメモを、遅いDrive完了で再表示しない', async () => {
    const deleted: DraftRecord = { id: 'delete-during-sync', title: '削除対象', body: '本文', created_at: '', images: [], locked: true };
    const keep: DraftRecord = { id: 'keep-during-sync', title: '残す', body: '本文', created_at: '', images: [] };
    let completeDrive!: (value: { items: unknown[] }) => void;
    const pendingDrive = new Promise<{ items: unknown[] }>(resolve => { completeDrive = resolve; });
    mocks.loadAllDrafts.mockResolvedValue([deleted, keep]);
    mocks.downloadWithAutoRefresh.mockReturnValue(pendingDrive);
    const setHistoryNotes = vi.fn();
    const { unmount } = renderHook(() => useNoteList({ step: 'list', accessToken: 'token', setHistoryNotes,
      setIsHistoryLoading: vi.fn(), setThumbnailUrls: vi.fn(), initLockedNoteIds: vi.fn() }));
    await waitFor(() => expect(setHistoryNotes).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({id: deleted.id})])));
    // 一覧の削除処理がDBと削除済みIDを更新した後に、Drive応答が到着する。
    mocks.loadAllDrafts.mockResolvedValue([keep]);
    mocks.loadDeletedDraftIds.mockResolvedValue([deleted.id]);
    setHistoryNotes.mockClear();
    await act(async () => { completeDrive({ items: [] }); await pendingDrive; });
    await waitFor(() => expect(setHistoryNotes).toHaveBeenLastCalledWith([expect.objectContaining({ id: keep.id })]));
    expect(setHistoryNotes).not.toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: deleted.id })]));
    unmount();
  });

  it('同期後の最新DBを読めない場合も削除前の一覧で上書きしない', async () => {
    const draft: DraftRecord = { id: 'old-local', title: '以前の一覧', body: '', created_at: '', images: [] };
    let completeDrive!: (value: { items: unknown[] }) => void;
    const pendingDrive = new Promise<{ items: unknown[] }>(resolve => { completeDrive = resolve; });
    mocks.loadAllDrafts.mockResolvedValueOnce([draft]).mockRejectedValue(new Error('DB unavailable'));
    mocks.downloadWithAutoRefresh.mockReturnValue(pendingDrive);
    const setHistoryNotes = vi.fn();
    const setIsHistoryLoading = vi.fn();
    const { unmount } = renderHook(() => useNoteList({ step: 'list', accessToken: 'token', setHistoryNotes,
      setIsHistoryLoading, setThumbnailUrls: vi.fn(), initLockedNoteIds: vi.fn() }));
    await waitFor(() => expect(setHistoryNotes).toHaveBeenCalled());
    setHistoryNotes.mockClear();setIsHistoryLoading.mockClear();
    await act(async () => { completeDrive({ items: [] }); await pendingDrive; });
    await waitFor(() => expect(setIsHistoryLoading).toHaveBeenCalledWith(false));
    expect(setHistoryNotes).not.toHaveBeenCalled();
    unmount();
  });

});


describe('製品の履歴取得と受信データ', () => {
  it('日時順の最新20件を表示し、送信済み・PC受信・下書きの状態を製品処理で判定する', async () => {
    const drafts = Array.from({length: 23}, (_, i) => ({id: String(i), title: String(i), body: '', images: [],
      created_at: new Date(Date.UTC(2026,0,i+1)).toISOString(),
      ...(i===22 ? {sent_at:'sent',received_pc:true as const} : i===21 ? {received_pc:true as const} : {})}));
    mocks.loadAllDrafts.mockResolvedValue(drafts);
    mocks.loadDeletedDraftIds.mockResolvedValue([]);
    const publish = vi.fn();
    const {unmount} = renderHook(() => useNoteList({step:'list',accessToken:null,setHistoryNotes:publish,
      setIsHistoryLoading:vi.fn(),setThumbnailUrls:vi.fn(),initLockedNoteIds:vi.fn()}));
    await waitFor(() => expect(publish).toHaveBeenCalled());
    const notes = publish.mock.calls.at(-1)![0];
    expect(notes).toHaveLength(20);
    expect(notes.map((n: any)=>n.id)).toEqual(Array.from({length:20},(_,i)=>String(22-i)));
    expect(notes.slice(0,3).map((n: any)=>n.status)).toEqual(['sent','received_pc','draft']);
    unmount();
  });

  it('PC受信itemsを保存し、空の受信配列では余計なノートを作らない', async () => {
    mocks.loadDeletedDraftIds.mockResolvedValue([]);
    mocks.loadAllDrafts.mockResolvedValue([]);
    mocks.saveDraft.mockResolvedValue(undefined);
    mocks.downloadWithAutoRefresh.mockResolvedValue({items:[{id:'a',title:'A',body:'本文A'},{id:'b',title:'B',body:'本文B'}]});
    const props = {step:'list' as const,accessToken:'token',setHistoryNotes:vi.fn(),
      setIsHistoryLoading:vi.fn(),setThumbnailUrls:vi.fn(),initLockedNoteIds:vi.fn()};
    const first = renderHook(() => useNoteList(props));
    await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalledWith(expect.objectContaining({id:'b',body:'本文B',received_pc:true})));
    expect(mocks.saveDraft).toHaveBeenCalledWith(expect.objectContaining({id:'a',body:'本文A',received_pc:true}));
    first.unmount();
    mocks.saveDraft.mockClear();
    mocks.downloadWithAutoRefresh.mockResolvedValue({items:[]});
    const loading = vi.fn();
    const second = renderHook(() => useNoteList({...props,setIsHistoryLoading:loading}));
    await waitFor(() => expect(loading).toHaveBeenLastCalledWith(false));
    expect(mocks.saveDraft).not.toHaveBeenCalled();
    second.unmount();
  });
});
