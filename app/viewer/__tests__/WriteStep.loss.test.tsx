import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WriteStep } from '../WriteStep';
import { saveDraft } from '../lib/indexeddb';

vi.mock('../lib/indexeddb', () => ({
  saveDraft: vi.fn(),
}));

vi.mock('../CropModal', () => ({
  CropModal: ({ file, onCancel, onCrop }: { file: File; onCancel: () => void; onCrop: (blob: Blob) => void }) => (
    <div data-testid="crop-modal">
      <span>{file.name}</span>
      <button onClick={onCancel}>cancel crop</button>
      <button onClick={() => onCrop(new Blob(['cropped'], { type: 'image/jpeg' }))}>apply crop</button>
    </div>
  ),
}));

vi.mock('../MermaidModal', () => ({
  MermaidModal: () => <div />,
}));

const saveDraftMock = vi.mocked(saveDraft);

function renderWriteStep(overrides: Partial<React.ComponentProps<typeof WriteStep>> = {}) {
  const editorRef = React.createRef<HTMLDivElement>() as React.MutableRefObject<HTMLDivElement | null>;
  const fileInputRef = React.createRef<HTMLInputElement>() as React.MutableRefObject<HTMLInputElement | null>;
  const videoInputRef = React.createRef<HTMLInputElement>() as React.MutableRefObject<HTMLInputElement | null>;
  const imageBlobsRef = { current: new Map<string, Blob>() };
  const props: React.ComponentProps<typeof WriteStep> = {
    editorRef,
    fileInputRef,
    videoInputRef,
    imageBlobsRef,
    showTagBar: false,
    tagInput: '',
    writeTags: ['tag1'],
    knownTags: [],
    showCropModal: false,
    cropFile: null,
    showMermaidModal: false,
    pendingVideoFile: null,
    backgroundSendSuccess: false,
    errorMessage: null,
    isLoading: false,
    isSendingInBackground: false,
    currentDraftId: null,
    accessToken: 'token',
    t: ((key: string) => key) as React.ComponentProps<typeof WriteStep>['t'],
    setStep: vi.fn(),
    setShowTagBar: vi.fn(),
    setTagInput: vi.fn(),
    setWriteTags: vi.fn(),
    setKnownTags: vi.fn(),
    setImageBlobs: vi.fn(),
    setShowCropModal: vi.fn(),
    setCropFile: vi.fn(),
    setCropQueue: vi.fn(),
    setShowMermaidModal: vi.fn(),
    setPendingVideoFile: vi.fn(),
    setErrorMessage: vi.fn(),
    setIsLoading: vi.fn(),
    setCurrentDraftId: vi.fn(),
    setPendingHydrate: vi.fn(),
    handleEditorInput: vi.fn(),
    sendToPC: vi.fn(async () => true),
    ...overrides,
  };

  const view = render(<WriteStep {...props} />);
  if (!editorRef.current) throw new Error('editorRef not mounted');
  editorRef.current.textContent = '大事な付箋';
  return { ...view, props, editor: editorRef.current, imageBlobsRef };
}

