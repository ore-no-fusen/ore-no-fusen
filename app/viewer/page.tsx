'use client';

import React, { useState, useEffect } from 'react';
import { SimpleNoteBody } from './SimpleNoteBody';
import { resizeImageToBase64, formatRelativeTime, insertAtCursor } from './utils';

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
  const fileBlob = new Blob([body], { type: 'application/json' });
  if (fileId) {
    const updateMeta = JSON.stringify({ name: fileName, mimeType: 'application/json' });
    const form = new FormData();
    form.append('metadata', new Blob([updateMeta], { type: 'application/json' }));
    form.append('file', fileBlob);
    await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      }
    );
  } else {
    const createMeta = JSON.stringify({ name: fileName, mimeType: 'application/json', parents: ['root'] });
    const form = new FormData();
    form.append('metadata', new Blob([createMeta], { type: 'application/json' }));
    form.append('file', fileBlob);
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
// リフレッシュトークンでアクセストークンを更新する
// ---------------------------------------------------------------------------

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('viewer_refresh_token');
  if (!refreshToken) return null;

  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!res.ok) {
    localStorage.removeItem('viewer_refresh_token');
    return null;
  }

  const data = await res.json();
  const newToken = data.access_token;
  if (!newToken) return null;

  localStorage.setItem('viewer_access_token', newToken);
  if (data.expires_in) {
    localStorage.setItem('viewer_expires_at', String(Date.now() + data.expires_in * 1000));
  }
  return newToken;
}

// ---------------------------------------------------------------------------
// Phase 6 型定義
// ---------------------------------------------------------------------------

type IphoneNote = {
  id: string;
  status: 'sent' | 'draft';
  title: string;
  body: string;
  created_at: string;
  sent_at?: string;
};

// Drive 書き込み（トークン期限切れ時に自動リフレッシュ）
async function uploadWithAutoRefresh(
  token: string,
  fileName: string,
  data: object
): Promise<void> {
  try {
    await uploadToDrive(token, fileName, data);
  } catch {
    const newToken = await refreshAccessToken();
    if (!newToken) throw new Error('session expired');
    await uploadToDrive(newToken, fileName, data);
  }
}

// iPhone 履歴への追記（最新50件上限、ID重複排除）
async function saveToHistory(token: string, note: IphoneNote): Promise<void> {
  const existing: IphoneNote[] = await downloadFromDrive(token, 'fusen_iphone_notes.json')
    .then((data) => data.notes ?? [])
    .catch(() => []);
  const filtered = existing.filter((n) => n.id !== note.id);
  const updated = [note, ...filtered].slice(0, 50);
  await uploadWithAutoRefresh(token, 'fusen_iphone_notes.json', { notes: updated });
}

// 画像をリサイズして base64 文字列に変換
// Drive ダウンロード（トークン期限切れ時に自動リフレッシュ）
function downloadWithAutoRefresh(token: string): Promise<{ title: string; body: string }> {
  return downloadFromDrive(token, 'fusen_note.json').catch(() =>
    refreshAccessToken().then((newToken) => {
      if (!newToken) throw new Error('session expired');
      return downloadFromDrive(newToken, 'fusen_note.json');
    })
  );
}

// ---------------------------------------------------------------------------
// ViewerPage コンポーネント
// ---------------------------------------------------------------------------

