// app/viewer/lib/indexeddb.ts
// IndexedDB の CRUD 純粋関数。'use client' / import React は不要。

import { serializeFiles, deserializeFiles } from '../file-attachments';
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
      const data = await img.blob.arrayBuffer();
      return { fileName: img.fileName, data, type: img.blob.type || 'image/jpeg' };
    }
    return img; // すでに ArrayBuffer 形式
  })).then((r) => r.filter(Boolean));
}

const videoBuffers = new WeakMap<Blob, Promise<ArrayBuffer>>();
function videoBuffer(blob: Blob): Promise<ArrayBuffer> {
  let buffer = videoBuffers.get(blob);
  if (!buffer) {
    buffer = blob.arrayBuffer();
    videoBuffers.set(blob, buffer);
    void buffer.catch(() => videoBuffers.delete(blob));
  }
  return buffer;
}
async function serializeVideos(videos: { fileName: string; originalName: string; blob?: Blob }[]): Promise<unknown[]> {
  return Promise.all(videos.map(async ({ fileName, originalName, blob }) => ({
    fileName, originalName,
    ...(blob && blob.size > 0 ? { data: await videoBuffer(blob), type: blob.type } : {}),
  })));
}

/** ArrayBuffer → Blob に変換（読み込み時） */
function deserializeImages(images: unknown[]): { fileName: string; blob: Blob }[] {
  return (images || []).flatMap((img: any) => {
    if (img.data instanceof ArrayBuffer) {
      const blob = new Blob([img.data], { type: img.type || 'image/jpeg' });
      return blob.size > 0 ? [{ fileName: img.fileName, blob }] : [];
    }
    // 旧Blob形式: iOS SW更新後に無効化（size=0）されている場合は除外
    if (img.blob instanceof Blob && img.blob.size > 0) return [img];
    return [];
  });
}

