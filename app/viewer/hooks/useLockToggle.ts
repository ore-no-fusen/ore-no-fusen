'use client';

import { useState } from 'react';
import type { IphoneNote, DraftRecord } from '../types';
import { saveDraft, loadDraft } from '../lib/indexeddb';
import { nowJST } from '../utils';

// ---------------------------------------------------------------------------
// useLockToggle
// ロック（ロック画面への通知固定表示）の ON/OFF を管理するカスタムフック
// ---------------------------------------------------------------------------

type UseLockToggleOptions = {
  /** エラー発生時のコールバック */
  onError: (message: string) => void;
};

type UseLockToggleReturn = {
  /** 現在ロック中のメモ ID 一覧 */
  lockedNoteIds: string[];
  /** lockedNoteIds の setter（handleDeleteNote など外部から直接操作する場合に使用） */
  setLockedNoteIds: React.Dispatch<React.SetStateAction<string[]>>;
  /** ロック状態を外部から初期化する（一覧ロード後に呼ぶ） */
  initLockedNoteIds: (ids: string[]) => void;
  /** 通知権限リクエスト中フラグ */
  isLockPermissionPending: boolean;
  /** ロックボタンのクリックハンドラ */
  handleLockToggle: (e: React.MouseEvent, note: IphoneNote) => Promise<void>;
};

/**
 * 責務: ノートのロック（ロック画面への通知固定）ON/OFF を管理するカスタムフック
 * 入力: UseLockToggleOptions（onError）
 * 出力: UseLockToggleReturn（lockedNoteIds, setLockedNoteIds, initLockedNoteIds, isLockPermissionPending, handleLockToggle）
 * 副作用: React state の初期化（useState）
 */
export function useLockToggle({ onError }: UseLockToggleOptions): UseLockToggleReturn {
  const [lockedNoteIds, setLockedNoteIds] = useState<string[]>([]);
  const [isLockPermissionPending, setIsLockPermissionPending] = useState(false);

  /**
   * 責務: 一覧ロード後に lockedNoteIds を外部から初期設定する
   * 入力: ids: string[]
   * 出力: なし
   * 副作用: setLockedNoteIds を呼ぶ
   */
  const initLockedNoteIds = (ids: string[]) => {
    setLockedNoteIds(ids);
  };

  /**
   * 責務: ロックボタンのクリックでノートのロック状態を切り替える
   * 入力: e: React.MouseEvent, note: IphoneNote
   * 出力: Promise<void>
   * 副作用: ServiceWorker 通知表示・解除、IndexedDB 書き込み（saveDraft）、Notification 権限リクエスト
   */
  const handleLockToggle = async (e: React.MouseEvent, note: IphoneNote) => {
    e.stopPropagation();
    const isLocked = lockedNoteIds.includes(note.id);

    // 楽観的更新
    if (isLocked) {
      setLockedNoteIds((prev) => prev.filter((id) => id !== note.id));
    } else {
      setLockedNoteIds((prev) => [...prev, note.id]);
    }

    try {
      if (isLocked) {
        // ロック解除: 通知を閉じてDB更新
        const reg = await navigator.serviceWorker.ready;
        reg.active?.postMessage({ type: 'CLOSE_NOTIFICATION', tag: `fusen-lock-${note.id}` });
        const draft = await loadDraft(note.id);
        if (draft) {
          const { locked, ...rest } = draft;
          await saveDraft(rest as DraftRecord);
        }
      } else {
        // ロック ON: 権限確認 → 通知表示 → DB更新
        if (Notification.permission === 'default') {
          setIsLockPermissionPending(true);
          const result = await Notification.requestPermission();
          setIsLockPermissionPending(false);
          if (result !== 'granted') {
            setLockedNoteIds((prev) => prev.filter((id) => id !== note.id));
            onError('通知権限が必要です。設定から有効にしてください');
            return;
          }
        } else if (Notification.permission === 'denied') {
          setLockedNoteIds((prev) => prev.filter((id) => id !== note.id));
          onError('通知権限が必要です。設定から有効にしてください');
          return;
        }

        // 通知タイトル・body の生成
        const rawTitle = note.title || '';
        const rawBody = note.body || '';
        const notifTitle = rawTitle
          ? rawTitle.replace(/^#\s*/, '')
          : rawBody.slice(0, 20) || '（無題）';
        const notifBody = rawTitle
          ? rawBody.slice(0, 40)
          : rawBody.slice(20, 60);

        // SW 経由で通知表示（new Notification() はモバイルで動かない）
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(notifTitle, {
          body: notifBody,
          tag: `fusen-lock-${note.id}`,
          data: { id: note.id, title: notifTitle, body: notifBody },
          icon: '/icon-192.png',
          badge: '/icon-192.png',
        });

        // DB に locked: true を保存
        const draft = await loadDraft(note.id);
        if (draft) {
          await saveDraft({ ...draft, locked: true });
        } else {
          // received_pc 等で draft が null の場合: 最小レコードを生成して保存
          await saveDraft({
            id: note.id,
            title: note.title || '',
            body: note.body || '',
            created_at: note.created_at || nowJST(),
            images: [],
            tags: note.tags,
            locked: true,
          });
        }
      }
    } catch {
      // 失敗時はロールバック
      if (isLocked) {
        setLockedNoteIds((prev) => [...prev, note.id]);
      } else {
        setLockedNoteIds((prev) => prev.filter((id) => id !== note.id));
      }
    }
  };

  return { lockedNoteIds, setLockedNoteIds, initLockedNoteIds, isLockPermissionPending, handleLockToggle };
}
