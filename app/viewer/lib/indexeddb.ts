// app/viewer/lib/indexeddb.ts
// IndexedDB の CRUD 純粋関数。'use client' / import React は不要。

import type { DraftRecord } from '../types';

export function openDraftsDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('fusen-drafts', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('drafts');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveDraft(draft: DraftRecord): Promise<void> {
  const db = await openDraftsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', 'readwrite');
    tx.objectStore('drafts').put(draft, draft.id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadAllDrafts(): Promise<DraftRecord[]> {
  const db = await openDraftsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', 'readonly');
    const req = tx.objectStore('drafts').getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function loadDraft(id: string): Promise<DraftRecord | null> {
  const db = await openDraftsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', 'readonly');
    const req = tx.objectStore('drafts').get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteDraft(id: string): Promise<void> {
  const db = await openDraftsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', 'readwrite');
    tx.objectStore('drafts').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
