import { useState } from 'react';
import { shouldReconfirmAnalyticsConsent } from '../utils/analyticsConsentPrompt';

type ConsentPromptConditions = {
  isMainWindow: boolean;
  isCheckingSetup: boolean;
  setupRequired: boolean;
  settingsLoading: boolean;
  consent?: string | null;
  reconfirmationVersion?: number | null;
  reconfirmationPresented: boolean;
  postponed: boolean;
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
}: ConsentPromptConditions): boolean {
  if (!isMainWindow || isCheckingSetup || setupRequired || settingsLoading || postponed) return false;
  if (consent === 'granted') return false;
  if (consent === 'denied') {
    return reconfirmationPresented || shouldReconfirmAnalyticsConsent(consent, reconfirmationVersion);
  }
  return !consent;
}

/** Deferral is intentionally session-only; a new app mount asks again if consent is still unset. */
export function useAnalyticsConsentPromptPostponed() {
  const [postponed, setPostponed] = useState(false);
  const [reconfirmationPresented, setReconfirmationPresented] = useState(false);
  return {
    postponed,
    reconfirmationPresented,
    postpone: () => setPostponed(true),
    markReconfirmationPresented: () => setReconfirmationPresented(true),
  };
}
