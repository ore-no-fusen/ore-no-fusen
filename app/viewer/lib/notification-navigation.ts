import type { DraftRecord } from '../types';
import { safeErrorName } from './diagnostic-log';

const RETRY_DELAYS_MS = [0, 100, 250, 500] as const;

export type NotificationDraftAttempt = {
  attempt: number;
  result: 'found' | 'missing' | 'error';
  elapsedMs: number;
  errorName?: string;
};

export function getNotificationNoteId(search: string): string | null {
  const id = new URLSearchParams(search).get('note');
  return id?.trim() || null;
}

export async function loadNotificationDraft(
  id: string,
  loader: (draftId: string) => Promise<DraftRecord | null>,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  onAttempt?: (attempt: NotificationDraftAttempt) => void,
): Promise<DraftRecord | null> {
  const startedAt = Date.now();
  for (const [index, delay] of RETRY_DELAYS_MS.entries()) {
    if (delay > 0) await wait(delay);
    try {
      const draft = await loader(id);
      onAttempt?.({
        attempt: index + 1,
        result: draft ? 'found' : 'missing',
        elapsedMs: Date.now() - startedAt,
      });
      if (draft) return draft;
    } catch (error) {
      onAttempt?.({
        attempt: index + 1,
        result: 'error',
        elapsedMs: Date.now() - startedAt,
        errorName: safeErrorName(error),
      });
    }
  }
  return null;
}

export async function consumePendingNotification(
  id: string,
  loader: (draftId: string) => Promise<DraftRecord | null>,
  clearPending: () => Promise<void>,
  wait?: (ms: number) => Promise<void>,
  onAttempt?: (attempt: NotificationDraftAttempt) => void,
): Promise<DraftRecord | null> {
  const draft = await loadNotificationDraft(id, loader, wait, onAttempt);
  if (draft) await clearPending();
  return draft;
}

export function removeNotificationNoteParam(currentUrl: string): string {
  const url = new URL(currentUrl);
  url.searchParams.delete('note');
  return `${url.pathname}${url.search}${url.hash}`;
}

type ResumeEventTarget = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

export function registerPendingNotificationResume(
  handler: EventListener,
  documentTarget: ResumeEventTarget = document,
  windowTarget: ResumeEventTarget = window,
): () => void {
  documentTarget.addEventListener('visibilitychange', handler);
  windowTarget.addEventListener('focus', handler);
  windowTarget.addEventListener('pageshow', handler);

  return () => {
    documentTarget.removeEventListener('visibilitychange', handler);
    windowTarget.removeEventListener('focus', handler);
    windowTarget.removeEventListener('pageshow', handler);
  };
}
