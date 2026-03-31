'use client';

import React, { useState, useEffect } from 'react';
import { SimpleNoteBody } from './SimpleNoteBody';
import { formatRelativeTime, insertAtCursor } from './utils';

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

function buildImageFileName(title: string, index: number): string {
  const now = new Date();
  const date = now.toLocaleDateString('sv').replace(/-/g, '');
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const ctx = title.trim().replace(/[^\w\u3000-\u9fff\u30a0-\u30ff\u3040-\u309f]/g, '').slice(0, 10);
  return ctx
    ? `fusen_img_${date}_${time}_${ctx}_${index}.jpg`
    : `fusen_img_${date}_${time}_${index}.jpg`;
}

// contenteditable div の innerHTML を Markdown 文字列に変換
function serializeEditor(el: HTMLDivElement): string {
  // div[data-mermaid-code] → ```mermaid\ncode\n```
  // img[data-filename] → ![](filename)
  // その他テキスト・改行 → そのまま
  const clone = el.cloneNode(true) as HTMLDivElement;
  // mermaid ブロックを置換
  clone.querySelectorAll<HTMLElement>('[data-mermaid-code]').forEach((node) => {
    const code = node.getAttribute('data-mermaid-code') ?? '';
    const text = document.createTextNode(`\`\`\`mermaid\n${code}\n\`\`\``);
    node.replaceWith(text);
  });
  // img を Markdown 画像記法に置換
  clone.querySelectorAll<HTMLImageElement>('img[data-filename]').forEach((img) => {
    const filename = img.getAttribute('data-filename') ?? '';
    const text = document.createTextNode(`![](${filename})`);
    img.replaceWith(text);
  });
  // innerHTML から改行を復元（div → \n、br → \n）
  // innerText を使うと \n が付く
  return clone.innerText ?? clone.textContent ?? '';
}

// Markdown の1行目をタイトル、残りをbodyとして分離
// 1行目の # プレフィックスは除去
function extractTitleBody(text: string): { title: string; body: string } {
  const lines = text.split('\n');
  const firstLine = lines[0].replace(/^#\s*/, '').trim();
  const rest = lines.slice(1).join('\n').replace(/^\n+/, '');
  return { title: firstLine, body: rest };
}

// contenteditable のカーソル位置にテキストを挿入
function insertTextAtCursor(text: string): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.setEndAfter(node);
  sel.removeAllRanges();
  sel.addRange(range);
}

// contenteditable のカーソル位置に DOM ノードを挿入
function insertNodeAtCursor(node: Node): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  range.insertNode(node);
  const after = document.createTextNode('\n');
  if (node.parentNode) {
    node.parentNode.insertBefore(after, node.nextSibling);
  }
  range.setStartAfter(after);
  range.setEndAfter(after);
  sel.removeAllRanges();
  sel.addRange(range);
}

// Markdown 文字列を contenteditable DOM に復元
// blobMap: fileName → File（画像の ObjectURL 生成用）
// Mermaid は初回はコードテキストとして表示（再レンダリングしない）
function hydrateEditor(
  el: HTMLDivElement,
  markdown: string,
  blobMap: Map<string, File>
): void {
  // まず空にする
  el.innerHTML = '';
  // 段落ごとに処理
  const lines = markdown.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // ```mermaid ブロック検出
    if (line.startsWith('```mermaid')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // closing ```
      const code = codeLines.join('\n');
      const div = document.createElement('div');
      div.setAttribute('data-mermaid-code', code);
      div.textContent = `[Mermaid: ${code.slice(0, 30)}...]`;
      div.style.cssText = 'background:#f3f4f6;padding:4px 8px;border-radius:4px;font-size:12px;color:#6b7280;margin:4px 0;';
      el.appendChild(div);
      el.appendChild(document.createElement('br'));
      continue;
    }
    // 画像記法 ![](filename) 検出
    const imgMatch = line.match(/^!\[\]\(([^)]+)\)$/);
    if (imgMatch) {
      const filename = imgMatch[1];
      const file = blobMap.get(filename);
      if (file) {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.setAttribute('data-filename', filename);
        img.style.cssText = 'max-height:80px;border-radius:4px;margin:2px 0;';
        el.appendChild(img);
        el.appendChild(document.createElement('br'));
      } else {
        // blob がない場合（sent note）はテキストとして表示
        const span = document.createElement('span');
        span.textContent = line;
        el.appendChild(span);
        el.appendChild(document.createElement('br'));
      }
      i++;
      continue;
    }
    // 通常テキスト行
    const span = document.createElement('span');
    span.textContent = line;
    el.appendChild(span);
    el.appendChild(document.createElement('br'));
    i++;
  }
}

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
    prompt: 'consent',
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

const APP_FOLDER_NAME = 'ore-no-fusen';

