'use client';

import { useState, useEffect } from 'react';

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

async function generatePKCE() {
  const verifier =
    crypto.randomUUID().replace(/-/g, '') +
    crypto.randomUUID().replace(/-/g, '');
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier)
  );
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return { verifier, challenge };
}

function startOAuth(challenge: string) {
  const params = new URLSearchParams({
    client_id: process.env.NEXT_PUBLIC_GDRIVE_CLIENT_ID!,
    redirect_uri: window.location.origin + '/viewer',
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/drive.file',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
  });
  window.location.href =
    'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function uploadToDrive(
  accessToken: string,
  fileName: string,
  data: object
) {
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${fileName}'+and+trashed=false`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const searchData = await searchRes.json();
  const fileId = searchData.files?.[0]?.id;
  const body = JSON.stringify(data);
  const meta = JSON.stringify({ name: fileName, mimeType: 'application/json' });
  const form = new FormData();
  form.append('metadata', new Blob([meta], { type: 'application/json' }));
  form.append('file', new Blob([body], { type: 'application/json' }));
  if (fileId) {
    await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      }
    );
  } else {
    await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      }
    );
  }
}

async function downloadFromDrive(accessToken: string, fileName: string) {
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${fileName}'+and+trashed=false`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const searchData = await searchRes.json();
  const fileId = searchData.files?.[0]?.id;
  if (!fileId) throw new Error(`${fileName} not found in Drive`);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  return res.json();
}

// ---------------------------------------------------------------------------
// ViewerPage コンポーネント
// ---------------------------------------------------------------------------

export default function ViewerPage() {
  const [isStandalone, setIsStandalone] = useState(false);
  const [step, setStep] = useState<
    'banner' | 'login' | 'push' | 'ready' | 'note'
  >('banner');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [noteData, setNoteData] = useState<{
    title: string;
    body: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [swReady, setSwReady] = useState(false);

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

    // accessToken 調達: localStorage → localStorage → 再認証
    let token =
      localStorage.getItem('viewer_access_token') ??
      localStorage.getItem('viewer_access_token');

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
          localStorage.setItem('pkce_verifier_used', 'done'); // cleanup flag
          localStorage.setItem('viewer_access_token', t);
          setAccessToken(t);
          token = t;
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
      setIsLoading(true);
      downloadFromDrive(token, 'fusen_note.json')
        .then((data) => {
          setNoteData(data);
          setStep('note');
        })
        .catch((err) =>
          setErrorMessage('メモの取得に失敗しました: ' + err.message)
        )
        .finally(() => setIsLoading(false));
      return;
    }

    // OAuth 再リダイレクト後の pending_note 処理
    const pendingNote = localStorage.getItem('pending_note');
    if (pendingNote && token) {
      localStorage.removeItem('pending_note');
      setAccessToken(token);
      setIsLoading(true);
      downloadFromDrive(token, 'fusen_note.json')
        .then((data) => {
          setNoteData(data);
          setStep('note');
        })
        .catch((err) =>
          setErrorMessage('メモの取得に失敗しました: ' + err.message)
        )
        .finally(() => setIsLoading(false));
      return;
    }

    // 通常フロー（セットアップ）
    if (token) {
      setAccessToken(token);
      setStep('push');
    } else {
      setStep('login');
    }
  }, []);

  // ローディング表示
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">読み込み中...</p>
      </div>
    );
  }

  // 非standalone → ホーム画面追加バナー
  if (!isStandalone) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 max-w-sm w-full">
          <h1 className="text-lg font-bold mb-3">ホーム画面に追加してください</h1>
          <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
            <li>
              Safari の共有アイコン（↑）をタップ
            </li>
            <li>
              「ホーム画面に追加」を選択
            </li>
          </ol>
          <p className="mt-3 text-sm text-gray-500">
            インストール後にセットアップを完了してください
          </p>
        </div>
      </div>
    );
  }

  // standalone → ステップUI / 全文表示
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-prose mx-auto w-full">
        {step === 'login' && (
          <div className="flex flex-col items-center gap-4">
            <p className="text-gray-700">セットアップ ステップ 1 / 2</p>
            {!swReady && (
              <p className="text-gray-500 text-sm">SW準備中...</p>
            )}
            <button
              className="bg-blue-600 text-white rounded-lg px-6 py-3 font-medium disabled:opacity-40"
              disabled={!swReady}
              onClick={async () => {
                const { verifier, challenge } = await generatePKCE();
                localStorage.setItem('pkce_verifier', verifier);
                startOAuth(challenge);
              }}
            >
              Googleでログイン
            </button>
            {errorMessage && (
              <p className="text-red-600 text-sm">{errorMessage}</p>
            )}
          </div>
        )}

        {step === 'push' && (
          <div className="flex flex-col items-center gap-4">
            <p className="text-gray-700">セットアップ ステップ 2 / 2</p>
            {!swReady ? (
              <p className="text-gray-500 text-sm">SW準備中...</p>
            ) : (
              <button
                className="bg-blue-600 text-white rounded-lg px-6 py-3 font-medium disabled:opacity-50"
                disabled={isLoading}
                onClick={async () => {
                  try {
                    setIsLoading(true);
                    const perm = await Notification.requestPermission();
                    if (perm !== 'granted') {
                      setErrorMessage('通知を許可してください');
                      setIsLoading(false);
                      return;
                    }
                    // swReady=true の時点で navigator.serviceWorker.controller は active 確定
                    const reg = await navigator.serviceWorker.getRegistration('/');
                    if (!reg) throw new Error('Service Worker が見つかりません');
                    const vapidKey = urlBase64ToUint8Array(
                      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
                    );
                    const sub = await reg.pushManager.subscribe({
                      userVisibleOnly: true,
                      applicationServerKey: vapidKey.buffer.slice(
                        vapidKey.byteOffset,
                        vapidKey.byteOffset + vapidKey.byteLength
                      ) as ArrayBuffer,
                    });
                    const subJson = sub.toJSON();
                    const endpoint = subJson?.endpoint as string;
                    const keys = subJson?.keys;
                    await uploadToDrive(accessToken!, 'fusen_push_config.json', {
                      endpoint,
                      keys,
                    });
                    setStep('ready');
                  } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    setErrorMessage('通知設定に失敗しました: ' + msg);
                  } finally {
                    setIsLoading(false);
                  }
                }}
              >
                {isLoading ? '処理中...' : '通知を許可する'}
              </button>
            )}
            {errorMessage && (
              <p className="text-red-600 text-sm">{errorMessage}</p>
            )}
          </div>
        )}

        {step === 'ready' && (
          <div className="text-center">
            <p className="text-gray-700">
              PCから付箋が送られたらここに表示されます
            </p>
            {errorMessage && (
              <p className="text-red-600 text-sm mt-2">{errorMessage}</p>
            )}
          </div>
        )}

        {step === 'note' && noteData && (
          <div>
            <h1 className="text-xl font-bold">{noteData.title}</h1>
            <pre className="whitespace-pre-wrap mt-4">{noteData.body}</pre>
            {errorMessage && (
              <p className="text-red-600 text-sm mt-2">{errorMessage}</p>
            )}
          </div>
        )}

        {step === 'banner' && isStandalone && (
          <div className="text-center">
            <p className="text-gray-500">読み込み中...</p>
          </div>
        )}
      </div>
    </div>
  );
}
