import type { DraftRecord } from '../types';

const RETRY_DELAYS_MS = [0, 100, 250, 500] as const;

export function getNotificationNoteId(search: string): string | null {
  const id = new URLSearchParams(search).get('note');
  return id?.trim() || null;
}

export async function loadNotificationDraft(
  id: string,
  loader: (draftId: string) => Promise<DraftRecord | null>,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<DraftRecord | null> {
  for (const delay of RETRY_DELAYS_MS) {
    if (delay > 0) await wait(delay);
    const draft = await loader(id).catch(() => null);
    if (draft) return draft;
  }
  return null;
}

export async function consumePendingNotification(
  id: string,
  loader: (draftId: string) => Promise<DraftRecord | null>,
  clearPending: () => Promise<void>,
  wait?: (ms: number) => Promise<void>,
): Promise<DraftRecord | null> {
  const draft = await loadNotificationDraft(id, loader, wait);
  if (draft) await clearPending();
  return draft;
}

export function removeNotificationNoteParam(currentUrl: string): string {
  const url = new URL(currentUrl);
  url.searchParams.delete('note');
  return `${url.pathname}${url.search}${url.hash}`;
}
