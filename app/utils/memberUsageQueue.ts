'use client';
import { invoke } from '@tauri-apps/api/core';

const pending = new Map<string, number>();
let timer: number | undefined;

async function flush() {
  timer = undefined;
  if (pending.size === 0) return;
  const counts = Object.fromEntries(pending);
  pending.clear();
  try {
    await invoke('member_record_batch', { counts });
  } catch {
    // Analysis is best-effort. Never retry in the foreground or block note work.
  }
}

export function countMemberFeature(feature: string) {
  pending.set(feature, (pending.get(feature) ?? 0) + 1);
  if (timer === undefined) timer = window.setTimeout(() => void flush(), 60_000);
}

export function flushMemberFeatureQueue() {
  return flush();
}
