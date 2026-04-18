'use client';

import { useEffect } from 'react';
import { loadAllDrafts, saveDraft } from '../lib/indexeddb';
import { downloadWithAutoRefresh, uploadWithAutoRefresh, downloadBinaryWithAutoRefresh, deleteFileFromDrive } from '../lib/drive';
import type { IphoneNote, DraftRecord } from '../types';
import { nowJST } from '../utils';

// ---------------------------------------------------------------------------
// useNoteList
// step === 'list' になったとき一覧・サムネイル・ロック状態をロードするフック
// Drive → IndexedDB → UI の一方向同期。UIは IndexedDB のみ参照（SSOT）。
// ---------------------------------------------------------------------------

type UseNoteListOptions = {
  step: string;
  accessToken: string | null;
  setHistoryNotes: (notes: IphoneNote[]) => void;
  setIsHistoryLoading: (v: boolean) => void;
  setThumbnailUrls: (map: Map<string, string>) => void;
  initLockedNoteIds: (ids: string[]) => void;
};

/**
 * 責務: step === 'list' のとき Drive → IndexedDB → UI の一方向同期でノート一覧・サムネイル・ロック状態をロードする
 * 入力: UseNoteListOptions（step, accessToken, setHistoryNotes, setIsHistoryLoading, setThumbnailUrls, initLockedNoteIds）
 * 出力: なし
 * 副作用: Drive API 呼び出し（notes_to_iphone.json）、IndexedDB 読み書き（loadAllDrafts/saveDraft）、URL.createObjectURL
 */
export function useNoteList({
  step,
  accessToken,
  setHistoryNotes,
  setIsHistoryLoading,
  setThumbnailUrls,
  initLockedNoteIds,
}: UseNoteListOptions): void {
  useEffect(() => {
    if (step !== 'list') return;
    setIsHistoryLoading(true);

    let thumbUrls: string[] = [];

    const draftsPromise = loadAllDrafts().catch(() => [] as DraftRecord[]);

    // ロック通知は IndexedDB のデータで即時処理（Drive fetch を待たない）
    draftsPromise.then((localDrafts) => {
      const lockedIds = localDrafts.filter((d) => d.locked).map((d) => d.id);
      // ロック状態ログ
      try {
        const req = indexedDB.open('fusen-logs', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('logs', { autoIncrement: true });
        req.onsuccess = () => {
          const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
          const t = jst.toISOString().replace('Z', '+09:00');
          const tx = req.result.transaction('logs', 'readwrite');
          tx.objectStore('logs').add({ t, msg: `[noteList] initLockedNoteIds count=${lockedIds.length} ids=${lockedIds.map(id => id.slice(0,8)).join(',')}` });
        };
      } catch { /* ignore */ }
      initLockedNoteIds(lockedIds);
    });

    // Drive から notes_to_iphone.json を取得してマージ（失敗時は IndexedDB のみで続行）
    const drivePromise: Promise<DraftRecord[]> = accessToken
      ? downloadWithAutoRefresh(accessToken, 'notes_to_iphone.json')
          .then((raw) => {
            const data = raw as { items?: unknown[] };
            const items = Array.isArray(data.items) ? data.items : [];
            return items.map((item: any) => ({
              id: item.id as string,
              title: item.title ?? '',
              body: item.body ?? '',
              created_at: item.sent_at ?? nowJST(),
              images: [],
              tags: Array.isArray(item.tags) ? item.tags : [],
              received_pc: true as const,
            } satisfies DraftRecord));
          })
          .catch(() => [] as DraftRecord[])
      : Promise.resolve([] as DraftRecord[]);

    Promise.all([draftsPromise, drivePromise])
      .then(async ([localDrafts, driveItems]) => {
        // id をキーに Map でマージ（IndexedDB 優先、ただし received_pc は Drive の body_rich で上書き）
        const merged = new Map<string, DraftRecord>();
        for (const d of localDrafts) merged.set(d.id, d);
        const toSave: DraftRecord[] = [];
        // received_pc ノートの fusen_img_* 画像を Drive からダウンロードして images に保存
        const downloadImagesForItem = async (item: DraftRecord): Promise<DraftRecord> => {
          if (!accessToken) return item;
          const imgRe = /!\[[^\]]*\]\((fusen_img_[^)]+)\)/g;
          const fileNames: string[] = [];
          let m: RegExpExecArray | null;
          imgRe.lastIndex = 0;
          while ((m = imgRe.exec(item.body)) !== null) fileNames.push(m[1]);
          if (fileNames.length === 0) return item;
          const images = await Promise.all(
            fileNames.map(async (fileName) => {
              try {
                const blob = await downloadBinaryWithAutoRefresh(accessToken, fileName);
                return { fileName, blob };
              } catch {
                return null;
              }
            })
          );
          return { ...item, images: images.filter((x): x is { fileName: string; blob: Blob } => x !== null) };
        };

        const hasMissingImages = (d: DraftRecord): boolean => {
          const imgRe = /!\[[^\]]*\]\((fusen_img_[^)]+)\)/g;
          const savedNames = new Set((d.images ?? []).map((i) => i.fileName));
          let m: RegExpExecArray | null;
          while ((m = imgRe.exec(d.body)) !== null) {
            if (!savedNames.has(m[1])) return true;
          }
          return false;
        };

        for (const item of driveItems) {
          const existing = merged.get(item.id);
          if (!existing) {
            const withImages = await downloadImagesForItem(item);
            merged.set(withImages.id, withImages);
            toSave.push(withImages);
          } else if (item.received_pc && (existing.body !== item.body || hasMissingImages(existing))) {
            const withImages = await downloadImagesForItem({ ...existing, body: item.body });
            // Drive から画像ダウンロード失敗時（SW削除済み）は既存のblobを保持
            const finalImages = withImages.images.length > 0 ? withImages.images : existing.images;
            const final = { ...withImages, images: finalImages };
            merged.set(final.id, final);
            toSave.push(final);
          }
        }

        // 不足分を IndexedDB に保存（取りこぼし補完）
        await Promise.all(toSave.map((d) => saveDraft(d).catch(() => {})));

        // IndexedDB 保存済み画像を Drive から削除（リソース解放）
        if (accessToken) {
          const savedFileNames = toSave.flatMap((d) => (d.images ?? []).map((i) => i.fileName));
          for (const fileName of savedFileNames) {
            deleteFileFromDrive(accessToken, fileName).catch(() => {});
          }
        }

        // フォールバックで実際に補完した場合のみ Drive から削除
        if (toSave.length > 0 && accessToken) {
          deleteFileFromDrive(accessToken, 'notes_to_iphone.json').catch(() => {});
        }

        const drafts = Array.from(merged.values());

        const notes: IphoneNote[] = drafts
          .map((d) => ({
            id: d.id, title: d.title, body: d.body,
            status: d.sent_at ? ('sent' as const) : d.received_pc ? ('received_pc' as const) : ('draft' as const),
            created_at: d.created_at, tags: d.tags,
          }))
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 20);
        setHistoryNotes(notes);

        const thumbMap = new Map<string, string>();
        for (const d of drafts) {
          if (d.images && d.images.length > 0) {
            const url = URL.createObjectURL(d.images[0].blob);
            thumbMap.set(d.id, url);
            thumbUrls.push(url);
          }
        }
        setThumbnailUrls(thumbMap);
      })
      .finally(() => setIsHistoryLoading(false));

    return () => { thumbUrls.forEach((u) => URL.revokeObjectURL(u)); };
  }, [step, accessToken]);
}