async function getAppFolderId(accessToken: string): Promise<string | null> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${APP_FOLDER_NAME}'+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  if (data.files?.[0]?.id) return data.files[0].id as string;
  if (data.error) {
    console.warn('[Drive] folder search error:', data.error.message);
    return null;
  }
  // フォルダが存在しない場合は作成
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: APP_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder', parents: ['root'] }),
  });
  const created = await createRes.json();
  if (created.error) {
    console.warn('[Drive] folder create error:', created.error.message);
    return null;
  }
  return created.id as string;
}

async function uploadToDrive(
  accessToken: string,
  fileName: string,
  data: object
) {
  const folderId = await getAppFolderId(accessToken);
  const parentId = folderId ?? 'root';
  const folderQuery = folderId ? `+and+'${folderId}'+in+parents` : '';
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${fileName}'${folderQuery}+and+trashed=false`,
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
    const patchRes = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      }
    );
    if (!patchRes.ok) throw new Error(`Drive PATCH failed: ${patchRes.status}`);
  } else {
    const createMeta = JSON.stringify({ name: fileName, mimeType: 'application/json', parents: [parentId] });
    const form = new FormData();
    form.append('metadata', new Blob([createMeta], { type: 'application/json' }));
    form.append('file', fileBlob);
    const postRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      }
    );
    if (!postRes.ok) throw new Error(`Drive POST failed: ${postRes.status}`);
  }
}

async function downloadFromDrive(accessToken: string, fileName: string) {
  const folderId = await getAppFolderId(accessToken);
  const folderQuery = folderId ? `+and+'${folderId}'+in+parents` : '';
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${fileName}'${folderQuery}+and+trashed=false`,
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
  tags?: string[];
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

// 画像ファイルを Drive にアップロードしてファイル名を返す
async function uploadImageToDrive(
  accessToken: string,
  file: File,
  fileName: string
): Promise<void> {
  const folderId = await getAppFolderId(accessToken);
  const parentId = folderId ?? 'root';
  const metadata = JSON.stringify({
    name: fileName,
    mimeType: file.type || 'image/jpeg',
    parents: [parentId],
  });
  const form = new FormData();
  form.append('metadata', new Blob([metadata], { type: 'application/json' }));
  form.append('file', file);
  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    }
  );
  if (!res.ok) throw new Error(`Drive image upload failed: ${res.status}`);
}

