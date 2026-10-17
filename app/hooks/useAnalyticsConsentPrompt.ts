import { useCallback, useEffect, useState } from 'react';
import {
  ANALYTICS_CONSENT_DEFERRED_UNTIL_KEY,
  ANALYTICS_CONSENT_VALUE_EXPERIENCED_EVENT,
  ANALYTICS_CONSENT_VALUE_EXPERIENCED_KEY,
  markAnalyticsConsentValueExperienced,
  postponeAnalyticsConsentPrompt,
  readPromptTimestamp,
  shouldPromptAfterExperience,
  shouldReconfirmAnalyticsConsent,
} from '../utils/analyticsConsentPrompt';

type ConsentPromptConditions = {
  isMainWindow: boolean;
  isCheckingSetup: boolean;
  setupRequired: boolean;
  settingsLoading: boolean;
  consent?: string | null;
  reconfirmationVersion?: number | null;
  reconfirmationPresented: boolean;
  postponed: boolean;
  valueExperiencedAt?: number | null;
  deferredUntil?: number | null;
  now?: number;
};

export function shouldShowAnalyticsConsentPrompt({
  isMainWindow,
  isCheckingSetup,
  setupRequired,
  settingsLoading,
  consent,
  reconfirmationVersion,
  reconfirmationPresented,
  postponed,
  valueExperiencedAt = null,
  deferredUntil = null,
  now = Date.now(),
}: ConsentPromptConditions): boolean {
  if (!isMainWindow || isCheckingSetup || setupRequired || settingsLoading || postponed) return false;
  if (consent === 'granted') return false;
  if (consent === 'denied') {
    return reconfirmationPresented || shouldReconfirmAnalyticsConsent(consent, reconfirmationVersion);
  }
  return shouldPromptAfterExperience(valueExperiencedAt, deferredUntil, now);
}

/** Prompt timing is local-only state and never changes the user's consent choice. */
export function useAnalyticsConsentPromptPostponed(isMainWindow = false) {
  const [postponed, setPostponed] = useState(false);
  const [reconfirmationPresented, setReconfirmationPresented] = useState(false);
  const [valueExperiencedAt, setValueExperiencedAt] = useState<number | null>(() =>
    readPromptTimestamp(ANALYTICS_CONSENT_VALUE_EXPERIENCED_KEY));
  const [deferredUntil, setDeferredUntil] = useState<number | null>(() =>
    readPromptTimestamp(ANALYTICS_CONSENT_DEFERRED_UNTIL_KEY));
  const [now, setNow] = useState(Date.now);

  const markValueExperienced = useCallback(() => {
    const at = markAnalyticsConsentValueExperienced();
    setValueExperiencedAt(at);
    setNow(Date.now());
  }, []);

  const postpone = useCallback(() => {
    setPostponed(true);
    setDeferredUntil(postponeAnalyticsConsentPrompt());
  }, []);

  useEffect(() => {
    if (!isMainWindow) return;
    const onExperience = () => markValueExperienced();
    window.addEventListener(ANALYTICS_CONSENT_VALUE_EXPERIENCED_EVENT, onExperience);
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    const isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
    if (isTauri) {
      void import('@tauri-apps/api/event').then(({ listen }) => listen(ANALYTICS_CONSENT_VALUE_EXPERIENCED_EVENT, onExperience))
        .then(dispose => {
          if (cancelled) dispose();
          else {
            unlisten = dispose;
            setValueExperiencedAt(readPromptTimestamp(ANALYTICS_CONSENT_VALUE_EXPERIENCED_KEY));
            setDeferredUntil(readPromptTimestamp(ANALYTICS_CONSENT_DEFERRED_UNTIL_KEY));
            setNow(Date.now());
          }
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
      window.removeEventListener(ANALYTICS_CONSENT_VALUE_EXPERIENCED_EVENT, onExperience);
      unlisten?.();
    };
  }, [isMainWindow, markValueExperienced]);

  useEffect(() => {
    const eligibleAt = valueExperiencedAt === null ? null : valueExperiencedAt + 24 * 60 * 60 * 1000;
    const nextAt = [eligibleAt, deferredUntil].filter((value): value is number => value !== null && value > now).reduce<number | null>((min, value) => min === null || value < min ? value : min, null);
    if (nextAt === null) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(0, nextAt - now));
    return () => window.clearTimeout(timer);
  }, [deferredUntil, now, valueExperiencedAt]);

  return {
    postponed,
    reconfirmationPresented,
    valueExperiencedAt,
    deferredUntil,
    now,
    postpone,
    markValueExperienced,
    markReconfirmationPresented: () => setReconfirmationPresented(true),
  };
}
