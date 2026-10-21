import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
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
  eligible?: boolean;
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
  eligible = false,
}: ConsentPromptConditions): boolean {
  if (!isMainWindow || isCheckingSetup || setupRequired || settingsLoading || postponed || !eligible) return false;
  if (consent === 'granted') return false;
  if (consent === 'denied') {
    return reconfirmationPresented || shouldReconfirmAnalyticsConsent(consent, reconfirmationVersion);
  }
  return !consent;
}

/** Read the local scheduling milestone on startup and explicit return to the main window.
 * No timer interrupts an active note-editing session to request cooperation. */
export function useAnalyticsConsentPromptEligibility(enabled: boolean) {
  const [eligible, setEligible] = useState(false);
  useEffect(() => {
    if (!enabled) { setEligible(false); return; }
    let stopped = false;
    let dispose: (() => void) | undefined;
    const read = () => invoke<{ consentPromptEligible?: boolean }>('member_get')
      .then(view => { if (!stopped) setEligible(view.consentPromptEligible === true); })
      .catch(() => { if (!stopped) setEligible(false); });
    void read();
    try {
      void getCurrentWindow().onFocusChanged(event => { if (event.payload) void read(); })
        .then(fn => { if (stopped) fn(); else dispose = fn; }).catch(() => undefined);
    } catch { /* Browser previews have no native focus event. */ }
    return () => { stopped = true; dispose?.(); };
  }, [enabled]);
  return eligible;
}

/** Close this session's dialog; Rust also persists the postponement and gates future prompts. */
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