describe('WriteStep loss prevention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    saveDraftMock.mockResolvedValue(undefined);
    vi.stubGlobal(
      'Audio',
      class {
        play = vi.fn().mockResolvedValue(undefined);
      },
    );
    vi.stubGlobal('crypto', { randomUUID: () => 'draft-id-1' });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('送信前の退避保存に失敗したら、送信せず本文と画像を消さない', async () => {
    saveDraftMock.mockRejectedValueOnce(new Error('IndexedDB full'));
    const sendToPC = vi.fn(async () => true);
    const setErrorMessage = vi.fn();
    const { editor, getByRole, imageBlobsRef } = renderWriteStep({ sendToPC, setErrorMessage });
    imageBlobsRef.current.set('photo.jpg', new Blob(['photo'], { type: 'image/jpeg' }));

    fireEvent.click(getByRole('button', { name: 'PCに送る' }));

    await waitFor(() => expect(setErrorMessage).toHaveBeenCalledWith(expect.stringContaining('送信前の退避保存に失敗しました')));
    expect(sendToPC).not.toHaveBeenCalled();
    expect(editor.textContent).toBe('大事な付箋');
    expect(imageBlobsRef.current.size).toBe(1);
  });

  it('sendToPC が失敗を返したら、本文と画像を消さない', async () => {
    const sendToPC = vi.fn(async () => false);
    const { editor, getByRole, imageBlobsRef } = renderWriteStep({ sendToPC });
    imageBlobsRef.current.set('photo.jpg', new Blob(['photo'], { type: 'image/jpeg' }));

    fireEvent.click(getByRole('button', { name: 'PCに送る' }));

    await waitFor(() => expect(sendToPC).toHaveBeenCalled());
    expect(editor.textContent).toBe('大事な付箋');
    expect(imageBlobsRef.current.size).toBe(1);
    expect(localStorage.getItem('pending_note')).toBe('draft-id-1');
  });

  it('sendToPC が成功したときだけ、本文と画像をクリアする', async () => {
    const sendToPC = vi.fn(async () => true);
    const { editor, getByRole, imageBlobsRef } = renderWriteStep({ sendToPC });
    imageBlobsRef.current.set('photo.jpg', new Blob(['photo'], { type: 'image/jpeg' }));

    fireEvent.click(getByRole('button', { name: 'PCに送る' }));

    await waitFor(() => expect(sendToPC).toHaveBeenCalled());
    await waitFor(() => expect(editor.innerHTML).toBe(''));
    expect(imageBlobsRef.current.size).toBe(0);
    expect(localStorage.getItem('pending_note')).toBeNull();
  });

  it('複数写真を選択したら、1枚目をクロップに出して残りをキューに積む', () => {
    const setCropFile = vi.fn();
    const setCropQueue = vi.fn();
    const setShowCropModal = vi.fn();
    const { container } = renderWriteStep({ setCropFile, setCropQueue, setShowCropModal });
    const input = container.querySelector('input[accept="image/*"]') as HTMLInputElement;
    const first = new File(['1'], 'first.jpg', { type: 'image/jpeg' });
    const second = new File(['2'], 'second.jpg', { type: 'image/jpeg' });
    const third = new File(['3'], 'third.jpg', { type: 'image/jpeg' });

    fireEvent.change(input, { target: { files: [first, second, third] } });

    expect(input.multiple).toBe(true);
    expect(setCropFile).toHaveBeenCalledWith(first);
    expect(setCropQueue).toHaveBeenCalledWith([second, third]);
    expect(setShowCropModal).toHaveBeenCalledWith(true);
  });

  it('動画を選択しただけでは送信せず、選択済み動画として保持する', async () => {
    const sendToPC = vi.fn(async () => true);
    const setPendingVideoFile = vi.fn();
    const { container } = renderWriteStep({ sendToPC, setPendingVideoFile });
    const input = container.querySelector('input[accept="video/mp4,video/quicktime,.mp4,.mov"]') as HTMLInputElement;
    const file = new File(['video'], 'dance.mov', { type: 'video/quicktime' });

    fireEvent.change(input, { target: { files: [file] } });

    expect(setPendingVideoFile).toHaveBeenCalledWith(file);
    expect(sendToPC).not.toHaveBeenCalled();
  });

  it('動画選択済みならPCに送る時に通常付箋と一緒に送信する', async () => {
    const sendToPC = vi.fn(async () => true);
    const videoFile = new File(['video'], 'dance.mov', { type: 'video/quicktime' });
    const { getByRole } = renderWriteStep({ sendToPC, pendingVideoFile: videoFile });

    fireEvent.click(getByRole('button', { name: 'PCに送る' }));

    await waitFor(() => expect(sendToPC).toHaveBeenCalled());
    expect(sendToPC).toHaveBeenCalledWith({
      rawText: '大事な付箋',
      tags: ['tag1'],
      blobs: expect.any(Map),
      videoFile,
      draftId: 'draft-id-1',
    });
  });
});
