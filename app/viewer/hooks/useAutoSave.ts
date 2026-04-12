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
 * 3秒のデバウンスで IndexedDB に下書き保存する onInput ハンドラを返す。
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