// uploadImageToDrive のトークン期限切れ対応ラッパー
async function uploadImageWithAutoRefresh(
  token: string,
  file: File,
  fileName: string
): Promise<void> {
  try {
    await uploadImageToDrive(token, file, fileName);
  } catch {
    const newToken = await refreshAccessToken();
    if (!newToken) throw new Error('session expired');
    await uploadImageToDrive(newToken, file, fileName);
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
// IndexedDB — 下書き（テキスト＋画像）をiPhone内にローカル保存
// ---------------------------------------------------------------------------

type DraftRecord = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  images: { fileName: string; blob: Blob }[];
  tags?: string[];
};

function openDraftsDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('fusen-drafts', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('drafts');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveDraft(draft: DraftRecord): Promise<void> {
  const db = await openDraftsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', 'readwrite');
    tx.objectStore('drafts').put(draft, draft.id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadAllDrafts(): Promise<DraftRecord[]> {
  const db = await openDraftsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', 'readonly');
    const req = tx.objectStore('drafts').getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}

async function loadDraft(id: string): Promise<DraftRecord | null> {
  const db = await openDraftsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', 'readonly');
    const req = tx.objectStore('drafts').get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function deleteDraft(id: string): Promise<void> {
  const db = await openDraftsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', 'readwrite');
    tx.objectStore('drafts').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
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
  const editorRef = React.useRef<HTMLDivElement>(null);
  const [imageBlobs, setImageBlobs] = useState<Map<string, File>>(new Map());
  const [writeTags, setWriteTags] = useState<string[]>([]);
  const [showTagBar, setShowTagBar] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [showCropModal, setShowCropModal] = useState(false);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [historyNotes, setHistoryNotes] = useState<IphoneNote[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [showMermaidModal, setShowMermaidModal] = useState(false);
  const [mermaidCode, setMermaidCode] = useState('');
  const [mermaidPreviewSvg, setMermaidPreviewSvg] = useState<string | null>(null);
  const [mermaidPreviewError, setMermaidPreviewError] = useState<string | null>(null);
  const [isMermaidRendering, setIsMermaidRendering] = useState(false);
  const mermaidPreviewRef = React.useRef<HTMLDivElement>(null);
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
    if (step !== 'list') return;
    setIsHistoryLoading(true);
    const draftsPromise = loadAllDrafts().catch(() => [] as DraftRecord[]);
    const sentPromise = accessToken
      ? downloadFromDrive(accessToken, 'fusen_iphone_notes.json')
          .then((data) => (data.notes ?? []) as IphoneNote[])
          .catch(() => [] as IphoneNote[])
      : Promise.resolve([] as IphoneNote[]);
    Promise.all([draftsPromise, sentPromise])
      .then(([drafts, sentNotes]) => {
        const draftNotes: IphoneNote[] = drafts.map((d) => ({
          id: d.id, title: d.title, body: d.body,
          status: 'draft' as const, created_at: d.created_at,
        }));
        const merged = [...draftNotes, ...sentNotes]
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 20);
        setHistoryNotes(merged);
      })
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
                    await uploadWithAutoRefresh(accessToken!, 'fusen_push_config.json', {
                      endpoint,
                      keys,
                    });
                    localStorage.setItem('viewer_push_done', 'true');
                    setStep('write');
                  } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    if (msg === 'session expired') {
                      localStorage.removeItem('viewer_access_token');
                      localStorage.removeItem('viewer_refresh_token');
                      setErrorMessage('セッションが切れました。再度ログインしてください。');
                      setStep('login');
                    } else {
                      setErrorMessage('通知設定に失敗しました: ' + msg);
                    }
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
                {attachedImages.map((img, i) => (
                  <div key={i} className="relative">
                    <img src={img.preview} className="w-16 h-16 object-cover rounded" alt="" />
                    <button
                      className="absolute -top-1 -right-1 w-5 h-5 bg-gray-600 text-white rounded-full text-xs leading-none"
                      onClick={() => {
                        URL.revokeObjectURL(img.preview);
                        setAttachedImages((prev) => prev.filter((_, j) => j !== i));
                      }}
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
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const fileName = buildImageFileName(writeTitle, attachedImages.length + 1);
                  const preview = URL.createObjectURL(file);
                  setAttachedImages((prev) => [...prev, { file, preview, fileName }]);
                  if (textareaRef.current) {
                    const newBody = insertAtCursor(textareaRef.current, `![](${fileName})`);
                    setWriteBody(newBody);
                  }
                  e.target.value = '';
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
                  setIsLoading(true);
                  setErrorMessage(null);
                  try {
                    const draftId = currentDraftId ?? crypto.randomUUID();
                    await saveDraft({
                      id: draftId,
                      title: writeTitle,
                      body: writeBody,
                      created_at: new Date().toISOString(),
                      images: attachedImages.map((img) => ({ fileName: img.fileName, blob: img.file })),
                    });
                    attachedImages.forEach((img) => URL.revokeObjectURL(img.preview));
                    setAttachedImages([]);
                    setCurrentDraftId(null);
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
                  // 送信前にトークンの有効期限を確認し、切れていたら自動更新
                  let token = accessToken;
                  const expiresAt = parseInt(localStorage.getItem('viewer_expires_at') || '0');
                  if (Date.now() > expiresAt - 5 * 60 * 1000) {
                    const newToken = await refreshAccessToken();
                    if (!newToken) {
                      localStorage.removeItem('viewer_access_token');
                      localStorage.removeItem('viewer_refresh_token');
                      setErrorMessage('セッションが切れました。再度ログインしてください。');
                      setStep('login');
                      setIsLoading(false);
                      return;
                    }
                    token = newToken;
                    setAccessToken(newToken);
                  }
                  try {
                    const noteId = crypto.randomUUID();
                    const sentAt = new Date().toISOString();
                    for (const img of attachedImages) {
                      await uploadImageWithAutoRefresh(token, img.file, img.fileName);
                    }
                    const fullBody = writeBody;
                    await uploadWithAutoRefresh(token, 'fusen_from_iphone.json', {
                      id: noteId,
                      title: writeTitle,
                      body: fullBody,
                      sent_at: sentAt,
                    });
                    const note: IphoneNote = {
                      id: noteId,
                      status: 'sent',
                      title: writeTitle,
                      body: writeBody,
                      created_at: sentAt,
                      sent_at: sentAt,
                    };
                    await saveToHistory(token, note);
                    setWriteTitle('');
                    setWriteBody('');
                    attachedImages.forEach((img) => URL.revokeObjectURL(img.preview));
                    setAttachedImages([]);
                    if (currentDraftId) {
                      await deleteDraft(currentDraftId).catch(() => {});
                      setCurrentDraftId(null);
                    }
                    setSendSuccess(true);
                    setTimeout(() => setSendSuccess(false), 3000);
                  } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    if (msg === 'session expired') {
                      localStorage.removeItem('viewer_access_token');
                      localStorage.removeItem('viewer_refresh_token');
                      setErrorMessage('セッションが切れました。再度ログインしてください。');
                      setStep('login');
                    } else {
                      setErrorMessage('送信に失敗しました: ' + msg);
                    }
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
                      onClick={async () => {
                        if (note.status !== 'draft') return;
                        setWriteTitle(note.title);
                        setWriteBody(note.body);
                        setCurrentDraftId(note.id);
                        const draft = await loadDraft(note.id).catch(() => null);
                        if (draft && draft.images.length > 0) {
                          setAttachedImages(draft.images.map(({ fileName, blob }) => ({
                            file: new File([blob], fileName, { type: 'image/jpeg' }),
                            preview: URL.createObjectURL(blob),
                            fileName,
                          })));
                        } else {
                          setAttachedImages([]);
                        }
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
