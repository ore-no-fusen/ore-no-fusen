import React from 'react';
import { cleanup, render, renderHook, act, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NoteListStep } from '../NoteListStep';
import { useBackgroundSend } from '../hooks/useBackgroundSend';
import { saveDraft } from '../lib/indexeddb';
import { downloadFromDrive, uploadWithAutoRefresh, uploadVideoWithAutoRefresh } from '../lib/drive';

vi.mock('../lib/indexeddb', () => ({
  saveDraft: vi.fn(),
}));

vi.mock('../lib/drive', () => ({
  downloadFromDrive: vi.fn(async () => null),
  uploadWithAutoRefresh: vi.fn(async () => undefined),
  uploadImageWithAutoRefresh: vi.fn(async () => undefined),
  uploadVideoWithAutoRefresh: vi.fn(async () => undefined),
  refreshAccessToken: vi.fn(async () => 'refreshed-token'),
}));

const t = ((key: string) => key) as React.ComponentProps<typeof NoteListStep>['t'];

describe('Video attachment semantics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('viewer_expires_at', String(Date.now() + 60 * 60 * 1000));
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn()
        .mockReturnValueOnce('note-id-1')
        .mockReturnValueOnce('video-suffix-1'),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('動画付き一覧でも本文はユーザが書いた title/body を表示し、動画名は添付表示に分ける', () => {
    render(
      <NoteListStep
        notes={[
          {
            id: '1',
            status: 'sent',
            type: 'video',
            title: 'びでお',
            body: 'ユーザが書いたメモ',
            created_at: new Date().toISOString(),
            videos: [
              {
                videoFileName: 'fusen_video_20260524_064500_びでお_abcd1234.mp4',
                originalFileName: 'promo_fixed.mp4',
              },
            ],
          },
        ]}
        isLoading={false}
        thumbnailUrls={new Map()}
        lockedNoteIds={[]}
        isLockPermissionPending={false}
        t={t}
        language="ja"
        swVersion="test"
        runtimeOrigin="https://example.com"
        runtimeKind="Vercel"
        onNew={vi.fn()}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
        onLockToggle={vi.fn()}
        onReRegisterPush={vi.fn()}
        onLanguageChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/びでお\s+ユーザが書いたメモ/)).toBeTruthy();
    expect(screen.getByText('🎬 promo_fixed.mp4')).toBeTruthy();
  });

  it('動画送信時も title/body はユーザ入力のまま保存し、動画ファイル名は添付メタデータに分離する', async () => {
    const { result } = renderHook(() =>
      useBackgroundSend({
        accessToken: 'token',
        onTokenRefreshed: vi.fn(),
        onSessionExpired: vi.fn(),
      }),
    );
    const videoFile = new File(['video'], 'promo_fixed.mp4', { type: 'video/mp4' });
    const videoBlobs = new Map([
      ['fusen_video_20260524_064500_びでお_abcd1234.mp4', { blob: videoFile, originalName: 'promo_fixed.mp4' }],
    ]);

    await act(async () => {
      const ok = await result.current.sendToPC({
        rawText: 'びでお\nユーザが書いたメモ',
        tags: [],
        blobs: new Map(),
        videoBlobs,
        draftId: 'draft-1',
        targetPcId: 'pc-1',
      });
      expect(ok).toBe(true);
    });

    await waitFor(() => expect(uploadWithAutoRefresh).toHaveBeenCalled());
    const uploadPayload = vi.mocked(uploadWithAutoRefresh).mock.calls[0][2] as {
      items: Array<{
        title: string;
        body: string;
        originalFileName: string;
        targetPcId: string;
        memo: string;
        videos: Array<{ videoFileName: string; originalFileName: string }>;
      }>;
    };
    expect(uploadPayload.items[0].title).toBe('びでお');
    expect(uploadPayload.items[0].body).toBe('ユーザが書いたメモ');
    expect(uploadPayload.items[0].targetPcId).toBe('pc-1');
    expect(uploadPayload.items[0].memo).toBe('ユーザが書いたメモ');
    expect(uploadPayload.items[0].originalFileName).toBe('promo_fixed.mp4');
    expect(uploadPayload.items[0].videos).toEqual([
      {
        videoFileName: 'fusen_video_20260524_064500_びでお_abcd1234.mp4',
        originalFileName: 'promo_fixed.mp4',
      },
    ]);
    expect(uploadPayload.items[0].title).not.toBe(uploadPayload.items[0].originalFileName);
    expect(uploadVideoWithAutoRefresh).toHaveBeenCalledWith(
      'token',
      videoFile,
      'fusen_video_20260524_064500_びでお_abcd1234.mp4',
    );
    expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      id: 'draft-1',
      title: 'びでお',
      body: 'ユーザが書いたメモ',
      originalFileName: 'promo_fixed.mp4',
      videos: [
        {
          fileName: 'fusen_video_20260524_064500_びでお_abcd1234.mp4',
          originalName: 'promo_fixed.mp4',
        },
      ],
      memo: 'ユーザが書いたメモ',
      type: 'video',
    }));
  });

  it('複数動画でも本文はそのまま、動画だけ videos 配列に分けて送る', async () => {
    const { result } = renderHook(() =>
      useBackgroundSend({
        accessToken: 'token',
        onTokenRefreshed: vi.fn(),
        onSessionExpired: vi.fn(),
      }),
    );
    const first = new File(['first'], 'first.mp4', { type: 'video/mp4' });
    const second = new File(['second'], 'second.mov', { type: 'video/quicktime' });
    const videoBlobs = new Map([
      ['fusen_video_first.mp4', { blob: first, originalName: 'first.mp4' }],
      ['fusen_video_second.mov', { blob: second, originalName: 'second.mov' }],
    ]);

    await act(async () => {
      const ok = await result.current.sendToPC({
        rawText: '大事なタイトル\n一文字も消さない本文',
        tags: [],
        blobs: new Map(),
        videoBlobs,
        draftId: 'draft-2',
      });
      expect(ok).toBe(true);
    });

    const uploadPayload = vi.mocked(uploadWithAutoRefresh).mock.calls[0][2] as {
      items: Array<{
        title: string;
        body: string;
        videos: Array<{ videoFileName: string; originalFileName: string }>;
      }>;
    };
    expect(uploadPayload.items[0].title).toBe('大事なタイトル');
    expect(uploadPayload.items[0].body).toBe('一文字も消さない本文');
    expect(uploadPayload.items[0].videos).toEqual([
      { videoFileName: 'fusen_video_first.mp4', originalFileName: 'first.mp4' },
      { videoFileName: 'fusen_video_second.mov', originalFileName: 'second.mov' },
    ]);
    expect(uploadVideoWithAutoRefresh).toHaveBeenCalledTimes(2);
  });

  it('R06: iPhone→PC送信は既存の未処理キューを残して末尾に追加する', async () => {
    vi.mocked(downloadFromDrive).mockResolvedValueOnce({
      items: [{ id: 'already-queued', title: '先行メモ', body: '消さない', tags: [] }],
    });
    const { result } = renderHook(() => useBackgroundSend({
      accessToken: 'token', onTokenRefreshed: vi.fn(), onSessionExpired: vi.fn(),
    }));

    await act(async () => {
      expect(await result.current.sendToPC({
        rawText: '新規タイトル\n新規本文', tags: ['仕事'], blobs: new Map(), draftId: 'draft-queue',
      })).toBe(true);
    });

    const payload = vi.mocked(uploadWithAutoRefresh).mock.calls[0][2] as { items: Array<{ id: string; title: string }> };
    expect(payload.items).toHaveLength(2);
    expect(payload.items[0]).toMatchObject({ id: 'already-queued', title: '先行メモ' });
    expect(payload.items[1]).toMatchObject({ title: '新規タイトル' });
  });

  it('R07: iPhone→PC送信で既存キューを読めなければ、上書きも送信済み保存もしない', async () => {
    vi.mocked(downloadFromDrive).mockRejectedValueOnce(new Error('temporary Drive failure'));
    const { result } = renderHook(() => useBackgroundSend({
      accessToken: 'token', onTokenRefreshed: vi.fn(), onSessionExpired: vi.fn(),
    }));

    await act(async () => {
      expect(await result.current.sendToPC({
        rawText: '失わせない本文', tags: [], blobs: new Map(), draftId: 'draft-no-overwrite',
      })).toBe(false);
    });

    expect(uploadWithAutoRefresh).not.toHaveBeenCalled();
    expect(saveDraft).not.toHaveBeenCalled();
  });
});
