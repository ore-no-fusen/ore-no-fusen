'use client';

import React, { useState, useEffect } from 'react';
import { SimpleNoteBody } from './SimpleNoteBody';
import { formatRelativeTime, insertAtCursor } from './utils';
import { getTranslation, type Language } from '@/lib/i18n';

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

import { serializeEditor, hydrateEditor, loadKnownTags, mergeKnownTags } from './editor-helpers';

function buildImageFileName(title: string, index: number): string {
  const now = new Date();
  const date = now.toLocaleDateString('sv').replace(/-/g, '');
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const ctx = title.trim().replace(/[^\w\u3000-\u9fff\u30a0-\u30ff\u3040-\u309f]/g, '').slice(0, 10);
  return ctx
    ? `fusen_img_${date}_${time}_${ctx}_${index}.jpg`
    : `fusen_img_${date}_${time}_${index}.jpg`;
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
let cachedFolderId: string | null = null;

// 旧ファイル名 → 新ファイル名の移行マップ
const LEGACY_FILE_NAMES: Record<string, string> = {
  'notes_to_iphone.json': 'notes_to_iphone.json',
  'push_devices.json': 'push_devices.json',
  'notes_from_iphone.json': 'notes_from_iphone.json',
};


async function getAppFolderId(accessToken: string): Promise<string | null> {
  if (cachedFolderId !== null) return cachedFolderId;
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${APP_FOLDER_NAME}'+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  if (data.files?.[0]?.id) {
    cachedFolderId = data.files[0].id as string;
    return cachedFolderId;
  }
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
  cachedFolderId = created.id as string;
  return cachedFolderId;
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
  let fileId = searchData.files?.[0]?.id;

  // 新ファイル名で見つからなければ旧ファイル名にフォールバック（移行対応）
  if (!fileId && LEGACY_FILE_NAMES[fileName]) {
    const legacyName = LEGACY_FILE_NAMES[fileName];
    const legacyRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${legacyName}'${folderQuery}+and+trashed=false`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const legacyData = await legacyRes.json();
    fileId = legacyData.files?.[0]?.id;
    if (fileId) {
      const content = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      ).then(r => r.json());
      // 新名に移行（バックグラウンド・失敗しても無視）
      uploadToDrive(accessToken, fileName, content).catch(() => {});
      return content;
    }
  }

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
  status: 'sent' | 'draft' | 'received_pc';
  title: string;
  body: string;
  created_at: string;
  sent_at?: string;
  tags?: string[];
};

