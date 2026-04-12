import React from 'react';
import { serializeEditor, extractTitleBody } from '../editor-helpers';
import { saveDraft } from '../lib/indexeddb';

// ---------------------------------------------------------------------------
// useVisibilitySave: アプリがバックグラウンドになった瞬間に保存
// ---------------------------------------------------------------------------

type VisibilitySaveRefs = {
  editorRef: React.RefObject<HTMLDivElement>;
  currentDraftIdRef: React.MutableRefObject<string | null>;
  imageBlobsRef: React.RefObject<Map<string, Blob>>;
  writeTagsRef: React.RefObject<string[]>;
};

/**
 * visibilitychange イベントで hidden になった瞬間に IndexedDB へ保存する。
 * useEffect を内包しているので、呼ぶだけでよい。
 */
export function useVisibilitySave(refs: VisibilitySaveRefs): void {
  React.useEffect(() => {
    const handleHide = () => {
      if (document.visibilityState !== 'hidden') return;
      if (!refs.editorRef.current) return;
      const rawText = serializeEditor(refs.editorRef.current);
      if (!rawText.trim()) return;
      const { title, body } = extractTitleBody(rawText);
      const draftId = refs.currentDraftIdRef.current ?? crypto.randomUUID();
      refs.currentDraftIdRef.current = draftId;
      const imagesArr = Array.from((refs.imageBlobsRef.current ?? new Map()).entries()).map(
        ([fn, f]) => ({ fileName: fn, blob: f })
      );
      saveDraft({
        id: draftId,
        title,
        body,
        created_at: new Date().toISOString(),
        images: imagesArr,
        tags: refs.writeTagsRef.current ?? [],
      }).catch(() => {});
    };
    document.addEventListener('visibilitychange', handleHide);
    return () => document.removeEventListener('visibilitychange', handleHide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
