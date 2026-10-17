/** Increment only when a one-time recheck for existing refusals is intentionally scheduled. */
export const ANALYTICS_CONSENT_RECONFIRMATION_VERSION = 1;
export const ANALYTICS_CONSENT_VALUE_EXPERIENCED_EVENT = 'fusen:analytics_consent_value_experienced';
export const ANALYTICS_CONSENT_VALUE_EXPERIENCED_KEY = 'ore-no-fusen.analytics-consent-value-experienced-at';
export const ANALYTICS_CONSENT_DEFERRED_UNTIL_KEY = 'ore-no-fusen.analytics-consent-deferred-until';
export const ANALYTICS_CONSENT_VALUE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const ANALYTICS_CONSENT_POSTPONE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): StorageLike | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; }
  catch { return null; }
}

export function readPromptTimestamp(key: string, storage = browserStorage()): number | null {
  const raw = storage?.getItem(key);
  if (!raw) return null;
  const value = Date.parse(raw);
  return Number.isFinite(value) ? value : null;
}

export function markAnalyticsConsentValueExperienced(now = Date.now(), storage = browserStorage()): number {
  const existing = readPromptTimestamp(ANALYTICS_CONSENT_VALUE_EXPERIENCED_KEY, storage);
  if (existing !== null) return existing;
  try { storage?.setItem(ANALYTICS_CONSENT_VALUE_EXPERIENCED_KEY, new Date(now).toISOString()); } catch { /* Prompt timing must never block note saving. */ }
  return now;
}

export function hasPreviouslyUsedNote(notes: Array<{ context?: string }> | null | undefined): boolean {
  const welcomeContexts = new Set(['Your first note (safe to delete)', 'はじめての付箋（消してOK）']);
  return (notes ?? []).some(note => !welcomeContexts.has(note.context ?? ''));
}

export function postponeAnalyticsConsentPrompt(now = Date.now(), storage = browserStorage()): number {
  const until = now + ANALYTICS_CONSENT_POSTPONE_COOLDOWN_MS;
  try { storage?.setItem(ANALYTICS_CONSENT_DEFERRED_UNTIL_KEY, new Date(until).toISOString()); } catch { /* Keep the current session postponed even if storage is unavailable. */ }
  return until;
}

export function shouldReconfirmAnalyticsConsent(
  consent: string | null | undefined,
  storedVersion: number | null | undefined,
): boolean {
  return consent === 'denied'
    && (storedVersion ?? 0) < ANALYTICS_CONSENT_RECONFIRMATION_VERSION;
}

export function shouldPromptAfterExperience(
  experiencedAt: number | null,
  deferredUntil: number | null,
  now = Date.now(),
): boolean {
  return experiencedAt !== null
    && now >= experiencedAt + ANALYTICS_CONSENT_VALUE_COOLDOWN_MS
    && (deferredUntil === null || now >= deferredUntil);
}
