'use client';

import { useEffect } from 'react';
import { loadDraft, saveAuthToken, loadPendingOpen, clearPendingOpen } from '../lib/indexeddb';
import {
  consumePendingNotification,
  getNotificationNoteId,
  loadNotificationDraft,
  removeNotificationNoteParam,
} from '../lib/notification-navigation';
import { formatNavigationLog } from '../lib/diagnostic-log';

function pageLog(msg: string) {
  try {
    const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const t = jst.toISOString().replace('Z', '+09:00');
    const req = indexedDB.open('fusen-logs', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('logs', { autoIncrement: true });
    req.onsuccess = () => {
      const tx = req.result.transaction('logs', 'readwrite');
      tx.objectStore('logs').add({ t, msg });
    };
  } catch { /* 無視 */ }
}
import { generatePKCE, startOAuth } from '../lib/auth';
import type { DraftRecord, PendingHydrate, PendingVideoMeta, VideoBlobMap } from '../types';

// ---------------------------------------------------------------------------
// useAppInit
// アプリ起動時の初期化処理（SW登録・OAuth コールバック・ステップ遷移）
// ---------------------------------------------------------------------------

type Step = 'banner' | 'login' | 'push' | 'write' | 'list';

export function resolveImmediateStartupStep(token: string | null, pushDone: boolean): Step {
  if (!token) return 'login';
  return pushDone ? 'write' : 'push';
}

type UseAppInitOptions = {
  setIsStandalone: (v: boolean) => void;
  setSwReady: (v: boolean) => void;
  setStep: (s: Step) => void;
  setAccessToken: (t: string) => void;
  setIsLoading: (v: boolean) => void;
  setErrorMessage: (msg: string | null) => void;
  setPendingHydrate: (v: PendingHydrate | null) => void;
  hasStartedWriting?: () => boolean;
};

/**
 * 責務: アプリ起動時の初期化処理（SW 登録・OAuth コールバック・ステップ遷移）を行うカスタムフック
 * 入力: UseAppInitOptions（setIsStandalone, setSwReady, setStep, setAccessToken, setIsLoading, setErrorMessage, setPendingHydrate）
 * 出力: なし
 * 副作用: ServiceWorker 登録、localStorage 読み書き（トークン・PKCE）、/api/auth/token 呼び出し、IndexedDB 読み取り（loadDraft）
 */
export function useAppInit({
  setIsStandalone,
  setSwReady,
  setStep,
  setAccessToken,
  setIsLoading,
  setErrorMessage,
  setPendingHydrate,
  hasStartedWriting,
}: UseAppInitOptions): void {
  useEffect(() => {
    const videoMetasFromDraft = (draft: {
      type?: string;
      videoFileName?: string;
      originalFileName?: string;
      videos?: DraftRecord['videos'];
    }): PendingVideoMeta[] => {
      if (draft.videos && draft.videos.length > 0) {
        return draft.videos.map((video) => ({
          fileName: video.fileName,
          name: video.originalName || video.fileName,
          size: video.blob?.size ?? 0,
          type: video.blob?.type || 'video/mp4',
        }));
      }
      if (draft.type !== 'video' && !draft.videoFileName && !draft.originalFileName) return [];
      const fileName = draft.videoFileName || draft.originalFileName || 'video';
      return [{
        fileName,
        name: draft.originalFileName || draft.videoFileName || 'video',
        size: 0,
        type: 'video/mp4',
      }];
    };

    const videoBlobMapFromDraft = (draft: DraftRecord | null): VideoBlobMap => {
      if (!draft?.videos || draft.videos.length === 0) return new Map();
      return new Map(draft.videos.flatMap((video) => (
        video.blob
          ? [[video.fileName, { blob: video.blob, originalName: video.originalName }]]
          : []
      )));
    };

    // iOS Safari は navigator.standalone で判定、他は matchMedia
    const standalone =
      (navigator as any).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches;
    setIsStandalone(standalone);

    // SW を登録し、ready になったら swReady=true にする
    // タイムアウト（8秒）後は強制的に true にして先に進む
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration('/').then((reg) => {
        if (!reg) {
          navigator.serviceWorker.register('/sw.js', { scope: '/' });
        }
      });
      const swTimeout = setTimeout(() => setSwReady(true), 8000);
      navigator.serviceWorker.ready.then(() => {
        clearTimeout(swTimeout);
        setSwReady(true);
      });
    } else {
      // SW非対応ブラウザでも先に進む
      setSwReady(true);
    }

    // if (!standalone) return; // 開発中は無効化

    const params = new URLSearchParams(window.location.search);

    // accessToken 調達: localStorage → 再認証
    let token = localStorage.getItem('viewer_access_token');

    // OAuth コールバック（?code= あり）
    if (params.get('code')) {
      const code = params.get('code')!;
      const verifier = localStorage.getItem('pkce_verifier');
      if (!verifier) {
        setErrorMessage('セッションが切れました。再度ログインしてください。');
        setStep('login');
        return;
      }
      setIsLoading(true);
      fetch('/api/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          redirect_uri: window.location.origin + '/viewer',
          code_verifier: verifier,
        }),
      })
        .then((r) => r.json())
        .then(async (data) => {
          const t = data.access_token;
          if (!t) throw new Error('access_token missing');
          localStorage.setItem('viewer_access_token', t);
          if (data.refresh_token) {
            localStorage.setItem('viewer_refresh_token', data.refresh_token);
          }
          if (data.expires_in) {
            localStorage.setItem('viewer_expires_at', String(Date.now() + data.expires_in * 1000));
          }
          saveAuthToken(t).catch(() => {}); // SW が push 時に参照するため IndexedDB にも保存
          setAccessToken(t);
          window.history.replaceState({}, '', '/viewer');
          const pendingNote = localStorage.getItem('pending_note');
          if (pendingNote) {
            const draft = await loadDraft(pendingNote).catch(() => null);
            if (draft) {
              const titleLine = draft.title ? `${draft.title}\n` : '';
              const images = draft.images ?? [];
              const blobMap = new Map<string, Blob>(images.map(({ fileName, blob }) => [fileName, blob]));
              setPendingHydrate({
                markdown: titleLine + draft.body,
                blobMap,
                draftId: draft.id,
                tags: draft.tags ?? [],
                videoMetas: videoMetasFromDraft(draft),
                videoBlobMap: videoBlobMapFromDraft(draft),
              });
              localStorage.removeItem('pending_note');
            }
            setStep('write');
            return;
          }
          setStep('push');
        })
        .catch((err) => {
          setErrorMessage('ログインに失敗しました: ' + err.message);
          setStep('login');
        })
        .finally(() => setIsLoading(false));
      return;
    }

    // 通知タップ（?note= あり）
    // メモは必ず IndexedDB にある（ローカル下書き or 一覧で受信済み）
    // Drive は見ない。Drive ダウンロードは一覧を開いたときに行う。
    const notificationNoteId = getNotificationNoteId(window.location.search);
    if (notificationNoteId) {
      pageLog(formatNavigationLog('route_received', {
        source: 'url',
        id: notificationNoteId,
        token: Boolean(token),
      }));
      if (!token) {
        pageLog(formatNavigationLog('route_deferred_for_login', {
          source: 'url',
          id: notificationNoteId,
        }));
        generatePKCE().then(({ verifier, challenge }) => {
          localStorage.setItem('pkce_verifier', verifier);
          localStorage.setItem('pending_note', notificationNoteId);
          startOAuth(challenge);
        });
        return;
      }
      setAccessToken(token);
      loadNotificationDraft(
        notificationNoteId,
        loadDraft,
        undefined,
        (attempt) => pageLog(formatNavigationLog('draft_load', {
          source: 'url',
          id: notificationNoteId,
          attempt: attempt.attempt,
          result: attempt.result,
          elapsed_ms: attempt.elapsedMs,
          error: attempt.errorName,
        })),
      ).then((draft) => {
        if (draft) {
          const titleLine = draft.title ? `${draft.title}\n` : '';
          const images = draft.images ?? [];
          const blobMap = new Map<string, Blob>(images.map(({ fileName, blob }) => [fileName, blob]));
          setPendingHydrate({
            markdown: titleLine + draft.body,
            blobMap,
            draftId: draft.id,
            tags: draft.tags ?? [],
            videoMetas: videoMetasFromDraft(draft),
            videoBlobMap: videoBlobMapFromDraft(draft),
            notificationSource: 'url',
          });
          window.history.replaceState(
            {},
            '',
            removeNotificationNoteParam(window.location.href),
          );
          pageLog(formatNavigationLog('detail_requested', {
            source: 'url',
            id: notificationNoteId,
          }));
          setStep('write');
        } else {
          pageLog(formatNavigationLog('detail_not_opened', {
            source: 'url',
            id: notificationNoteId,
            reason: 'draft_unavailable',
          }));
        }
      });
      return;
    }

    // OAuth 再リダイレクト後の pending_note 処理
    const pendingNote = localStorage.getItem('pending_note');
    if (pendingNote && token) {
      setAccessToken(token);
      loadDraft(pendingNote).then((draft) => {
        if (draft) {
          const titleLine = draft.title ? `${draft.title}\n` : '';
          const images = draft.images ?? [];
          const blobMap = new Map<string, Blob>(images.map(({ fileName, blob }) => [fileName, blob]));
          setPendingHydrate({
            markdown: titleLine + draft.body,
            blobMap,
            draftId: draft.id,
            tags: draft.tags ?? [],
            videoMetas: videoMetasFromDraft(draft),
            videoBlobMap: videoBlobMapFromDraft(draft),
          });
          localStorage.removeItem('pending_note');
        }
        setStep('write');
      });
      return;
    }

    // iOS で notificationclick が発火しない場合の代替: pending_open を確認
    // SW が通知表示時に記録。5分以内なら自動でノートを開く
    if (token) {
      setAccessToken(token);
      const resetPush = new URLSearchParams(window.location.search).get('reset_push');
      if (resetPush === '1') {
        localStorage.removeItem('viewer_push_done');
      }

      // 通常起動は IndexedDB の確認を待たず、まず入力可能な編集画面を表示する。
      // pending_open があれば、後から同じ画面へ対象ノートを hydrate する。
      setStep(resolveImmediateStartupStep(
        token,
        localStorage.getItem('viewer_push_done') === 'true'
      ));

      (async () => {
        const pending = await loadPendingOpen().catch(() => null);
        pageLog(formatNavigationLog('pending_checked', {
          source: 'pending_open',
          found: Boolean(pending),
          id: pending?.id,
          age_seconds: pending ? Math.round((Date.now() - pending.t) / 1000) : undefined,
        }));
        if (pending && Date.now() - pending.t < 30 * 60 * 1000) {
          // 起動直後に入力が始まっていたら、その1文字目以降を通知ノートで上書きしない。
          // pending_open は残し、次回起動時に再確認する。
          if (hasStartedWriting?.()) {
            pageLog(formatNavigationLog('detail_not_opened', {
              source: 'pending_open',
              id: pending.id,
              reason: 'writing_started',
            }));
            return;
          }
          const draft = await consumePendingNotification(
            pending.id,
            loadDraft,
            () => clearPendingOpen().catch(() => {}),
            undefined,
            (attempt) => pageLog(formatNavigationLog('draft_load', {
              source: 'pending_open',
              id: pending.id,
              attempt: attempt.attempt,
              result: attempt.result,
              elapsed_ms: attempt.elapsedMs,
              error: attempt.errorName,
            })),
          );
          if (draft) {
            const titleLine = draft.title ? `${draft.title}\n` : '';
            const images = draft.images ?? [];
            const blobMap = new Map<string, Blob>(images.map(({ fileName, blob }) => [fileName, blob]));
            setPendingHydrate({
              markdown: titleLine + draft.body,
              blobMap,
              draftId: draft.id,
              tags: draft.tags ?? [],
              videoMetas: videoMetasFromDraft(draft),
              videoBlobMap: videoBlobMapFromDraft(draft),
              notificationSource: 'pending_open',
            });
            pageLog(formatNavigationLog('detail_requested', {
              source: 'pending_open',
              id: pending.id,
            }));
            setStep('write');
          } else {
            pageLog(formatNavigationLog('detail_not_opened', {
              source: 'pending_open',
              id: pending.id,
              reason: 'draft_unavailable',
            }));
          }
          return;
        }

      })();
    } else {
      setStep('login');
    }
  }, [hasStartedWriting, setAccessToken, setErrorMessage, setIsLoading, setIsStandalone, setPendingHydrate, setStep, setSwReady]);
}
