import { useState } from 'react';

type ConsentPromptConditions = {
  isMainWindow: boolean;
  isCheckingSetup: boolean;
  setupRequired: boolean;
  settingsLoading: boolean;
  consent?: string | null;
  postponed: boolean;
};

export function shouldShowAnalyticsConsentPrompt({
  isMainWindow,
  isCheckingSetup,
  setupRequired,
  settingsLoading,
  consent,
  postponed,
}: ConsentPromptConditions): boolean {
  return isMainWindow && !isCheckingSetup && !setupRequired && !settingsLoading && !consent && !postponed;
}

/** Deferral is intentionally session-only; a new app mount asks again if consent is still unset. */
export function useAnalyticsConsentPromptPostponed() {
  const [postponed, setPostponed] = useState(false);
  return { postponed, postpone: () => setPostponed(true) };
}
