import React from 'react';
import { cleanup, render, renderHook, act, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NoteListStep } from '../NoteListStep';
import { useBackgroundSend } from '../hooks/useBackgroundSend';
import { saveDraft } from '../lib/indexeddb';
import { uploadWithAutoRefresh, uploadVideoWithAutoRefresh } from '../lib/drive';

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
            videoFileName: 'fusen_video_20260524_064500_びでお_abcd1234.mp4',
            originalFileName: 'promo_fixed.mp4',
          },
        ]}
        isLoading={false}
        thumbnailUrls={new Map()}
        lockedNoteIds={[]}
        isLockPermissionPending={false}
        t={t}
        swVersion="test"
        onNew={vi.fn()}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
        onLockToggle={vi.fn()}
        onReRegisterPush={vi.fn()}
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

    await act(async () => {
      const ok = await result.current.sendToPC({
        rawText: 'びでお\nユーザが書いたメモ',
        tags: [],
        blobs: new Map(),
        videoFile,
        draftId: 'draft-1',
      });
      expect(ok).toBe(true);
    });

    await waitFor(() => expect(uploadWithAutoRefresh).toHaveBeenCalled());
    const uploadPayload = vi.mocked(uploadWithAutoRefresh).mock.calls[0][2] as {
      items: Array<{ title: string; body: string; originalFileName: string; memo: string }>;
    };
    expect(uploadPayload.items[0].title).toBe('びでお');
    expect(uploadPayload.items[0].body).toBe('ユーザが書いたメモ');
    expect(uploadPayload.items[0].memo).toBe('ユーザが書いたメモ');
    expect(uploadPayload.items[0].originalFileName).toBe('promo_fixed.mp4');
    expect(uploadPayload.items[0].title).not.toBe(uploadPayload.items[0].originalFileName);
    expect(uploadVideoWithAutoRefresh).toHaveBeenCalledWith(
      'token',
      videoFile,
      expect.stringContaining('びでお'),
    );
    expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      id: 'draft-1',
      title: 'びでお',
      body: 'ユーザが書いたメモ',
      originalFileName: 'promo_fixed.mp4',
      memo: 'ユーザが書いたメモ',
      type: 'video',
    }));
  });
});
