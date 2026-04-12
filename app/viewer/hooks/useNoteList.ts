'use client';

import { useEffect } from 'react';
import { loadAllDrafts } from '../lib/indexeddb';
import type { IphoneNote, DraftRecord } from '../types';

// ---------------------------------------------------------------------------
// useNoteList
// step === 'list' になったとき一覧・サムネイル・ロック状態をロードするフック
// ---------------------------------------------------------------------------

type UseNoteListOptions = {
  step: string;
  hasRestoredLockRef: React.MutableRefObject<boolean>;
  setHistoryNotes: (notes: IphoneNote[]) => void;
  setIsHistoryLoading: (v: boolean) => void;
  setThumbnailUrls: (map: Map<string, string>) => void;
  setActiveNotifIds: (ids: string[]) => void;
  initLockedNoteIds: (ids: string[]) => void;
};

export function useNoteList({
  step,
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
    const draftsPromise = loadAllDrafts().catch(() => [] as DraftRecord[]);

    // アクティブな通知 ID をサービスワーカー経由で取得
    navigator.serviceWorker.ready.then((reg) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = (e) => setActiveNotifIds(e.data.ids ?? []);
      reg.active?.postMessage({ type: 'GET_NOTIFICATIONS' }, [channel.port2]);
    }).catch(() => {});

    let thumbUrls: string[] = [];
    draftsPromise
      .then((drafts) => {
        const draftNotes: IphoneNote[] = drafts.map((d) => ({
          id: d.id, title: d.title, body: d.body,
          status: d.sent_at ? ('sent' as const) : d.received_pc ? ('received_pc' as const) : ('draft' as const),
          created_at: d.created_at, tags: d.tags,
        }));
        const merged = draftNotes
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 20);
        setHistoryNotes(merged);

        const thumbMap = new Map<string, string>();
        for (const d of drafts) {
          if (d.images && d.images.length > 0) {
            const url = URL.createObjectURL(d.images[0].blob);
            thumbMap.set(d.id, url);
            thumbUrls.push(url);
          }
        }
        setThumbnailUrls(thumbMap);

        // ロック状態を復元: locked === true のメモIDを lockedNoteIds に反映
        const lockedIds = drafts.filter((d) => d.locked).map((d) => d.id);
        initLockedNoteIds(lockedIds);

        // 通知を再発火（権限が granted かつ初回のみ）
        // 起動時に permission リクエストしてはいけない（iOS 制約）
        if (!hasRestoredLockRef.current && lockedIds.length > 0 && Notification.permission === 'granted') {
          hasRestoredLockRef.current = true;
          navigator.serviceWorker.ready.then(async (reg) => {
            for (const d of drafts.filter((d) => d.locked)) {
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
      })
      .finally(() => setIsHistoryLoading(false));

    return () => { thumbUrls.forEach((u) => URL.revokeObjectURL(u)); };
  }, [step]);
}
