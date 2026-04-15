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
export async function saveDraft(draft: DraftRecord): Promise<void> {
  const db = await openDraftsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', 'readwrite');
    tx.objectStore('drafts').put(draft, draft.id);
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
    req.onsuccess = () => resolve(req.result ?? []);
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
    req.onsuccess = () => resolve(req.result ?? null);
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