type PendingHydrate = {
  markdown: string;
  blobMap: Map<string, File>;
  draftId: string | null;
  tags: string[];
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


// 画像をリサイズして base64 文字列に変換
// Drive ダウンロード（トークン期限切れ時に自動リフレッシュ）
function downloadWithAutoRefresh(token: string): Promise<{ title: string; body: string }> {
  return downloadFromDrive(token, 'notes_to_iphone.json').catch(() =>
    refreshAccessToken().then((newToken) => {
      if (!newToken) throw new Error('session expired');
      return downloadFromDrive(newToken, 'notes_to_iphone.json');
    })
  );
}

type FusenNoteItem = {
  id: string;
  title: string;
  body: string;
  sent_at: string;
  received_at: string | null;
};

async function downloadFusenNoteItems(token: string): Promise<FusenNoteItem[]> {
  const data = await downloadFromDrive(token, 'notes_to_iphone.json').catch(() =>
    refreshAccessToken().then((t) => {
      if (!t) throw new Error('session expired');
      return downloadFromDrive(t, 'notes_to_iphone.json');
    })
  );
  if (Array.isArray(data?.items)) {
    return data.items.filter((item: FusenNoteItem) => item.received_at == null);
  }
  // 旧スキーマ（単体オブジェクト）互換
  if (data?.title || data?.body) {
    return [{
      id: data.sent_at ?? 'legacy',
      title: data.title ?? '',
      body: data.body ?? '',
      sent_at: data.sent_at ?? '',
      received_at: null,
    }];
  }
  return [];
}

// ---------------------------------------------------------------------------
// IndexedDB — {t('pwa.statusDraft')}（テキスト＋画像）をiPhone内にローカル保存
// ---------------------------------------------------------------------------

type DraftRecord = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  images: { fileName: string; blob: Blob }[];
  tags?: string[];
  received_pc?: true;
  sent_at?: string;
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
// CropModal: Canvas API + touch/mouse でクロップ矩形を操作
// ---------------------------------------------------------------------------

type CropModalProps = {
  file: File;
  onCancel: () => void;
  onCrop: (blob: Blob) => void;
};

function CropModal({ file, onCancel, onCrop }: CropModalProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [imgEl, setImgEl] = React.useState<HTMLImageElement | null>(null);
  // クロップ矩形: 画像座標系 (0〜1 の正規化)
  const [crop, setCrop] = React.useState({ x: 0, y: 0, w: 1, h: 1 });
  const dragging = React.useRef<{ type: 'move' | 'tl'|'tr'|'bl'|'br'|'t'|'b'|'l'|'r'; startX: number; startY: number; startCrop: typeof crop } | null>(null);

  // 画像を読み込んで canvas に描画
  React.useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setImgEl(img);
    };
    img.src = URL.createObjectURL(file);
    return () => URL.revokeObjectURL(img.src);
  }, [file]);

  React.useEffect(() => {
    if (!imgEl || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // canvas サイズ = 表示サイズに合わせる
    const maxW = Math.min(window.innerWidth - 32, 400);
    const scale = maxW / imgEl.naturalWidth;
    canvas.width = imgEl.naturalWidth * scale;
    canvas.height = imgEl.naturalHeight * scale;
    // 画像描画
    ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height);
    // クロップ矩形描画
    const rx = crop.x * canvas.width;
    const ry = crop.y * canvas.height;
    const rw = crop.w * canvas.width;
    const rh = crop.h * canvas.height;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.clearRect(rx, ry, rw, rh);
    ctx.drawImage(imgEl, rx / scale, ry / scale, rw / scale, rh / scale, rx, ry, rw, rh);
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.strokeRect(rx, ry, rw, rh);
    // 4隅ハンドル
    const hs = 12;
    ctx.fillStyle = '#3b82f6';
    [[rx, ry],[rx+rw-hs, ry],[rx, ry+rh-hs],[rx+rw-hs, ry+rh-hs]].forEach(([hx, hy]) => {
      ctx.fillRect(hx, hy, hs, hs);
    });
  }, [imgEl, crop]);

  function getRelativePos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    return {
      nx: (clientX - rect.left) / rect.width,
      ny: (clientY - rect.top) / rect.height,
    };
  }

  function hitHandle(nx: number, ny: number): 'tl'|'tr'|'bl'|'br'|'move'|null {
    const hs = 0.04; // normalized handle size
    const { x, y, w, h } = crop;
    if (Math.abs(nx - x) < hs && Math.abs(ny - y) < hs) return 'tl';
    if (Math.abs(nx - (x+w)) < hs && Math.abs(ny - y) < hs) return 'tr';
    if (Math.abs(nx - x) < hs && Math.abs(ny - (y+h)) < hs) return 'bl';
    if (Math.abs(nx - (x+w)) < hs && Math.abs(ny - (y+h)) < hs) return 'br';
    if (nx > x && nx < x+w && ny > y && ny < y+h) return 'move';
    return null;
  }

  function onPointerDown(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!canvasRef.current) return;
    const { nx, ny } = getRelativePos(e, canvasRef.current);
    const type = hitHandle(nx, ny);
    if (!type) return;
    dragging.current = { type, startX: nx, startY: ny, startCrop: { ...crop } };
  }

  function onPointerMove(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!dragging.current || !canvasRef.current) return;
    const { nx, ny } = getRelativePos(e, canvasRef.current);
    const dx = nx - dragging.current.startX;
    const dy = ny - dragging.current.startY;
    const sc = dragging.current.startCrop;
    let { x, y, w, h } = sc;
    const minSize = 0.05;
    if (dragging.current.type === 'move') {
      x = Math.max(0, Math.min(1 - w, sc.x + dx));
      y = Math.max(0, Math.min(1 - h, sc.y + dy));
    } else if (dragging.current.type === 'tl') {
      x = Math.min(sc.x + dx, sc.x + sc.w - minSize);
      y = Math.min(sc.y + dy, sc.y + sc.h - minSize);
      w = sc.w - (x - sc.x);
      h = sc.h - (y - sc.y);
    } else if (dragging.current.type === 'tr') {
      y = Math.min(sc.y + dy, sc.y + sc.h - minSize);
      w = Math.max(minSize, sc.w + dx);
      h = sc.h - (y - sc.y);
    } else if (dragging.current.type === 'bl') {
      x = Math.min(sc.x + dx, sc.x + sc.w - minSize);
      w = sc.w - (x - sc.x);
      h = Math.max(minSize, sc.h + dy);
    } else if (dragging.current.type === 'br') {
      w = Math.max(minSize, sc.w + dx);
      h = Math.max(minSize, sc.h + dy);
    }
    // 境界クランプ
    x = Math.max(0, x);
    y = Math.max(0, y);
    w = Math.min(w, 1 - x);
    h = Math.min(h, 1 - y);
    setCrop({ x, y, w, h });
  }

  function onPointerUp() {
    dragging.current = null;
  }

  function handleCrop() {
    if (!imgEl) return;
    const offscreen = document.createElement('canvas');
    const sx = crop.x * imgEl.naturalWidth;
    const sy = crop.y * imgEl.naturalHeight;
    const sw = crop.w * imgEl.naturalWidth;
    const sh = crop.h * imgEl.naturalHeight;
    // 長辺 800px に収める
    const maxDim = 800;
    const scale = Math.min(1, maxDim / Math.max(sw, sh));
    offscreen.width = sw * scale;
    offscreen.height = sh * scale;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(imgEl, sx, sy, sw, sh, 0, 0, offscreen.width, offscreen.height);
    offscreen.toBlob(
      (blob) => { if (blob) onCrop(blob); },
      'image/jpeg',
      0.85
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900">
        <button className="text-gray-300 text-sm" onClick={onCancel}>キャンセル</button>
        <span className="text-white font-semibold text-sm">トリミング</span>
        <button className="text-blue-400 text-sm font-medium" onClick={handleCrop}>貼り付け</button>
      </div>
      <div className="flex-1 flex items-center justify-center p-4">
        <canvas
          ref={canvasRef}
          className="touch-none max-w-full"
          style={{ cursor: 'crosshair' }}
          onMouseDown={onPointerDown}
          onMouseMove={onPointerMove}
          onMouseUp={onPointerUp}
          onTouchStart={onPointerDown}
          onTouchMove={onPointerMove}
          onTouchEnd={onPointerUp}
        />
      </div>
      <p className="text-center text-gray-400 text-xs pb-4">
        ドラッグで範囲を調整 / 隅のハンドルでリサイズ
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ViewerPage コンポーネント
// ---------------------------------------------------------------------------

export default function ViewerPage() {
  const [lang, setLang] = useState<Language>('ja');
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const browserLang = navigator.language.startsWith('ja') ? 'ja' : 'en';
      setLang(browserLang);
    }
  }, []);
  const t = getTranslation(lang);

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
  const [knownTags, setKnownTags] = useState<string[]>([]);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [showCropModal, setShowCropModal] = useState(false);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [isSendingInBackground, setIsSendingInBackground] = useState(false);
  const [backgroundSendSuccess, setBackgroundSendSuccess] = useState(false);
  const [backgroundSendError, setBackgroundSendError] = useState<string | null>(null);
  const [historyNotes, setHistoryNotes] = useState<IphoneNote[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [thumbnailUrls, setThumbnailUrls] = useState<Map<string, string>>(new Map());
  const [activeNotifIds, setActiveNotifIds] = useState<string[]>([]);
  const [showMermaidModal, setShowMermaidModal] = useState(false);
  const [mermaidCode, setMermaidCode] = useState('');
  const [mermaidPreviewSvg, setMermaidPreviewSvg] = useState<string | null>(null);
  const [mermaidPreviewError, setMermaidPreviewError] = useState<string | null>(null);
  const [isMermaidRendering, setIsMermaidRendering] = useState(false);
  const mermaidPreviewRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [pendingHydrate, setPendingHydrate] = useState<PendingHydrate | null>(null);

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
      downloadFusenNoteItems(token)
        .then(async (items) => {
          // 全未読を IndexedDB に一括保存
          for (const item of items) {
            await saveDraft({
              id: item.id,
              title: item.title,
              body: item.body,
              created_at: item.sent_at,
              images: [],
              tags: [],
              received_pc: true,
            });
          }
          // タップされた note_id のノートを write に直接表示
          const tappedId = new URLSearchParams(window.location.search).get('note');
          const tapped = items.find((item) => item.id === tappedId) ?? items[0];
          if (tapped) {
            const titleLine = tapped.title ? `${tapped.title}\n` : '';
            setPendingHydrate({
              markdown: titleLine + tapped.body,
              blobMap: new Map(),
              draftId: tapped.id,
              tags: [],
            });
          }
          setStep('write');
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
      downloadFusenNoteItems(token)
        .then(async (items) => {
          // 全未読を IndexedDB に一括保存
          for (const item of items) {
            await saveDraft({
              id: item.id,
              title: item.title,
              body: item.body,
              created_at: item.sent_at,
              images: [],
              tags: [],
              received_pc: true,
            });
          }
          // pending_note の note_id のノートを write に直接表示
          const tapped = items.find((item) => item.id === pendingNote) ?? items[0];
          if (tapped) {
            const titleLine = tapped.title ? `${tapped.title}\n` : '';
            setPendingHydrate({
              markdown: titleLine + tapped.body,
              blobMap: new Map(),
              draftId: tapped.id,
              tags: [],
            });
          }
          setStep('write');
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
      })
      .finally(() => setIsHistoryLoading(false));
    return () => { thumbUrls.forEach((u) => URL.revokeObjectURL(u)); };
  }, [step]);

  // pendingHydrate: list→write 遷移後に editorRef がマウントされてから hydrateEditor を呼ぶ
  useEffect(() => {
    if (!pendingHydrate) return;
    const run = () => {
      if (!editorRef.current) return;
      hydrateEditor(editorRef.current, pendingHydrate.markdown, pendingHydrate.blobMap);
      setImageBlobs(pendingHydrate.blobMap);
      setCurrentDraftId(pendingHydrate.draftId);
      setWriteTags(pendingHydrate.tags);
      setShowTagBar(pendingHydrate.tags.length > 0);
      setPendingHydrate(null);
    };
    const t = setTimeout(run, 50);
    return () => clearTimeout(t);
  }, [pendingHydrate]);

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
      {/* バックグラウンド送信トースト */}
      {isSendingInBackground && (
        <div className="fixed top-4 right-4 bg-blue-500 text-white text-sm px-3 py-2 rounded shadow z-50">
          {t('pwa.sending')}
        </div>
      )}
      {backgroundSendSuccess && (
        <div className="fixed top-4 right-4 bg-green-500 text-white text-sm px-3 py-2 rounded shadow z-50">
          送信しました ✓
        </div>
      )}
      {backgroundSendError && (
        <div className="fixed top-4 right-4 bg-red-500 text-white text-sm px-3 py-2 rounded shadow z-50">
          {backgroundSendError}
        </div>
      )}
      <div className="max-w-prose mx-auto w-full">
        {step === 'login' && (
          <div className="flex flex-col items-center gap-4">
            <p className="text-gray-700">{t('pwa.loginTitle')}</p>
            <p className="text-gray-500 text-sm max-w-sm text-center mt-2">{t('pwa.loginDesc')}</p>
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
              {t('pwa.loginButton')}
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
                    // デバイスIDを生成・永続化（このデバイスを一意に識別するため）
                    let deviceId = localStorage.getItem('viewer_device_id');
                    if (!deviceId) {
                      deviceId = crypto.randomUUID();
                      localStorage.setItem('viewer_device_id', deviceId);
                    }
                    // 既存デバイスリストを取得してupsert（新スキーマ対応、旧スキーマは自動移行）
                    const existing = await downloadFromDrive(accessToken!, 'push_devices.json')
                      .catch(() => ({}));
                    const existingDevices: any[] = existing?.devices ?? (
                      // 旧スキーマ（endpoint直下）があれば移行する
                      existing?.endpoint ? [{ device_id: 'legacy', endpoint: existing.endpoint, keys: existing.keys, registered_at: new Date().toISOString() }] : []
                    );
                    const updatedDevices = [
                      ...existingDevices.filter((d: any) => d.device_id !== deviceId),
                      { device_id: deviceId, endpoint, keys, registered_at: new Date().toISOString() },
                    ];
                    await uploadWithAutoRefresh(accessToken!, 'push_devices.json', {
                      devices: updatedDevices,
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
                {isLoading ? t('pwa.saving') : '通知を許可する'}
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
                📋 {t('pwa.listTitle')}
              </button>
              <span className="font-semibold text-gray-900">{t('pwa.newNote')}</span>
              <div className="flex justify-end items-center gap-0 p-1">
                <button
                  className="min-w-[32px] px-2 py-1 hover:bg-gray-100 text-gray-700 rounded text-sm"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="画像を追加"
                  title="画像"
                >
                  📷
                </button>
                <button
                  className="min-w-[32px] px-2 py-1 hover:bg-gray-100 text-gray-700 rounded text-sm"
                  onClick={() => setShowMermaidModal(true)}
                  aria-label="Mermaidを追加"
                  title="Mermaid"
                >
                  🔷
                </button>
                <button
                  className="min-w-[32px] px-2 py-1 hover:bg-gray-100 text-gray-700 rounded text-sm"
                  onClick={() => {
                    const editor = editorRef.current;
                    if (!editor) return;
                    const sel = window.getSelection();
                    if (!sel || sel.rangeCount === 0 || !editor.contains(sel.getRangeAt(0).commonAncestorContainer)) {
                      editor.focus();
                    }
                    // カーソルのある行の editorRef 直下ノードを特定
                    const currentSel = window.getSelection();
                    let lineNode: Node | null = null;
                    if (currentSel && currentSel.rangeCount > 0) {
                      let node: Node = currentSel.getRangeAt(0).startContainer;
                      while (node.parentNode && node.parentNode !== editor) {
                        node = node.parentNode;
                      }
                      if (node.parentNode === editor) lineNode = node;
                    }
                    // チェックボックス wrapper を作成
                    const wrapper = document.createElement('span');
                    wrapper.setAttribute('data-checkbox-line', '');
                    const cb = document.createElement('input');
                    cb.type = 'checkbox';
                    cb.setAttribute('contenteditable', 'false');
                    cb.style.cssText = 'margin-right:4px;pointer-events:auto;vertical-align:middle;';
                    cb.addEventListener('mousedown', (e) => e.preventDefault());
                    cb.addEventListener('click', (e) => e.stopPropagation());
                    wrapper.appendChild(cb);
                    if (lineNode && lineNode.parentNode === editor && lineNode.nodeName !== 'BR') {
                      // 既存行ノードの子を wrapper に移動（テキストを保持したまま置き換え）
                      while (lineNode.firstChild) {
                        wrapper.appendChild(lineNode.firstChild);
                      }
                      editor.replaceChild(wrapper, lineNode);
                    } else {
                      // 空行または新規: wrapper + br を追加
                      wrapper.appendChild(document.createTextNode(''));
                      if (lineNode) {
                        editor.insertBefore(wrapper, lineNode);
                      } else {
                        editor.appendChild(wrapper);
                        editor.appendChild(document.createElement('br'));
                      }
                    }
                    // カーソルを wrapper 末尾に配置
                    const range = document.createRange();
                    range.selectNodeContents(wrapper);
                    range.collapse(false);
                    currentSel?.removeAllRanges();
                    currentSel?.addRange(range);
                  }}
                  aria-label="チェックボックスを追加"
                  title="チェックボックス"
                >
                  ☑
                </button>
                <button
                  className={`min-w-[32px] px-2 py-1 rounded text-sm ${
                    showTagBar ? 'bg-gray-200 text-gray-900' : 'hover:bg-gray-100 text-gray-700'
                  }`}
                  onClick={() => {
                    if (!showTagBar) {
                      setKnownTags(loadKnownTags());
                    }
                    setShowTagBar((prev) => !prev);
                  }}
                  aria-label="タグ"
                  title="タグ"
                >
                  🏷️
                </button>
              </div>
            </div>

            {/* contenteditable エディタ */}
            <div
              ref={editorRef}
              contentEditable="true"
              suppressContentEditableWarning
              className="flex-1 px-4 py-3 text-base outline-none overflow-y-auto min-h-[200px] focus:outline-none"
              data-placeholder="メモを書く..."
              style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
            />

            {/* タグバー */}
            {showTagBar && (
              <div className="px-4 py-2 border-t border-gray-100 flex flex-wrap gap-2 items-center">
                {writeTags.map((tag, i) => (
                  <span
                    key={i}
                    className="flex items-center gap-1 bg-blue-100 text-blue-800 text-sm rounded-full px-3 py-1"
                  >
                    {tag}
                    <button
                      className="text-blue-500 hover:text-blue-700 leading-none"
                      onClick={() => setWriteTags((prev) => prev.filter((_, j) => j !== i))}
                      aria-label={`タグ ${tag} を削除`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && tagInput.trim()) {
                      e.preventDefault();
                      const newTag = tagInput.trim();
                      if (!writeTags.includes(newTag)) {
                        setWriteTags((prev) => [...prev, newTag]);
                      }
                      setTagInput('');
                    }
                  }}
                  placeholder="タグを入力（Enter で追加）"
                  className="text-sm outline-none border-b border-gray-300 focus:border-blue-400 min-w-[120px] flex-1"
                />
                {/* サジェスト候補 */}
                {(() => {
                  const filtered = knownTags
                    .filter((t) => !writeTags.includes(t) && t.includes(tagInput))
                    .slice(0, 10);
                  if (filtered.length === 0) return null;
                  return (
                    <div className="w-full flex flex-wrap gap-1 mt-1">
                      {filtered.map((t) => (
                        <span
                          key={t}
                          className="flex items-center gap-0.5 bg-gray-100 text-gray-700 text-xs rounded-full pl-2 pr-1 py-0.5"
                        >
                          <button
                            type="button"
                            className="hover:text-blue-700"
                            onClick={() => {
                              if (!writeTags.includes(t)) {
                                setWriteTags((prev) => [...prev, t]);
                              }
                              setTagInput('');
                            }}
                          >
                            {t}
                          </button>
                          <button
                            type="button"
                            className="text-gray-400 hover:text-red-500 leading-none"
                            aria-label={`候補 ${t} を削除`}
                            onClick={() => {
                              const updated = knownTags.filter((k) => k !== t);
                              localStorage.setItem('fusen_known_tags', JSON.stringify(updated));
                              setKnownTags(updated);
                            }}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setCropFile(file);
                setShowCropModal(true);
                e.target.value = '';
              }}
            />

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
                  if (!editorRef.current) return;
                  setIsLoading(true);
                  setErrorMessage(null);
                  try {
                    const rawText = serializeEditor(editorRef.current);
                    const { title, body } = extractTitleBody(rawText);
                    const draftId = currentDraftId ?? crypto.randomUUID();
                    const imagesArr = Array.from(imageBlobs.entries()).map(([fileName, file]) => ({ fileName, blob: file }));
                    mergeKnownTags(writeTags);
                    await saveDraft({
                      id: draftId,
                      title,
                      body,
                      created_at: new Date().toISOString(),
                      images: imagesArr,
                      tags: writeTags,
                    });
                    setImageBlobs(new Map());
                    setWriteTags([]);
                    setShowTagBar(false);
                    setTagInput('');
                    setCurrentDraftId(null);
                    setPendingHydrate({ markdown: '', blobMap: new Map(), draftId: null, tags: [] });
                  } catch (err: unknown) {
                    setErrorMessage('保存に失敗しました: ' + (err instanceof Error ? err.message : String(err)));
                  } finally {
                    setIsLoading(false);
                  }
                }}
              >
                新規付箋
              </button>
              <button
                className="flex-1 py-3 rounded-lg bg-blue-600 text-white font-medium disabled:opacity-40"
                disabled={isSendingInBackground}
                onClick={() => {
                  if (!accessToken || !editorRef.current) return;
                  // クリア前にデータをキャプチャ
                  const rawText = serializeEditor(editorRef.current);
                  const capturedTags = [...writeTags];
                  const capturedBlobs = new Map(imageBlobs);
                  const capturedDraftId = currentDraftId;
                  const capturedToken = accessToken;
                  // UIを即クリア
                  editorRef.current.innerHTML = '';
                  setImageBlobs(new Map());
                  setWriteTags([]);
                  setShowTagBar(false);
                  setTagInput('');
                  setCurrentDraftId(null);
                  // バックグラウンド送信開始
                  setIsSendingInBackground(true);
                  setBackgroundSendError(null);
                  (async () => {
                    try {
                      // トークン有効期限確認・自動更新
                      let token = capturedToken;
                      const expiresAt = parseInt(localStorage.getItem('viewer_expires_at') || '0');
                      if (Date.now() > expiresAt - 5 * 60 * 1000) {
                        const newToken = await refreshAccessToken();
                        if (!newToken) {
                          localStorage.removeItem('viewer_access_token');
                          localStorage.removeItem('viewer_refresh_token');
                          setIsSendingInBackground(false);
                          setBackgroundSendError('セッションが切れました。再度ログインしてください。');
                          setTimeout(() => setBackgroundSendError(null), 5000);
                          setStep('login');
                          return;
                        }
                        token = newToken;
                        setAccessToken(newToken);
                      }
                      mergeKnownTags(capturedTags);
                      const { title, body: extractedBody } = extractTitleBody(rawText);
                      const noteId = crypto.randomUUID();
                      const sentAt = new Date().toISOString();
                      await Promise.all(
                        Array.from(capturedBlobs.entries()).map(([fileName, file]) =>
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
                        tags: capturedTags,
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
                      const processed = currentItems
                        .filter((item: any) => item.received_at)
                        .slice(-5);
                      const pending = currentItems.filter((item: any) => !item.received_at);
                      // 新しいアイテムを末尾に追加
                      const newItem = {
                        id: noteId,
                        title,
                        body: fullBody,
                        sent_at: sentAt,
                        tags: capturedTags,
                      };
                      const updatedItems = [...processed, ...pending, newItem];
                      await uploadWithAutoRefresh(token, 'notes_from_iphone.json', { items: updatedItems });
                      // 送信済みとして IndexedDB に保存（sent_at をセット）
                      await saveDraft({
                        id: capturedDraftId ?? noteId,
                        title,
                        body: fullBody,
                        created_at: sentAt,
                        images: Array.from(capturedBlobs.entries()).map(([fileName, file]) => ({ fileName, blob: file })),
                        tags: capturedTags,
                        sent_at: sentAt,
                      });
                      setIsSendingInBackground(false);
                      setBackgroundSendSuccess(true);
                      setTimeout(() => setBackgroundSendSuccess(false), 3000);
                    } catch (err: unknown) {
                      const msg = err instanceof Error
                        ? (err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : err.message)
                        : String(err);
                      setIsSendingInBackground(false);
                      if (msg.includes('session expired')) {
                        localStorage.removeItem('viewer_access_token');
                        localStorage.removeItem('viewer_refresh_token');
                        setBackgroundSendError('セッションが切れました。再度ログインしてください。');
                        setTimeout(() => setBackgroundSendError(null), 5000);
                        setStep('login');
                      } else {
                        setBackgroundSendError('送信失敗: ' + msg);
                        setTimeout(() => setBackgroundSendError(null), 5000);
                      }
                    }
                  })();
                }}
              >
                {isSendingInBackground ? t('pwa.sending') : 'PCに送る'}
              </button>
            </div>

            {/* クロップモーダル */}
            {showCropModal && cropFile && (
              <CropModal
                file={cropFile}
                onCancel={() => {
                  setShowCropModal(false);
                  setCropFile(null);
                }}
                onCrop={(croppedBlob) => {
                  const title = editorRef.current
                    ? extractTitleBody(serializeEditor(editorRef.current)).title
                    : '';
                  const fileName = buildImageFileName(title, imageBlobs.size + 1);
                  const file = new File([croppedBlob], fileName, { type: 'image/jpeg' });
                  setImageBlobs((prev) => new Map(prev).set(fileName, file));
                  const img = document.createElement('img');
                  img.src = URL.createObjectURL(croppedBlob);
                  img.setAttribute('data-filename', fileName);
                  img.style.cssText = 'max-height:80px;border-radius:4px;margin:2px 0;display:block;';
                  if (editorRef.current) {
                    editorRef.current.focus();
                    const sel = window.getSelection();
                    if (sel && sel.rangeCount > 0 && editorRef.current.contains(sel.anchorNode)) {
                      insertNodeAtCursor(img);
                    } else {
                      editorRef.current.appendChild(img);
                      editorRef.current.appendChild(document.createTextNode('\n'));
                    }
                  }
                  setShowCropModal(false);
                  setCropFile(null);
                }}
              />
            )}

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
                      if (!mermaidCode.trim()) return;
                      if (mermaidPreviewSvg && editorRef.current) {
                        // SVG をインライン挿入
                        const wrapper = document.createElement('div');
                        wrapper.setAttribute('data-mermaid-code', mermaidCode);
                        wrapper.style.cssText = 'display:block;margin:4px 0;max-width:100%;overflow-x:auto;';
                        wrapper.innerHTML = mermaidPreviewSvg;
                        editorRef.current.focus();
                        insertNodeAtCursor(wrapper);
                      } else {
                        // プレビューなしの場合はコードテキストを挿入
                        const block = `\`\`\`mermaid\n${mermaidCode}\n\`\`\``;
                        insertTextAtCursor(block);
                      }
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
              <span className="font-semibold text-gray-900">{t('pwa.listTitle')}</span>
              <button
                className="min-w-[32px] px-2 py-1 hover:bg-gray-100 text-gray-700 rounded text-lg font-medium"
                aria-label="新規作成"
                onClick={() => {
                  setPendingHydrate({ markdown: '', blobMap: new Map(), draftId: null, tags: [] });
                  setStep('write');
                }}
              >
                ＋
              </button>
            </div>

            {/* コンテンツ */}
            <div className="flex-1 overflow-y-auto">
              {isHistoryLoading ? (
                <p className="text-center text-gray-400 py-8 text-sm">読み込み中...</p>
              ) : historyNotes.length === 0 ? (
                <p className="text-center text-gray-400 py-8 text-sm">{t('pwa.emptyList')}</p>
              ) : (
                <ul>
                  {historyNotes.map((note) => (
                    <li
                      key={note.id}
                      className="border-b border-gray-100 cursor-pointer active:bg-gray-50 flex items-stretch gap-0 overflow-hidden"
                      onClick={async () => {
                        const draft = await loadDraft(note.id).catch(() => null);
                        const blobMap = new Map<string, File>();
                        if (draft?.images && draft.images.length > 0) {
                          for (const { fileName, blob } of draft.images) {
                            blobMap.set(fileName, new File([blob], fileName, { type: 'image/jpeg' }));
                          }
                        }
                        const fullText = note.title
                          ? (note.body ? `${note.title}\n${note.body}` : note.title)
                          : (note.body ?? '');
                        setPendingHydrate({ markdown: fullText, blobMap, draftId: note.id, tags: note.tags ?? [] });
                        setStep('write');
                      }}
                    >
                      <div className={`w-1 flex-shrink-0 ${note.status === 'sent' ? 'bg-blue-500' : note.status === 'received_pc' ? 'bg-blue-300' : 'bg-yellow-400'}`} />
                      <div className="flex-1 min-w-0 px-3 py-3">
                        <div className="flex items-start gap-2">
                          {thumbnailUrls.get(note.id) && (
                            <img src={thumbnailUrls.get(note.id)} alt="" className="w-10 h-10 object-cover rounded flex-shrink-0" />
                          )}
                          <p className="text-sm text-gray-700 line-clamp-3 whitespace-pre-wrap">
                            {(((note.title ? note.title + '\n' : '') + (note.body ?? '')).replace(/!\[.*?\]\(.*?\)/g, '').replace(/\n\n+/g, '\n').trim().slice(0, 120)) || '（空のメモ）'}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end justify-between py-2 pr-2 flex-shrink-0">
                        <div className="flex flex-col items-end gap-0.5">
                          <span
                            className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                              note.status === 'sent'
                                ? 'bg-blue-500 text-white'
                                : note.status === 'received_pc'
                                ? 'bg-blue-100 text-blue-600'
                                : 'bg-yellow-400 text-gray-800'
                            }`}
                          >
                            {note.status === 'sent'
                              ? t('pwa.statusSent')
                              : note.status === 'received_pc'
                              ? 'PC受信'
                              : t('pwa.statusDraft')}
                          </span>
                          <span className="text-xs text-gray-400">
                            {note.created_at ? (() => { try { return formatRelativeTime(note.created_at); } catch { return ''; } })() : ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-0">
                          {note.status === 'received_pc' && activeNotifIds.includes(note.id) && (
                            <button
                              className="p-2 text-gray-400 hover:text-blue-500"
                              aria-label="通知を削除"
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  const reg = await navigator.serviceWorker.ready;
                                  reg.active?.postMessage({ type: 'CLOSE_NOTIFICATION', tag: 'fusen-' + note.id });
                                  setActiveNotifIds((prev) => prev.filter((id) => id !== note.id));
                                } catch {
                                  // エラー無視
                                }
                              }}
                            >
                              🔕
                            </button>
                          )}
                          {(note.status === 'draft' || note.status === 'received_pc' || note.status === 'sent') && (
                            <button
                              className="p-2 text-gray-400 hover:text-red-500"
                              aria-label="削除"
                              onClick={async (e) => {
                                e.stopPropagation();
                                setIsLoading(true);
                                try {
                                  if (note.status === 'sent') {
                                    await deleteDraft(note.id);
                                    setHistoryNotes((prev) => prev.filter((n) => n.id !== note.id));
                                  } else {
                                    await deleteDraft(note.id);
                                    if (note.status === 'received_pc') {
                                      // Drive の notes_to_iphone.json からも削除
                                      const driveData = await downloadFromDrive(accessToken!, 'notes_to_iphone.json').catch(() => ({ items: [] }));
                                      const updatedItems = (driveData.items ?? []).filter((item: { id: string }) => item.id !== note.id);
                                      await uploadWithAutoRefresh(accessToken!, 'notes_to_iphone.json', { items: updatedItems });
                                      // 通知も閉じる
                                      const reg = await navigator.serviceWorker.ready;
                                      reg.active?.postMessage({ type: 'CLOSE_NOTIFICATION', tag: 'fusen-' + note.id });
                                      setActiveNotifIds((prev) => prev.filter((id) => id !== note.id));
                                    }
                                    const updatedDrafts = await loadAllDrafts();
                                    setHistoryNotes(
                                      updatedDrafts
                                        .map((d) => ({
                                          id: d.id, title: d.title, body: d.body,
                                          status: d.sent_at ? ('sent' as const) : d.received_pc ? ('received_pc' as const) : ('draft' as const),
                                          created_at: d.created_at, tags: d.tags,
                                        }))
                                        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                                        .slice(0, 20)
                                    );
                                  }
                                } catch {
                                  // エラー無視（即削除）
                                } finally {
                                  setIsLoading(false);
                                }
                              }}
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {step === 'note' && noteData && (() => {
          const bodyLines = noteData.body.split('\n');
          const firstLine = bodyLines[0] ?? '';
          const noteTitle = firstLine.startsWith('#')
            ? firstLine.replace(/^#+\s*/, '').trim()
            : noteData.title;
          const noteBody = firstLine.startsWith('#')
            ? bodyLines.slice(1).join('\n').replace(/^\n+/, '')
            : noteData.body;
          return (
          <div>
            <h1 className="text-xl font-bold">{noteTitle}</h1>
            <SimpleNoteBody body={noteBody} />
            <button
              className="mt-6 px-4 py-2 bg-gray-200 text-gray-700 rounded"
              onClick={async () => {
                // 1. 全通知クローズ（タグ指定なし → 全件）
                navigator.serviceWorker.ready.then((reg) => {
                  reg.getNotifications().then((ns) => ns.forEach((n) => n.close()));
                });
                // 2. Drive の notes_to_iphone.json 全 items に received_at を付けて書き戻す
                if (accessToken) {
                  try {
                    const data = await downloadFromDrive(accessToken, 'notes_to_iphone.json');
                    const items = (Array.isArray(data?.items) ? data.items : []).map(
                      (item: FusenNoteItem) => ({
                        ...item,
                        received_at: item.received_at ?? new Date().toISOString(),
                      })
                    );
                    await uploadWithAutoRefresh(accessToken, 'notes_to_iphone.json', { items });
                  } catch { /* エラーは無視 */ }
                }
                // 3. list へ
                setStep('list');
              }}
            >
              通知を消して一覧へ
            </button>
            <p className="text-sm text-gray-400 mt-1">→ 一覧に履歴として残ります</p>
            {errorMessage && (
              <p className="text-red-600 text-sm mt-2">{errorMessage}</p>
            )}
          </div>
          );
        })()}

        {step === 'banner' && isStandalone && (
          <div className="text-center">
            <p className="text-gray-500">読み込み中...</p>
          </div>
        )}
      </div>
    </div>
  );
}
