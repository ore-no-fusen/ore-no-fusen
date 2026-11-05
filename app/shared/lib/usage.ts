'use client';

type WebFeature = 'web_login_start' | 'web_list_loaded' | 'web_view' | 'web_edit' | 'web_create';
const pending: WebFeature[] = [];
const EXCLUDED_KEY = 'fusen-web-usage-excluded';

export function isWebUsageExcluded(): boolean {
  try { return window.localStorage.getItem(EXCLUDED_KEY) === 'true'; }
  catch { return true; }
}

export function setWebUsageExcluded(excluded: boolean): void {
  // Persist first: a failed write must not pretend the preference was saved.
  window.localStorage.setItem(EXCLUDED_KEY, String(excluded));
  window['ga-disable-G-MGPKF0MQH4'] = excluded;
  if (excluded) pending.splice(0);
}

export function flushWebFeatures(): void {
  for (const feature of pending.splice(0)) trackWebFeature(feature);
}

// Keep browser usage separate from desktop member history. Never include note,
// account, Drive or authentication data in analytics parameters.
export function trackWebFeature(feature: WebFeature): void {
  if (typeof window === 'undefined' || process.env.NODE_ENV !== 'production') return;
  if (window.location.hostname !== 'ore-no-fusen.vercel.app') return;
  if ('__TAURI_INTERNALS__' in window || '__TAURI__' in window) return;
  if (isWebUsageExcluded() || window['ga-disable-G-MGPKF0MQH4'] === true) return;
  try {
    // AnalyticsLoader may mount after the page's first successful read.
    if (window.gtag) window.gtag('event', 'web_feature_used', { feature_name: feature });
    else if (pending.length < 100) pending.push(feature);
  } catch { /* Analytics must never change the result of a successful save. */ }
}