function deserializeVideos(videos: unknown[]): { fileName: string; originalName: string; blob?: Blob }[] {
  return (videos || []).flatMap((video: any) => {
    if (video.data instanceof ArrayBuffer) {
      const blob = new Blob([video.data], { type: video.type || 'video/mp4' });
      return blob.size > 0
        ? [{ fileName: video.fileName, originalName: video.originalName || video.fileName, blob }]
        : [];
    }
    if (video.blob instanceof Blob && video.blob.size > 0) {
      return [{ fileName: video.fileName, originalName: video.originalName || video.fileName, blob: video.blob }];
    }
    if (video.fileName) {
      return [{ fileName: video.fileName, originalName: video.originalName || video.fileName }];
    }
    return [];
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

const draftOperations = new Map<string, Promise<void>>();
function inDraftOrder(id: string, action: () => Promise<void>): Promise<void> {
  const previous = draftOperations.get(id) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(action);
  draftOperations.set(id, next);
  void next.finally(() => { if (draftOperations.get(id) === next) draftOperations.delete(id); }).catch(() => {});
  return next;
}
export function saveDraft(draft: DraftRecord): Promise<void> {
  return inDraftOrder(draft.id, async () => {
    try { await writeDraft(draft); }
    catch (error) {
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        throw new Error('動画を保存する空き容量が足りません。不要な付箋を削除してから再度お試しください。');
      }
      throw error;
    }
  });
}
async function writeDraft(draft: DraftRecord): Promise<void> {
  const hasFiles = Object.prototype.hasOwnProperty.call(draft, 'files');
  const files = hasFiles ? await serializeFiles(draft.files || []) : undefined;
  const images = await serializeImages(draft.images || []);
  const hasVideos = Object.prototype.hasOwnProperty.call(draft, 'videos');
  const videos = hasVideos ? await serializeVideos(draft.videos || []) : undefined;
  const hasVideoFileName = Object.prototype.hasOwnProperty.call(draft, 'videoFileName');
  const hasOriginalFileName = Object.prototype.hasOwnProperty.call(draft, 'originalFileName');
  const hasMemo = Object.prototype.hasOwnProperty.call(draft, 'memo');
  // 既存レコードのlocked状態と比較してログ出力
  const db = await openDraftsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', 'readwrite');
    const getReq = tx.objectStore('drafts').get(draft.id);
    getReq.onsuccess = () => {
      const existing = getReq.result;
      if (existing?.deleted === true) { reject(new Error('この付箋は削除済みです。')); tx.abort(); return; }
      const storedDraft = {
        ...draft,
        originNoteId: draft.originNoteId ?? existing?.originNoteId,
        originBodyHash: draft.originBodyHash ?? existing?.originBodyHash,
        originPcId: draft.originPcId ?? existing?.originPcId,
        originAppearance: draft.originAppearance ?? existing?.originAppearance,
        type: draft.type ?? existing?.type,
        videoFileName: hasVideoFileName ? draft.videoFileName : existing?.videoFileName,
        originalFileName: hasOriginalFileName ? draft.originalFileName : existing?.originalFileName,
        videos: hasVideos ? (videos as any[]).map(video => ({
          ...(existing?.videos ?? []).find((saved: any) => saved.fileName === video.fileName),
          ...video,
        })) : (existing?.videos ?? []),
        files: hasFiles ? files : existing?.files,
        memo: hasMemo ? draft.memo : existing?.memo,
        images,
      };
      // locked=true が明示的に false にされた場合（intentional unlock）はそのまま通す。
      // unlocked=undefined（Drive マージなど locked を知らないコードパス）の場合は保護する。
      if (existing?.locked && draft.locked === undefined) {
        const stack = new Error().stack?.split('\n').slice(1, 4).join(' | ') ?? '';
        logToFusenLogs(`[saveDraft] locked保護 id=${draft.id.slice(0, 8)} | ${stack}`);
        tx.objectStore('drafts').put({ ...storedDraft, locked: true }, draft.id);
      } else {
        tx.objectStore('drafts').put(storedDraft, draft.id);
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
      const drafts = (req.result ?? []).filter((d: any) => d.deleted !== true).map((d: any) => ({
        ...d,
        images: deserializeImages(d.images || []),
        videos: (d.videos || []).map((video: any) => ({ fileName: video.fileName, originalName: video.originalName || video.fileName })),
        files: deserializeFiles(d.files || []),
      }));
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
      if (!d || d.deleted === true) { resolve(null); return; }
      resolve({
        ...d,
        images: deserializeImages(d.images || []),
        videos: deserializeVideos(d.videos || []),
        files: deserializeFiles(d.files || []),
      });
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
export function deleteDraft(id: string): Promise<void> {
  return inDraftOrder(id, () => removeDraft(id));
}
async function removeDraft(id: string): Promise<void> {
  const db = await openDraftsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', 'readwrite');
    tx.objectStore('drafts').put({ id, deleted: true }, id);
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

const DELETED_DRAFT_IDS_KEY = 'deleted_draft_ids';
const MAX_DELETED_DRAFT_IDS = 500;

export async function loadDeletedDraftIds(): Promise<string[]> {
  const db = await openMetaDB();
  return new Promise((resolve) => {
    const tx = db.transaction('meta', 'readonly');
    const req = tx.objectStore('meta').get(DELETED_DRAFT_IDS_KEY);
    req.onsuccess = () => {
      const value = req.result;
      resolve(Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []);
    };
    req.onerror = () => resolve([]);
  });
}

export async function markDraftDeleted(id: string): Promise<void> {
  const db = await openMetaDB();
  const deletedIds = await loadDeletedDraftIds();
  const nextIds = [id, ...deletedIds.filter((deletedId) => deletedId !== id)]
    .slice(0, MAX_DELETED_DRAFT_IDS);
  return new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put(nextIds, DELETED_DRAFT_IDS_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
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
