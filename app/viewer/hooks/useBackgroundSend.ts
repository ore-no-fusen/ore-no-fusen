'use client';

import { useState } from 'react';
import {
  downloadFromDrive,
  uploadWithAutoRefresh,
  uploadImageWithAutoRefresh,
  refreshAccessToken,
} from '../lib/drive';
import { saveDraft } from '../lib/indexeddb';
import { nowJST } from '../utils';
import { extractTitleBody, mergeKnownTags } from '../editor-helpers';
import type { IphoneNote } from '../types';

// ---------------------------------------------------------------------------
// useBackgroundSend
// 「PCに送る」バックグラウンド送信処理を管理するカスタムフック
// ---------------------------------------------------------------------------

type SendPayload = {
  /** serializeEditor() の結果 */
  rawText: string;
  /** 送信対象のタグ一覧 */
  tags: string[];
  /** 送信対象の画像 blob Map<fileName, Blob> */
  blobs: Map<string, Blob>;
  /** 現在の下書き ID（null なら新規） */
  draftId: string | null;
};

type UseBackgroundSendOptions = {
  /** 現在のアクセストークン */
  accessToken: string | null;
  /** トークン更新後に呼び出す */
  onTokenRefreshed: (newToken: string) => void;
  /** セッション切れ時にステップを login に戻す */
  onSessionExpired: () => void;
};

type UseBackgroundSendReturn = {
  isSendingInBackground: boolean;
  backgroundSendSuccess: boolean;
  backgroundSendError: string | null;
  sendToPC: (payload: SendPayload) => void;
};

/**
 * 責務: 「PCに送る」バックグラウンド送信の状態管理と sendToPC 関数を提供するカスタムフック
 * 入力: UseBackgroundSendOptions（accessToken, onTokenRefreshed, onSessionExpired）
 * 出力: UseBackgroundSendReturn（isSendingInBackground, backgroundSendSuccess, backgroundSendError, sendToPC）
 * 副作用: React state の初期化（useState）
 */
export function useBackgroundSend({
  accessToken,
  onTokenRefreshed,
  onSessionExpired,
}: UseBackgroundSendOptions): UseBackgroundSendReturn {
  const [isSendingInBackground, setIsSendingInBackground] = useState(false);
  const [backgroundSendSuccess, setBackgroundSendSuccess] = useState(false);
  const [backgroundSendError, setBackgroundSendError] = useState<string | null>(null);

  /**
   * 責務: テキスト・タグ・画像を Drive に送信して IndexedDB に sent として保存する
   * 入力: SendPayload（rawText, tags, blobs, draftId）
   * 出力: なし（結果は isSendingInBackground 等の state に反映）
   * 副作用: Drive API 呼び出し（画像アップロード・JSON 更新）、IndexedDB 書き込み（saveDraft）、localStorage 読み書き（トークン）
   */
  const sendToPC = ({ rawText, tags, blobs, draftId }: SendPayload) => {
    if (!accessToken) return;
    setIsSendingInBackground(true);
    setBackgroundSendError(null);

    (async () => {
      try {
        // トークン有効期限確認・自動更新
        let token = accessToken;
        const expiresAt = parseInt(localStorage.getItem('viewer_expires_at') || '0');
        if (Date.now() > expiresAt - 5 * 60 * 1000) {
          const newToken = await refreshAccessToken();
          if (!newToken) {
            localStorage.removeItem('viewer_access_token');
            localStorage.removeItem('viewer_refresh_token');
            setIsSendingInBackground(false);
            setBackgroundSendError('セッションが切れました。再度ログインしてください。');
            setTimeout(() => setBackgroundSendError(null), 5000);
            onSessionExpired();
            return;
          }
          token = newToken;
          onTokenRefreshed(newToken);
        }

        mergeKnownTags(tags);

        const mergedBlobs = new Map(blobs);
        const { title, body: extractedBody } = extractTitleBody(rawText);
        const noteId = crypto.randomUUID();
        const sentAt = nowJST();

        // 画像を並列アップロード
        await Promise.all(
          Array.from(mergedBlobs.entries()).map(([fileName, file]) =>
            uploadImageWithAutoRefresh(token, file, fileName)
          )
        );

        const fullBody = extractedBody;
        const note: IphoneNote = {
          id: noteId,
          status: 'sent',
          title,
          body: fullBody,
          created_at: sentAt,
          sent_at: sentAt,
          tags,
        };

        // --- キュー配列方式: read-modify-write ---
        // 既存データを読み込む（存在しない場合や旧スキーマは自動変換）
        const existing = await downloadFromDrive(token, 'notes_from_iphone.json').catch(() => null);
        let currentItems: any[] = [];
        if (existing) {
          if (Array.isArray(existing.items)) {
            // 新スキーマ
            currentItems = existing.items;
          } else if (existing.id && !existing.received_at) {
            // 旧スキーマ（未処理の単一アイテム）→ キューに変換して引き継ぐ
            currentItems = [{
              id: existing.id,
              title: existing.title ?? '',
              body: existing.body ?? '',
              sent_at: existing.sent_at ?? sentAt,
              tags: existing.tags ?? [],
            }];
          }
          // 旧スキーマで received_at がある場合は処理済み → 捨てる（空配列のまま）
        }
        // 処理済みアイテムは最新5件まで保持（ファイル肥大化防止）
        const processed = currentItems.filter((item: any) => item.received_at).slice(-5);
        const pending = currentItems.filter((item: any) => !item.received_at);

        // 新しいアイテムを末尾に追加
        const newItem = { id: noteId, title, body: fullBody, sent_at: sentAt, tags };
        const updatedItems = [...processed, ...pending, newItem];
        await uploadWithAutoRefresh(token, 'notes_from_iphone.json', { items: updatedItems });

        // 送信済みとして IndexedDB に保存（sent_at をセット）
        await saveDraft({
          id: draftId ?? noteId,
          title,
          body: fullBody,
          created_at: sentAt,
          images: Array.from(mergedBlobs.entries()).map(([fileName, file]) => ({ fileName, blob: file })),
          tags,
          sent_at: sentAt,
        });

        setIsSendingInBackground(false);
        setBackgroundSendSuccess(true);
        setTimeout(() => setBackgroundSendSuccess(false), 3000);
      } catch (err: unknown) {
        const msg = err instanceof Error ? (err.message || String(err)) : String(err);
        setIsSendingInBackground(false);
        if (msg.includes('session expired')) {
          localStorage.removeItem('viewer_access_token');
          localStorage.removeItem('viewer_refresh_token');
          setBackgroundSendError('セッションが切れました。再度ログインしてください。');
          setTimeout(() => setBackgroundSendError(null), 5000);
          onSessionExpired();
        } else {
          setBackgroundSendError('送信失敗: ' + msg);
          setTimeout(() => setBackgroundSendError(null), 5000);
        }
      }
    })();
  };

  return { isSendingInBackground, backgroundSendSuccess, backgroundSendError, sendToPC };
}
