'use client';

import { useState } from 'react';
import {
  downloadFromDrive,
  uploadWithAutoRefresh,
  uploadImageWithAutoRefresh,
  uploadVideoWithAutoRefresh,
  refreshAccessToken,
} from '../lib/drive';
import { saveDraft } from '../lib/indexeddb';
import { buildVideoFileName, createId, nowJST } from '../utils';
import { extractTitleBody, mergeKnownTags } from '../editor-helpers';
import type { VideoBlobMap } from '../types';

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
  /** 送信対象の動画 blob Map<driveName, { blob, originalName }> */
  videoBlobs?: VideoBlobMap;
  /** 現在の下書き ID（null なら新規） */
  draftId: string | null;
  /** 送信先PC ID。未指定なら従来どおり全PCが受信候補になる */
  targetPcId?: string;
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
  sendToPC: (payload: SendPayload) => Promise<boolean>;
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
   * 出力: 送信に成功したら true、未接続・失敗・再ログインが必要なら false
   * 副作用: Drive API 呼び出し（画像アップロード・JSON 更新）、IndexedDB 書き込み（saveDraft）、localStorage 読み書き（トークン）
   */
  const sendToPC = async ({ rawText, tags, blobs, videoBlobs, draftId, targetPcId }: SendPayload): Promise<boolean> => {
    if (!accessToken) {
      setBackgroundSendError('Driveに接続してください。');
      setTimeout(() => setBackgroundSendError(null), 5000);
      return false;
    }
    setIsSendingInBackground(true);
    setBackgroundSendError(null);

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
          return false;
        }
        token = newToken;
        onTokenRefreshed(newToken);
      }

      mergeKnownTags(tags);

      const mergedBlobs = new Map(blobs);
      const { title, body: extractedBody } = extractTitleBody(rawText);
      const noteId = createId();
      const sentAt = nowJST();
      const videosToSend: VideoBlobMap = new Map(videoBlobs ?? []);
      const legacyVideosToSend: VideoBlobMap = new Map();
      for (const [fileName, entry] of videosToSend.entries()) {
        const driveName = fileName || buildVideoFileName(entry.originalName, title);
        legacyVideosToSend.set(driveName, entry);
      }

      // --- キュー配列方式: read-modify-write ---
      // 既存データの取得に失敗した場合、空配列で上書きすると未処理キューを失う。
      // 「ファイル未作成」だけを空配列扱いにし、それ以外は送信を中止する。
      let currentItems: any[] = [];
      try {
        const existing = await downloadFromDrive(token, 'notes_from_iphone.json');
        if (existing && typeof existing === 'object') {
          const data = existing as any;
          if (Array.isArray(data.items)) {
            // 新スキーマ
            currentItems = data.items;
          } else if (data.id && !data.received_at) {
            // 旧スキーマ（未処理の単一アイテム）→ キューに変換して引き継ぐ
            currentItems = [{
              id: data.id,
              title: data.title ?? '',
              body: data.body ?? '',
              sent_at: data.sent_at ?? nowJST(),
              tags: data.tags ?? [],
            }];
          }
          // 旧スキーマで received_at がある場合は処理済み → 捨てる（空配列のまま）
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? (err.message || String(err)) : String(err);
        if (!msg.includes('notes_from_iphone.json not found in Drive')) {
          throw new Error(`既存のPC送信キューを読み込めませんでした。未送信データを守るため送信を中止しました: ${msg}`);
        }
      }

      // 画像を並列アップロード
      await Promise.all([
        ...Array.from(mergedBlobs.entries()).map(([fileName, file]) =>
          uploadImageWithAutoRefresh(token, file, fileName)
        ),
        ...Array.from(legacyVideosToSend.entries()).map(([videoFileName, { blob }]) =>
          uploadVideoWithAutoRefresh(token, blob, videoFileName)
        ),
      ]);

      const fullBody = extractedBody;
      const videoItems = Array.from(legacyVideosToSend.entries()).map(([videoFileName, { originalName }]) => ({
        videoFileName,
        originalFileName: originalName,
      }));
      const firstVideo = videoItems[0];
      const videoMemo = videoItems.length > 0 ? fullBody.trim() : undefined;
      // 新しいアイテムを末尾に追加
      const fallbackTitle = title;
      const targetFields = targetPcId ? { targetPcId } : {};
      const newItem = videoItems.length > 0
        ? {
            id: noteId,
            ...targetFields,
            type: 'video',
            title: fallbackTitle,
            body: fullBody,
            sent_at: sentAt,
            tags,
            videos: videoItems,
            videoFileName: firstVideo?.videoFileName,
            originalFileName: firstVideo?.originalFileName,
            memo: videoMemo ?? '',
          }
        : { id: noteId, ...targetFields, title, body: fullBody, sent_at: sentAt, tags };
      const updatedItems = [...currentItems, newItem];
      await uploadWithAutoRefresh(token, 'notes_from_iphone.json', { items: updatedItems });

      // 送信済みとして IndexedDB に保存（sent_at をセット）
      await saveDraft({
        id: draftId ?? noteId,
        title,
        body: fullBody,
        created_at: sentAt,
        images: Array.from(mergedBlobs.entries()).map(([fileName, file]) => ({ fileName, blob: file })),
        videos: Array.from(legacyVideosToSend.entries()).map(([fileName, { originalName }]) => ({
          fileName,
          originalName,
        })),
        tags,
        sent_at: sentAt,
        type: videoItems.length > 0 ? 'video' : 'note',
        videoFileName: firstVideo?.videoFileName,
        originalFileName: firstVideo?.originalFileName,
        memo: videoMemo,
      });

      setIsSendingInBackground(false);
      setBackgroundSendSuccess(true);
      setTimeout(() => setBackgroundSendSuccess(false), 3000);
      return true;
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
      return false;
    }
  };

  return { isSendingInBackground, backgroundSendSuccess, backgroundSendError, sendToPC };
}
