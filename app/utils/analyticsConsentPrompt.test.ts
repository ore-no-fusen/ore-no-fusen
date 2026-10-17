import { describe, expect, it } from 'vitest';
import {
  ANALYTICS_CONSENT_DEFERRED_UNTIL_KEY,
  ANALYTICS_CONSENT_POSTPONE_COOLDOWN_MS,
  ANALYTICS_CONSENT_RECONFIRMATION_VERSION,
  ANALYTICS_CONSENT_VALUE_COOLDOWN_MS,
  ANALYTICS_CONSENT_VALUE_EXPERIENCED_KEY,
  hasPreviouslyUsedNote,
  markAnalyticsConsentValueExperienced,
  postponeAnalyticsConsentPrompt,
  readPromptTimestamp,
  shouldPromptAfterExperience,
  shouldReconfirmAnalyticsConsent,
} from './analyticsConsentPrompt';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

describe('analytics consent prompt timing', () => {
  it('does not prompt without a successfully experienced user note', () => {
    expect(shouldPromptAfterExperience(null, null, Date.now())).toBe(false);
  });

  it('keeps the first successful note-save time and waits one day before the first prompt', () => {
    const storage = memoryStorage();
    const savedAt = Date.parse('2026-10-01T12:00:00Z');
    expect(markAnalyticsConsentValueExperienced(savedAt, storage)).toBe(savedAt);
    expect(markAnalyticsConsentValueExperienced(savedAt + 1000, storage)).toBe(savedAt);
    const experiencedAt = readPromptTimestamp(ANALYTICS_CONSENT_VALUE_EXPERIENCED_KEY, storage);
    expect(shouldPromptAfterExperience(experiencedAt, null, savedAt + ANALYTICS_CONSENT_VALUE_COOLDOWN_MS - 1)).toBe(false);
    expect(shouldPromptAfterExperience(experiencedAt, null, savedAt + ANALYTICS_CONSENT_VALUE_COOLDOWN_MS)).toBe(true);
  });

  it('persists a seven-day postpone cooldown, then allows a prompt if value was experienced', () => {
    const storage = memoryStorage();
    const now = Date.parse('2026-10-01T12:00:00Z');
    const deferredUntil = postponeAnalyticsConsentPrompt(now, storage);
    expect(readPromptTimestamp(ANALYTICS_CONSENT_DEFERRED_UNTIL_KEY, storage)).toBe(deferredUntil);
    expect(shouldPromptAfterExperience(now - ANALYTICS_CONSENT_VALUE_COOLDOWN_MS, deferredUntil, deferredUntil - 1)).toBe(false);
    expect(shouldPromptAfterExperience(now - ANALYTICS_CONSENT_VALUE_COOLDOWN_MS, deferredUntil, now + ANALYTICS_CONSENT_POSTPONE_COOLDOWN_MS)).toBe(true);
  });

  it('shows one recheck per explicit reconfirmation version without changing consent', () => {
    expect(shouldReconfirmAnalyticsConsent('denied', 0)).toBe(true);
    expect(shouldReconfirmAnalyticsConsent('denied', ANALYTICS_CONSENT_RECONFIRMATION_VERSION)).toBe(false);
    expect(shouldReconfirmAnalyticsConsent('granted', 0)).toBe(false);
    expect(shouldReconfirmAnalyticsConsent(undefined, 0)).toBe(false);
  });

  it('recognizes existing user notes but not the automatic welcome note', () => {
    expect(hasPreviouslyUsedNote([{ context: 'Your first note (safe to delete)' }])).toBe(false);
    expect(hasPreviouslyUsedNote([{ context: 'はじめての付箋（消してOK）' }])).toBe(false);
    expect(hasPreviouslyUsedNote([{ context: 'NewNote' }])).toBe(true);
  });
});
