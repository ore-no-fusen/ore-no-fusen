'use client';

import { useEffect } from 'react';
import { loadAllDrafts, saveDraft } from '../lib/indexeddb';
import { downloadWithAutoRefresh, uploadWithAutoRefresh } from '../lib/drive';
import type { IphoneNote, DraftRecord } from '../types';

// ---------------------------------------------------------------------------
// useNoteList
// step === 'list' になったとき一覧・サムネイル・ロック状態をロードするフック
// Drive → IndexedDB → UI の一方向同期。UIは IndexedDB のみ参照（SSOT）。
// ---------------------------------------------------------------------------

type UseNoteListOptions = {
  step: string;
  accessToken: string | null;
  hasRestoredLockRef: React.MutableRefObject<boolean>;
  setHistoryNotes: (notes: IphoneNote[]) => void;
  setIsHistoryLoading: (v: boolean) => void;
  setThumbnailUrls: (map: Map<string, string>) => void;
  setActiveNotifIds: (ids: string[]) => void;
  initLockedNoteIds: (ids: string[]) => void;
};

/**
 * 責務: step === 'list' のとき Drive → IndexedDB → UI の一方向同期でノート一覧・サムネイル・ロック状態をロードする
 * 入力: UseNoteListOptions（step, accessToken, hasRestoredLockRef, setHistoryNotes, setIsHistoryLoading, setThumbnailUrls, setActiveNotifIds, initLockedNoteIds）
 * 出力: なし
 * 副作用: Drive API 呼び出し（notes_to_iphone.json）、IndexedDB 読み書き（loadAllDrafts/saveDraft）、ServiceWorker 通知表示・取得、URL.createObjectURL
 */
export function useNoteList({
  step,
  accessToken,
  hasRestoredLockRef,
  setHistoryNotes,
  setIsHistoryLoading,
  setThumbnailUrls,
  setActiveNotifIds,
  initLockedNoteIds,
}: UseNoteListOptions): void {
  useEffect(() => {
    if (step !== 'list') return;
    setIsHistoryLoading(true);

    // アクティブな通知 ID をサービスワーカー経由で取得
    navigator.serviceWorker.ready.then((reg) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = (e) => setActiveNotifIds(e.data.ids ?? []);
      reg.active?.postMessage({ type: 'GET_NOTIFICATIONS' }, [channel.port2]);
    }).catch(() => {});

    let thumbUrls: string[] = [];

    const draftsPromise = loadAllDrafts().catch(() => [] as DraftRecord[]);

    // ロック通知は IndexedDB のデータで即時処理（Drive fetch を待たない）
    draftsPromise.then((localDrafts) => {
      const lockedIds = localDrafts.filter((d) => d.locked).map((d) => d.id);
      initLockedNoteIds(lockedIds);

      if (!hasRestoredLockRef.current && lockedIds.length > 0 && Notification.permission === 'granted') {
        hasRestoredLockRef.current = true;
        navigator.serviceWorker.ready.then(async (reg) => {
          for (const d of localDrafts.filter((d) => d.locked)) {
            const rawTitle = d.title || '';
            const rawBody = d.body || '';
            const notifTitle = rawTitle
              ? rawTitle.replace(/^#\s*/, '')
              : rawBody.slice(0, 20) || '（無題）';
            const notifBody = rawTitle
              ? rawBody.slice(0, 40)
              : rawBody.slice(20, 60);
            await reg.showNotification(notifTitle, {
              body: notifBody,
              tag: `fusen-lock-${d.id}`,
              data: { id: d.id, title: notifTitle, body: notifBody },
              icon: '/icon-192.png',
              badge: '/icon-192.png',
            });
          }
        }).catch(() => {});
      }
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
              created_at: item.sent_at ?? new Date().toISOString(),
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
        for (const item of driveItems) {
          const existing = merged.get(item.id);
          if (!existing) {
            merged.set(item.id, item);
            toSave.push(item);
          } else if (item.received_pc && existing.body !== item.body) {
            // SW が push 受信時に保存した body_push（画像なし）を
            // Drive の body_rich（base64 data URI 入り）で上書きする
            const updated = { ...existing, body: item.body };
            merged.set(item.id, updated);
            toSave.push(updated);
          }
        }

        // 不足分を IndexedDB に保存（取りこぼし補完）
        await Promise.all(toSave.map((d) => saveDraft(d).catch(() => {})));

        // IndexedDB への保存完了 → Drive から削除（受信済みデータは不要）
        if (driveItems.length > 0 && accessToken) {
          uploadWithAutoRefresh(accessToken, 'notes_to_iphone.json', { items: [] }).catch(() => {});
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
  }, [step]);
}
