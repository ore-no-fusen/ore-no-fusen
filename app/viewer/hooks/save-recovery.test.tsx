import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutoSave } from './useAutoSave';
import { useVisibilitySave } from './useVisibilitySave';
import { loadDraft, saveDraft } from '../lib/indexeddb';

vi.mock('../lib/indexeddb', () => ({
  loadDraft: vi.fn(),
  saveDraft: vi.fn(),
}));

function makeRefs() {
  const editor = document.createElement('div');
  editor.textContent = 'タイトル\n本文';
  return {
    editorRef: { current: editor } as React.RefObject<HTMLDivElement>,
    currentDraftIdRef: { current: null } as React.MutableRefObject<string | null>,
    imageBlobsRef: { current: new Map([['photo.jpg', new Blob(['photo'], { type: 'image/jpeg' })]]) },
    writeTagsRef: { current: ['重要'] },
  };
}

describe('PWA 下書き保存', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(saveDraft).mockResolvedValue(undefined);
    vi.mocked(loadDraft).mockResolvedValue(null);
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'draft-save-id') });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('R01: 3秒入力停止後、本文・タグ・画像を同じ下書きIDへ自動保存する', async () => {
    const refs = makeRefs();
    const setCurrentDraftId = vi.fn();
    const { result } = renderHook(() => useAutoSave(refs, { setCurrentDraftId }));

    await act(async () => {
      result.current();
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      id: 'draft-save-id', title: 'タイトル', body: '本文', tags: ['重要'],
      images: [expect.objectContaining({ fileName: 'photo.jpg' })],
    }));
    expect(refs.currentDraftIdRef.current).toBe('draft-save-id');
    expect(setCurrentDraftId).toHaveBeenCalledWith('draft-save-id');
  });

  it('R02: バックグラウンド遷移時は待たずに保存し、既存のロック状態を保持する', async () => {
    const refs = makeRefs();
    refs.currentDraftIdRef.current = 'locked-draft';
    vi.mocked(loadDraft).mockResolvedValue({ locked: true } as never);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    renderHook(() => useVisibilitySave(refs));

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });

    expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      id: 'locked-draft', title: 'タイトル', body: '本文', tags: ['重要'], locked: true,
      images: [expect.objectContaining({ fileName: 'photo.jpg' })],
    }));
  });
});
