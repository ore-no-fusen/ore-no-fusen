'use client';
import { invoke } from '@tauri-apps/api/core';

const pending = new Map<string, number>();
let retryBatch: { batchId: string; counts: Record<string, number> } | undefined;
let retryTimer: number | undefined;
let generation = 0;
let flushing: Promise<void> | undefined;
let flushScheduled = false;

async function flush() {
  if (flushing) return flushing;
  flushing = flushOnce().finally(() => {
    flushing = undefined;
    if (!retryBatch && pending.size > 0) void flush();
  });
  return flushing;
}

async function flushOnce() {
  if (!retryBatch) {
    if (pending.size === 0) return;
    retryBatch = { batchId: crypto.randomUUID(), counts: Object.fromEntries(pending) };
    pending.clear();
  }
  const batch = retryBatch;
  const startedAt = generation;
  try {
    await invoke('member_record_batch', batch);
    if (generation === startedAt && retryBatch === batch) retryBatch = undefined;
  } catch {
    // Keep the same batch id and payload: Rust persists it atomically and deduplicates retries.
    if (generation === startedAt && retryBatch === batch && retryTimer === undefined) {
      retryTimer = window.setTimeout(() => { retryTimer = undefined; void flush(); }, 60_000);
    }
  }
}

export function countMemberFeature(feature: string) {
  pending.set(feature, (pending.get(feature) ?? 0) + 1);
  if (!flushScheduled) {
    flushScheduled = true;
    queueMicrotask(() => { flushScheduled = false; void flush(); });
  }
}

export function flushMemberFeatureQueue() {
  return flush();
}

export function clearMemberFeatureQueue() {
  generation++;
  pending.clear();
  retryBatch = undefined;
  if (retryTimer !== undefined) window.clearTimeout(retryTimer);
  retryTimer = undefined;
  flushScheduled = false;
}
