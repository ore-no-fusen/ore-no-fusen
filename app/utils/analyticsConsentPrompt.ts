/** Increment only when a one-time recheck for existing refusals is intentionally scheduled. */
export const ANALYTICS_CONSENT_RECONFIRMATION_VERSION = 1;

export function shouldReconfirmAnalyticsConsent(
  consent: string | null | undefined,
  storedVersion: number | null | undefined,
): boolean {
  return consent === 'denied'
    && (storedVersion ?? 0) < ANALYTICS_CONSENT_RECONFIRMATION_VERSION;
}
