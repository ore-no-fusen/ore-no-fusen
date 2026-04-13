import React from 'react';
import { serializeEditor, extractTitleBody } from '../editor-helpers';
import { saveDraft } from '../lib/indexeddb';

// ---------------------------------------------------------------------------
// useAutoSave: contenteditable の onInput 自動保存ロジック
// ---------------------------------------------------------------------------

type AutoSaveRefs = {
  editorRef: React.RefObject<HTMLDivElement>;
  currentDraftIdRef: React.RefObject<string | null>;
  imageBlobsRef: React.RefObject<Map<string, Blob>>;
  writeTagsRef: React.RefObject<string[]>;
};

type AutoSaveCallbacks = {
  setCurrentDraftId: (id: string) => void;
};

/**
 * 責務: contenteditable の onInput に対して3秒デバウンスで IndexedDB に自動保存するハンドラを返す
 * 入力: refs（editorRef, currentDraftIdRef, imageBlobsRef, writeTagsRef）, callbacks（setCurrentDraftId）
 * 出力: () => void（onInput ハンドラ）
 * 副作用: setTimeout/clearTimeout、IndexedDB 書き込み（saveDraft）、新規下書き時に currentDraftIdRef を更新する
 */
export function useAutoSave(
  refs: AutoSaveRefs,
  callbacks: AutoSaveCallbacks,
): () => void {
  const autoSaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const onInput = React.useCallback(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      if (!refs.editorRef.current) return;
      const rawText = serializeEditor(refs.editorRef.current);
      if (!rawText.trim()) return;
      const { title, body } = extractTitleBody(rawText);
      const draftId = refs.currentDraftIdRef.current ?? crypto.randomUUID();
      if (!refs.currentDraftIdRef.current) {
        (refs.currentDraftIdRef as React.MutableRefObject<string | null>).current = draftId;
        callbacks.setCurrentDraftId(draftId);
      }
      const imagesArr = Array.from((refs.imageBlobsRef.current ?? new Map()).entries()).map(([fn, f]) => ({ fileName: fn, blob: f }));
      await saveDraft({
        id: draftId,
        title,
        body,
        created_at: new Date().toISOString(),
        images: imagesArr,
        tags: refs.writeTagsRef.current ?? [],
      }).catch(() => {});
    }, 3000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // クリーンアップ
  React.useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  return onInput;
}
