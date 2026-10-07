import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { useBackgroundSend } from '../hooks/useBackgroundSend';
import { deserializeFiles, serializeFiles } from '../file-attachments';
import { loadDraft, saveDraft } from '../lib/indexeddb';
import { downloadFromDrive, uploadWithAutoRefresh, uploadFileWithAutoRefresh, uploadImageWithAutoRefresh, uploadVideoWithAutoRefresh } from '../lib/drive';

vi.mock('../lib/indexeddb', () => ({ loadDraft: vi.fn(async () => null), saveDraft: vi.fn(async () => undefined) }));
vi.mock('../lib/drive', () => ({
  downloadFromDrive: vi.fn(async () => ({ items: [{ id: 'pending', targetPcId: 'other-pc' }] })),
  uploadWithAutoRefresh: vi.fn(async () => undefined),
  uploadFileWithAutoRefresh: vi.fn(async () => undefined),
  uploadImageWithAutoRefresh: vi.fn(async () => undefined),
  uploadVideoWithAutoRefresh: vi.fn(async () => undefined),
  refreshAccessToken: vi.fn(async () => 'new-token'),
}));

const pdf = () => ({ fileName: 'fusen_file_test', originalFileName: 'ChatGPTの資料.pdf', mimeType: 'application/pdf', size: 4, blob: new Blob(['%PDF'], { type: 'application/pdf' }) });
function sender() { return renderHook(() => useBackgroundSend({ accessToken: 'token', onTokenRefreshed: vi.fn(), onSessionExpired: vi.fn() })); }
describe('FileDrop send and binary persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadDraft).mockResolvedValue(null);
    vi.mocked(downloadFromDrive).mockResolvedValue({ items: [{ id: 'pending', targetPcId: 'other-pc' }] });
    vi.mocked(uploadFileWithAutoRefresh).mockResolvedValue(undefined);
    localStorage.setItem('viewer_expires_at', String(Date.now() + 3600000));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  it('PDF・画像・動画を同じキューへ送り、本文・タグ・宛先・既存項目を保持する', async () => {
    const { result } = sender();
    const file = pdf();
    const image = new Blob(['image']);
    const video = new Blob(['video']);
    await act(async () => {
      expect(await result.current.sendToPC({ rawText: '資料\n本文を保持', tags: ['仕事'], blobs: new Map([['fusen_img_1', image]]), videoBlobs: new Map([['fusen_video_1.mp4', { blob: video, originalName: '動画.mp4' }]]), files: [file], targetPcId: 'pc-b', draftId: 'draft' })).toBe(true);
    });
    expect(uploadFileWithAutoRefresh).toHaveBeenCalledWith('token', file.blob, 'fusen_file_test');
    expect(uploadImageWithAutoRefresh).toHaveBeenCalledWith('token', image, 'fusen_img_1');
    expect(uploadVideoWithAutoRefresh).toHaveBeenCalledWith('token', video, 'fusen_video_1.mp4');
    expect(uploadWithAutoRefresh).toHaveBeenCalledWith('token', 'notes_from_iphone.json', { items: [
      { id: 'pending', targetPcId: 'other-pc' }, expect.objectContaining({ title: '資料', body: '本文を保持', tags: ['仕事'], targetPcId: 'pc-b', files: [{ fileName: 'fusen_file_test', originalFileName: file.originalFileName, mimeType: 'application/pdf', size: 4 }], videos: [{ videoFileName: 'fusen_video_1.mp4', originalFileName: '動画.mp4' }] }),
    ] });
    expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({ files: [expect.not.objectContaining({ blob: expect.anything() })], sent_at: expect.any(String) }));
  });
  it('本文なしでもfiles[]で送信できる', async () => {
    const { result } = sender();
    await act(async () => { expect(await result.current.sendToPC({ rawText: '', tags: [], blobs: new Map(), files: [pdf()], draftId: null })).toBe(true); });
    expect(uploadWithAutoRefresh).toHaveBeenCalledWith('token', 'notes_from_iphone.json', expect.objectContaining({ items: expect.arrayContaining([expect.objectContaining({ body: '', files: expect.any(Array) })]) }));
  });
  it('添付アップロード失敗時はキュー更新も送信済み保存もしない', async () => {
    vi.mocked(uploadFileWithAutoRefresh).mockRejectedValueOnce(new Error('offline'));
    const { result } = sender();
    await act(async () => { expect(await result.current.sendToPC({ rawText: '本文', tags: [], blobs: new Map(), files: [pdf()], draftId: 'draft' })).toBe(false); });
    expect(uploadWithAutoRefresh).not.toHaveBeenCalled(); expect(saveDraft).not.toHaveBeenCalled();
  });
  it('キュー取得失敗時は既存キューを上書きしない', async () => {
    vi.mocked(downloadFromDrive).mockRejectedValueOnce(new Error('network'));
    const { result } = sender();
    await act(async () => { expect(await result.current.sendToPC({ rawText: '本文', tags: [], blobs: new Map(), files: [pdf()], draftId: 'draft' })).toBe(false); });
    expect(uploadFileWithAutoRefresh).not.toHaveBeenCalled(); expect(uploadWithAutoRefresh).not.toHaveBeenCalled();
  });
  it('復元時にバイナリが欠けた添付は無断で送信から除外せず失敗する', async () => {
    const { blob, ...metadata } = pdf();
    const { result } = sender();
    await act(async () => { expect(await result.current.sendToPC({ rawText: '本文', tags: [], blobs: new Map(), files: [metadata], draftId: 'draft' })).toBe(false); });
    expect(uploadWithAutoRefresh).not.toHaveBeenCalled();
  });
  it('iOS向けArrayBuffer保存からPDFのバイト列・元名・MIME・サイズを復元する', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    const stored = await serializeFiles([pdf()]);
    expect(stored[0].data?.byteLength).toBe(4);
    expect(stored[0]).not.toHaveProperty('blob');
    const persisted = stored.map(file => ({ ...file, data: new Uint8Array(file.data!).slice().buffer }));
    const restored = deserializeFiles(persisted);
    expect(restored[0].originalFileName).toBe('ChatGPTの資料.pdf');
    expect(restored[0].mimeType).toBe('application/pdf'); expect(restored[0].size).toBe(4);
    expect(await restored[0].blob!.text()).toBe('%PDF');
    expect(await serializeFiles([])).toEqual([]);
  });
});
