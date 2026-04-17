// app/viewer/lib/indexeddb.ts
// IndexedDB の CRUD 純粋関数。'use client' / import React は不要。

import type { DraftRecord } from '../types';

/**
 * 責務: fusen-drafts IndexedDB を開く（未作成なら drafts オブジェクトストアを作成する）
 * 入力: なし
 * 出力: Promise<IDBDatabase>
 * 副作用: IndexedDB を開く（初回はスキーマ作成）
 */
export function openDraftsDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('fusen-drafts', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('drafts');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * 責務: 下書きレコードを IndexedDB に保存する（id キーで upsert）
 * 入力: draft: DraftRecord
 * 出力: Promise<void>
 * 副作用: IndexedDB 書き込み（fusen-drafts / drafts）
 */
/** Blob → ArrayBuffer に変換（iOS IndexedDB で Blob が再シリアライズ不可のため） */
async function serializeImages(images: { fileName: string; blob: Blob }[]): Promise<unknown[]> {
  return Promise.all(images.map(async (img: any) => {
    if (img.blob instanceof Blob) {
      const data = await img.blob.arrayBuffer().catch(() => null);
      return data ? { fileName: img.fileName, data, type: img.blob.type || 'image/jpeg' } : null;
    }
    return img; // すでに ArrayBuffer 形式
  })).then((r) => r.filter(Boolean));
}

/** ArrayBuffer → Blob に変換（読み込み時） */
function deserializeImages(images: unknown[]): { fileName: string; blob: Blob }[] {
  return (images || []).map((img: any) => {
    if (img.data instanceof ArrayBuffer) {
      return { fileName: img.fileName, blob: new Blob([img.data], { type: img.type || 'image/jpeg' }) };
    }
    return img; // Blob 形式（後方互換）
  });
}

function nowJSTLocal(): string {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return jst.toISOString().replace('Z', '+09:00');
}

function logToFusenLogs(msg: string): void {
  try {
    const req = indexedDB.open('fusen-logs', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('logs', { autoIncrement: true });
    req.onsuccess = () => {
      const t = nowJSTLocal();
      const tx = req.result.transaction('logs', 'readwrite');
      tx.objectStore('logs').add({ t, msg });
    };
  } catch { /* ignore */ }
}

export async function saveDraft(draft: DraftRecord): Promise<void> {
  const images = await serializeImages(draft.images || []);
  // 既存レコードのlocked状態と比較してログ出力
  const db = await openDraftsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', 'readwrite');
    const getReq = tx.objectStore('drafts').get(draft.id);
    getReq.onsuccess = () => {
      const existing = getReq.result;
      // locked=true が明示的に false にされた場合（intentional unlock）はそのまま通す。
      // unlocked=undefined（Drive マージなど locked を知らないコードパス）の場合は保護する。
      if (existing?.locked && draft.locked === undefined) {
        const stack = new Error().stack?.split('\n').slice(1, 4).join(' | ') ?? '';
        logToFusenLogs(`[saveDraft] locked保護 id=${draft.id.slice(0, 8)} | ${stack}`);
        tx.objectStore('drafts').put({ ...draft, locked: true, images }, draft.id);
      } else {
        tx.objectStore('drafts').put({ ...draft, images }, draft.id);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * 責務: IndexedDB の全下書きを取得する
 * 入力: なし
 * 出力: Promise<DraftRecord[]>
 * 副作用: IndexedDB 読み取り（fusen-drafts / drafts）
 */
export async function loadAllDrafts(): Promise<DraftRecord[]> {
  const db = await openDraftsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', 'readonly');
    const req = tx.objectStore('drafts').getAll();
    req.onsuccess = () => {
      const drafts = (req.result ?? []).map((d: any) => ({ ...d, images: deserializeImages(d.images || []) }));
      resolve(drafts);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * 責務: 指定 id の下書きを IndexedDB から取得する
 * 入力: id: string
 * 出力: Promise<DraftRecord | null>（存在しない場合は null）
 * 副作用: IndexedDB 読み取り（fusen-drafts / drafts）
 */
export async function loadDraft(id: string): Promise<DraftRecord | null> {
  const db = await openDraftsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', 'readonly');
    const req = tx.objectStore('drafts').get(id);
    req.onsuccess = () => {
      const d = req.result ?? null;
      if (!d) { resolve(null); return; }
      resolve({ ...d, images: deserializeImages(d.images || []) });
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * 責務: 指定 id の下書きを IndexedDB から削除する
 * 入力: id: string
 * 出力: Promise<void>
 * 副作用: IndexedDB 書き込み（fusen-drafts / drafts）
 */
export async function deleteDraft(id: string): Promise<void> {
  const db = await openDraftsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', 'readwrite');
    tx.objectStore('drafts').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------------------------------------------------------------------
// fusen-meta DB — ServiceWorker からもアクセス可能なキーバリューストア
// ---------------------------------------------------------------------------

function openMetaDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('fusen-meta', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('meta');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * 責務: アクセストークンを fusen-meta IndexedDB に保存する（SW が push 時に参照するため）
 * 入力: token: string
 * 出力: Promise<void>
 * 副作用: IndexedDB 書き込み（fusen-meta / meta）
 */
/** pending_open: SW が通知表示時に記録。ページ起動時に確認してノートを自動表示する（iOS で notificationclick が発火しない場合の代替） */
export async function loadPendingOpen(): Promise<{ id: string; t: number } | null> {
  const db = await openMetaDB();
  return new Promise((resolve) => {
    const tx = db.transaction('meta', 'readonly');
    const req = tx.objectStore('meta').get('pending_open');
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => resolve(null);
  });
}

export async function clearPendingOpen(): Promise<void> {
  const db = await openMetaDB();
  return new Promise((resolve) => {
    const tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').delete('pending_open');
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export async function saveAuthToken(token: string): Promise<void> {
  const db = await openMetaDB();
  return new Promise((resolve) => {
    const tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put(token, 'access_token');
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve(); // エラーは無視（localStorage が正）
  });
}
