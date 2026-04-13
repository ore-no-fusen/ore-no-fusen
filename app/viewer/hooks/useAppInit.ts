'use client';

import { useEffect } from 'react';
import { loadDraft } from '../lib/indexeddb';
import { generatePKCE, startOAuth } from '../lib/auth';
import type { PendingHydrate } from '../types';

// ---------------------------------------------------------------------------
// useAppInit
// アプリ起動時の初期化処理（SW登録・OAuth コールバック・ステップ遷移）
// ---------------------------------------------------------------------------

type Step = 'banner' | 'login' | 'push' | 'ready' | 'write' | 'list';

type UseAppInitOptions = {
  setIsStandalone: (v: boolean) => void;
  setSwReady: (v: boolean) => void;
  setStep: (s: Step) => void;
  setAccessToken: (t: string) => void;
  setIsLoading: (v: boolean) => void;
  setErrorMessage: (msg: string | null) => void;
  setPendingHydrate: (v: PendingHydrate | null) => void;
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
}: UseAppInitOptions): void {
  useEffect(() => {
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

    if (!standalone) return; // バナー表示のみ

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
        .then((data) => {
          const t = data.access_token;
          if (!t) throw new Error('access_token missing');
          localStorage.setItem('viewer_access_token', t);
          if (data.refresh_token) {
            localStorage.setItem('viewer_refresh_token', data.refresh_token);
          }
          if (data.expires_in) {
            localStorage.setItem('viewer_expires_at', String(Date.now() + data.expires_in * 1000));
          }
          setAccessToken(t);
          window.history.replaceState({}, '', '/viewer');
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
    if (params.get('note')) {
      if (!token) {
        generatePKCE().then(({ verifier, challenge }) => {
          localStorage.setItem('pkce_verifier', verifier);
          localStorage.setItem('pending_note', params.get('note')!);
          startOAuth(challenge);
        });
        return;
      }
      setAccessToken(token);
      const tappedId = params.get('note')!;
      loadDraft(tappedId).then((draft) => {
        if (draft) {
          const titleLine = draft.title ? `${draft.title}\n` : '';
          setPendingHydrate({
            markdown: titleLine + draft.body,
            blobMap: new Map(),
            draftId: draft.id,
            tags: draft.tags ?? [],
          });
        }
        setStep('write');
      });
      return;
    }

    // OAuth 再リダイレクト後の pending_note 処理
    const pendingNote = localStorage.getItem('pending_note');
    if (pendingNote && token) {
      localStorage.removeItem('pending_note');
      setAccessToken(token);
      loadDraft(pendingNote).then((draft) => {
        if (draft) {
          const titleLine = draft.title ? `${draft.title}\n` : '';
          setPendingHydrate({
            markdown: titleLine + draft.body,
            blobMap: new Map(),
            draftId: draft.id,
            tags: draft.tags ?? [],
          });
        }
        setStep('write');
      });
      return;
    }

    // 通常フロー（セットアップ）
    if (token) {
      setAccessToken(token);
      const resetPush = new URLSearchParams(window.location.search).get('reset_push');
      if (resetPush === '1') {
        localStorage.removeItem('viewer_push_done');
      }
      if (localStorage.getItem('viewer_push_done') === 'true') {
        setStep('write');
      } else {
        setStep('push');
      }
    } else {
      setStep('login');
    }
  }, []);
}