export default function ViewerPage() {
  const [isStandalone, setIsStandalone] = useState(false);
  const [step, setStep] = useState<
    'banner' | 'login' | 'push' | 'ready' | 'write' | 'list' | 'note'
  >('banner');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [noteData, setNoteData] = useState<{
    title: string;
    body: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [swReady, setSwReady] = useState(false);
  const [writeTitle, setWriteTitle] = useState('');
  const [writeBody, setWriteBody] = useState('');
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [historyNotes, setHistoryNotes] = useState<IphoneNote[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [showMermaidModal, setShowMermaidModal] = useState(false);
  const [mermaidCode, setMermaidCode] = useState('');
  const [mermaidPreviewSvg, setMermaidPreviewSvg] = useState<string | null>(null);
  const [mermaidPreviewError, setMermaidPreviewError] = useState<string | null>(null);
  const [isMermaidRendering, setIsMermaidRendering] = useState(false);
  const mermaidPreviewRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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
      downloadWithAutoRefresh(token)
        .then((data) => {
          setNoteData(data);
          setStep('note');
        })
        .catch(() => {
          localStorage.removeItem('viewer_access_token');
          setErrorMessage('セッションが切れました。再度ログインしてください。');
          setStep('login');
        })
        .finally(() => setIsLoading(false));
      return;
    }

    // OAuth 再リダイレクト後の pending_note 処理
    const pendingNote = localStorage.getItem('pending_note');
    if (pendingNote && token) {
      localStorage.removeItem('pending_note');
      setAccessToken(token);
      setIsLoading(true);
      downloadWithAutoRefresh(token)
        .then((data) => {
          setNoteData(data);
          setStep('note');
        })
        .catch(() => {
          localStorage.removeItem('viewer_access_token');
          setErrorMessage('セッションが切れました。再度ログインしてください。');
          setStep('login');
        })
        .finally(() => setIsLoading(false));
      return;
    }

    // 通常フロー（セットアップ）
    if (token) {
      setAccessToken(token);
      if (localStorage.getItem('viewer_push_done') === 'true') {
        setStep('write');
      } else {
        setStep('push');
      }
    } else {
      setStep('login');
    }
  }, []);

  useEffect(() => {
    if (step !== 'list' || !accessToken) return;
    setIsHistoryLoading(true);
    downloadFromDrive(accessToken, 'fusen_iphone_notes.json')
      .then((data) => setHistoryNotes((data.notes ?? []).slice(0, 10)))
      .catch(() => setHistoryNotes([]))
      .finally(() => setIsHistoryLoading(false));
  }, [step, accessToken]);

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
    <div className="min-h-screen flex items-center justify-center px-4 bg-white text-gray-900">
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
                    const reg = await navigator.serviceWorker.ready;
                    const existingSub = await reg.pushManager.getSubscription();
                    if (existingSub) await existingSub.unsubscribe();
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
                    localStorage.setItem('viewer_push_done', 'true');
                    setStep('write');
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

        {step === 'write' && (
          <div className="flex flex-col min-h-[100dvh] bg-white">
            {/* ヘッダー */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <button
                className="text-blue-600 text-sm font-medium"
                onClick={() => setStep('list')}
              >
                📋 履歴
              </button>
              <span className="font-semibold text-gray-900">書く</span>
              <div className="w-12" />
            </div>

            {/* タイトル入力 */}
            <input
              type="text"
              placeholder="タイトル（任意）"
              value={writeTitle}
              onChange={(e) => setWriteTitle(e.target.value)}
              className="px-4 py-3 border-b border-gray-100 text-base outline-none"
            />

            {/* 本文テキストエリア */}
            <textarea
              ref={textareaRef}
              placeholder="メモを書く..."
              value={writeBody}
              onChange={(e) => setWriteBody(e.target.value)}
              className="flex-1 px-4 py-3 text-base outline-none resize-none"
            />

            {/* 添付画像サムネイル */}
            {attachedImages.length > 0 && (
              <div className="flex flex-wrap gap-2 px-4 py-2 border-t border-gray-100">
                {attachedImages.map((b64, i) => (
                  <div key={i} className="relative">
                    <img src={b64} className="w-16 h-16 object-cover rounded" alt="" />
                    <button
                      className="absolute -top-1 -right-1 w-5 h-5 bg-gray-600 text-white rounded-full text-xs leading-none"
                      onClick={() => setAttachedImages((prev) => prev.filter((_, j) => j !== i))}
                    >×</button>
                  </div>
                ))}
              </div>
            )}

            {/* 添付ツールバー */}
            <div className="flex gap-3 px-4 py-2 border-t border-gray-100">
              <button
                className="text-2xl"
                onClick={() => fileInputRef.current?.click()}
                aria-label="画像を追加"
              >
                📷
              </button>
              <button
                className="text-sm font-medium text-blue-600 border border-blue-300 rounded px-3 py-1"
                onClick={() => setShowMermaidModal(true)}
              >
                Mermaid
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const base64 = await resizeImageToBase64(file);
                    setAttachedImages((prev) => [...prev, base64]);
                  } catch {
                    setErrorMessage('画像の処理に失敗しました');
                  } finally {
                    e.target.value = '';
                  }
                }}
              />
            </div>

            {/* 成功メッセージ */}
            {sendSuccess && (
              <p className="text-center text-green-600 text-sm py-1">送信しました！</p>
            )}
            {errorMessage && (
              <p className="text-center text-red-600 text-sm py-1">{errorMessage}</p>
            )}

            {/* アクションボタン */}
            <div className="flex gap-3 px-4 py-4 border-t border-gray-200">
              <button
                className="flex-1 py-3 rounded-lg bg-gray-100 text-gray-700 font-medium disabled:opacity-40"
                disabled={isLoading}
                onClick={async () => {
                  if (!accessToken) return;
                  setIsLoading(true);
                  setErrorMessage(null);
                  try {
                    const fullBody = writeBody + attachedImages.map((b64) => `\n![](${b64})`).join('');
                    const note: IphoneNote = {
                      id: crypto.randomUUID(),
                      status: 'draft',
                      title: writeTitle,
                      body: fullBody,
                      created_at: new Date().toISOString(),
                    };
                    await saveToHistory(accessToken, note);
                    setAttachedImages([]);
                    setStep('list');
                  } catch (err: unknown) {
                    setErrorMessage('保存に失敗しました: ' + (err instanceof Error ? err.message : String(err)));
                  } finally {
                    setIsLoading(false);
                  }
                }}
              >
                iPhoneに置いておく
              </button>
              <button
                className="flex-1 py-3 rounded-lg bg-blue-600 text-white font-medium disabled:opacity-40"
                disabled={isLoading}
                onClick={async () => {
                  if (!accessToken) return;
                  setIsLoading(true);
                  setErrorMessage(null);
                  setSendSuccess(false);
                  try {
                    const noteId = crypto.randomUUID();
                    const sentAt = new Date().toISOString();
                    const fullBody = writeBody + attachedImages.map((b64) => `\n![](${b64})`).join('');
                    await uploadWithAutoRefresh(accessToken, 'fusen_from_iphone.json', {
                      id: noteId,
                      title: writeTitle,
                      body: fullBody,
                      sent_at: sentAt,
                    });
                    const note: IphoneNote = {
                      id: noteId,
                      status: 'sent',
                      title: writeTitle,
                      body: fullBody,
                      created_at: sentAt,
                      sent_at: sentAt,
                    };
                    await saveToHistory(accessToken, note);
                    setWriteTitle('');
                    setWriteBody('');
                    setAttachedImages([]);
                    setSendSuccess(true);
                    setTimeout(() => setSendSuccess(false), 3000);
                  } catch (err: unknown) {
                    setErrorMessage('送信に失敗しました: ' + (err instanceof Error ? err.message : String(err)));
                  } finally {
                    setIsLoading(false);
                  }
                }}
              >
                {isLoading ? '送信中...' : 'PCに送る'}
              </button>
            </div>

            {/* Mermaid モーダル */}
            {showMermaidModal && (
              <div className="fixed inset-0 z-50 flex flex-col bg-white">
                {/* モーダルヘッダー */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                  <button
                    className="text-gray-500 text-lg font-medium"
                    onClick={() => {
                      setShowMermaidModal(false);
                      setMermaidCode('');
                      setMermaidPreviewSvg(null);
                      setMermaidPreviewError(null);
                    }}
                  >
                    ✕
                  </button>
                  <span className="font-semibold text-gray-900">Mermaid</span>
                  <button
                    className="text-blue-600 text-sm font-medium disabled:opacity-40"
                    disabled={isMermaidRendering || !mermaidCode.trim()}
                    onClick={async () => {
                      setIsMermaidRendering(true);
                      setMermaidPreviewError(null);
                      try {
                        const { default: mermaid } = await import('mermaid');
                        mermaid.initialize({ startOnLoad: false });
                        const id = `mermaid-preview-${Date.now()}`;
                        const { svg } = await mermaid.render(id, mermaidCode);
                        setMermaidPreviewSvg(svg);
                      } catch (err: unknown) {
                        setMermaidPreviewError('構文エラー: ' + (err instanceof Error ? err.message : String(err)));
                        setMermaidPreviewSvg(null);
                      } finally {
                        setIsMermaidRendering(false);
                      }
                    }}
                  >
                    {isMermaidRendering ? '描画中...' : 'プレビュー'}
                  </button>
                </div>

                {/* コード入力 */}
                <textarea
                  className="flex-1 px-4 py-3 text-sm font-mono outline-none resize-none border-b border-gray-100"
                  placeholder={'graph TD\n  A-->B'}
                  value={mermaidCode}
                  onChange={(e) => {
                    setMermaidCode(e.target.value);
                    setMermaidPreviewSvg(null);
                  }}
                />

                {/* プレビュー領域 */}
                {mermaidPreviewSvg && (
                  <div
                    ref={mermaidPreviewRef}
                    className="px-4 py-3 overflow-auto"
                    dangerouslySetInnerHTML={{ __html: mermaidPreviewSvg }}
                  />
                )}
                {mermaidPreviewError && (
                  <p className="px-4 py-2 text-red-600 text-sm">{mermaidPreviewError}</p>
                )}

                {/* 挿入ボタン */}
                <div className="px-4 py-4 border-t border-gray-200">
                  <button
                    className="w-full py-3 rounded-lg bg-blue-600 text-white font-medium disabled:opacity-40"
                    disabled={!mermaidCode.trim()}
                    onClick={() => {
                      if (!textareaRef.current) return;
                      const block = `\`\`\`mermaid\n${mermaidCode}\n\`\`\``;
                      const newBody = insertAtCursor(textareaRef.current, block);
                      setWriteBody(newBody);
                      setShowMermaidModal(false);
                      setMermaidCode('');
                      setMermaidPreviewSvg(null);
                    }}
                  >
                    挿入
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 'list' && (
          <div className="flex flex-col min-h-[100dvh] bg-white">
            {/* ヘッダー */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <button
                className="text-blue-600 text-sm font-medium"
                onClick={() => setStep('write')}
              >
                ← 戻る
              </button>
              <span className="font-semibold text-gray-900">履歴</span>
              <div className="w-12" />
            </div>

            {/* コンテンツ */}
            <div className="flex-1 overflow-y-auto">
              {isHistoryLoading ? (
                <p className="text-center text-gray-400 py-8 text-sm">読み込み中...</p>
              ) : historyNotes.length === 0 ? (
                <p className="text-center text-gray-400 py-8 text-sm">まだ履歴がありません</p>
              ) : (
                <ul>
                  {historyNotes.map((note) => (
                    <li
                      key={note.id}
                      className={`px-4 py-3 border-b border-gray-100 ${
                        note.status === 'draft'
                          ? 'cursor-pointer active:bg-gray-50'
                          : 'cursor-default'
                      }`}
                      onClick={() => {
                        if (note.status !== 'draft') return;
                        setWriteTitle(note.title);
                        setWriteBody(note.body);
                        setStep('write');
                      }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`text-sm font-semibold px-2 py-0.5 rounded ${
                            note.status === 'sent'
                              ? 'bg-blue-500 text-white'
                              : 'bg-yellow-400 text-gray-900'
                          }`}
                        >
                          {note.status === 'sent' ? '送信済み' : '下書き'}
                        </span>
                        <span className="text-sm text-gray-500">
                          {note.created_at ? (() => { try { return formatRelativeTime(note.created_at); } catch { return ''; } })() : ''}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 truncate">
                        {(note.title || note.body).slice(0, 20) || '（空のメモ）'}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {step === 'note' && noteData && (
          <div>
            <h1 className="text-xl font-bold">{noteData.title}</h1>
            <SimpleNoteBody body={noteData.body} />
            <button
              className="mt-6 px-4 py-2 bg-gray-200 text-gray-700 rounded"
              onClick={() => {
                navigator.serviceWorker.ready.then((reg) => {
                  reg.getNotifications({ tag: 'fusen' }).then((notifications) => {
                    notifications.forEach((n) => n.close());
                  });
                });
                setStep('write');
              }}
            >
              消す
            </button>
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
