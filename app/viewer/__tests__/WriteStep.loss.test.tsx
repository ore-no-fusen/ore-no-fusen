import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WriteStep } from '../WriteStep';
import { saveDraft } from '../lib/indexeddb';
import { getTranslation } from '@/lib/i18n';

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
  const videoBlobsRef = { current: new Map<string, { blob: Blob; originalName: string }>() };
  const props: React.ComponentProps<typeof WriteStep> = {
    editorRef,
    fileInputRef,
    videoInputRef,
    imageBlobsRef,
    videoBlobsRef,
    showTagBar: false,
    tagInput: '',
    writeTags: ['tag1'],
    knownTags: [],
    showCropModal: false,
    cropFile: null,
    showMermaidModal: false,
    videoMetas: [],
    backgroundSendSuccess: false,
    errorMessage: null,
    isLoading: false,
    isSendingInBackground: false,
    currentDraftId: null,
    accessToken: 'token',
    t: getTranslation('ja'),
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
    setVideoBlobs: vi.fn(),
    setVideoMetas: vi.fn(),
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
  return { ...view, props, editor: editorRef.current, imageBlobsRef, videoBlobsRef };
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
    const setVideoBlobs = vi.fn();
    const setVideoMetas = vi.fn();
    const { container } = renderWriteStep({ sendToPC, setVideoBlobs, setVideoMetas });
    const input = container.querySelector('input[accept="video/mp4,video/quicktime,.mp4,.mov"]') as HTMLInputElement;
    const file = new File(['video'], 'dance.mov', { type: 'video/quicktime' });

    fireEvent.change(input, { target: { files: [file] } });

    expect(setVideoBlobs).toHaveBeenCalledWith(expect.any(Map));
    expect(setVideoMetas).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'dance.mov' }),
    ]);
    expect(sendToPC).not.toHaveBeenCalled();
    await waitFor(() => expect(saveDraftMock).toHaveBeenCalled());
    expect(saveDraftMock).toHaveBeenCalledWith(expect.not.objectContaining({
      videos: expect.any(Array),
    }));
  });

  it('動画選択済みならPCに送る時に通常付箋と一緒に送信する', async () => {
    const sendToPC = vi.fn(async () => true);
    const videoFile = new File(['video'], 'dance.mov', { type: 'video/quicktime' });
    const videoBlobsRef = { current: new Map([['fusen_video_dance.mov', { blob: videoFile, originalName: 'dance.mov' }]]) };
    const { getByRole } = renderWriteStep({
      sendToPC,
      videoBlobsRef,
      pcDevices: [{ pcId: 'pc-1', pcName: '作業PC' }],
      selectedPcId: 'pc-1',
    });

    fireEvent.click(getByRole('button', { name: 'PCに送る' }));

    await waitFor(() => expect(sendToPC).toHaveBeenCalled());
    expect(sendToPC).toHaveBeenCalledWith({
      rawText: '大事な付箋',
      tags: ['tag1'],
      blobs: expect.any(Map),
      videoBlobs: expect.any(Map),
      draftId: 'draft-id-1',
      targetPcId: 'pc-1',
    });
    const calls = sendToPC.mock.calls as unknown as Array<[{
      videoBlobs: Map<string, { blob: Blob; originalName: string }>;
    }]>;
    const payload = calls[0][0];
    expect(payload.videoBlobs.get('fusen_video_dance.mov')).toEqual({ blob: videoFile, originalName: 'dance.mov' });
  });

  it('PCに送る直前に送信先PC一覧を再確認し、最新のPC IDで送る', async () => {
    const sendToPC = vi.fn(async () => true);
    const refreshPcDevices = vi.fn(async () => 'pc-2');
    const { getByRole } = renderWriteStep({
      sendToPC,
      refreshPcDevices,
      pcDevices: [
        { pcId: 'pc-1', pcName: '旧PC' },
        { pcId: 'pc-2', pcName: '新PC' },
      ],
      selectedPcId: 'pc-1',
    });

    fireEvent.click(getByRole('button', { name: 'PCに送る' }));

    await waitFor(() => expect(refreshPcDevices).toHaveBeenCalled());
    expect(sendToPC).toHaveBeenCalledWith(expect.objectContaining({
      rawText: '大事な付箋',
      targetPcId: 'pc-2',
    }));
  });

  it('送信先PCは通常利用ではPC名だけを表示する', () => {
    const updatedAt = '2026-05-31T10:00:00+09:00';
    const updatedDate = new Date(updatedAt);
    const expectedUpdatedAt = `${updatedDate.getMonth() + 1}/${updatedDate.getDate()} ${updatedDate.getHours().toString().padStart(2, '0')}:${updatedDate.getMinutes().toString().padStart(2, '0')}`;
    const { getByText } = renderWriteStep({
      pcDevices: [{ pcId: 'pc-1', pcName: '家のPC', updatedAt }],
      selectedPcId: 'pc-1',
    });

    expect(getByText('家のPC')).toBeTruthy();
    expect(getByText(`更新 ${expectedUpdatedAt}`)).toBeTruthy();
  });

  it('本文画像をタップすると全画面プレビューを開き、背景タップで閉じる', () => {
    const { editor, getByRole, queryByRole } = renderWriteStep();
    const image = document.createElement('img');
    image.src = 'blob:preview-image';
    editor.replaceChildren(image);

    fireEvent.click(image);

    const dialog = getByRole('dialog', { name: '画像プレビュー' });
    expect(dialog.querySelector('img')?.getAttribute('src')).toBe('blob:preview-image');
    fireEvent.click(dialog);
    expect(queryByRole('dialog', { name: '画像プレビュー' })).toBeNull();
  });

  it('編集画面のURLをタップすると新しい画面でリンクを開く', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { editor } = renderWriteStep();
    const link = document.createElement('a');
    link.href = 'https://example.com/viewer';
    link.setAttribute('data-pwa-link', '');
    link.textContent = link.href;
    editor.replaceChildren(link);

    fireEvent.click(link);

    expect(open).toHaveBeenCalledWith(
      'https://example.com/viewer',
      '_blank',
      'noopener,noreferrer',
    );
    open.mockRestore();
  });
});
