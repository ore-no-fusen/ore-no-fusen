'use client';

type AnalyticsParams = Record<string, string | number | boolean | undefined>;

const DESKTOP_ALLOWED_PARAMS = new Set([
  'event_category',
  'app_version',
  'distribution',
  'creation_path',
  'error_category',
  'donation_source',
]);

declare global {
  interface Window {
    gtag?: (command: 'event', eventName: string, params?: AnalyticsParams) => void;
    __FUSEN_ANALYTICS_DISABLE_TIMER__?: number;
    'ga-disable-G-MGPKF0MQH4'?: boolean;
  }
}

const GA_DISABLE_KEY = 'ga-disable-G-MGPKF0MQH4' as const;

function scheduleDesktopAnalyticsDisable() {
  if (window.__FUSEN_ANALYTICS_DISABLE_TIMER__ !== undefined) {
    window.clearTimeout(window.__FUSEN_ANALYTICS_DISABLE_TIMER__);
  }
  window.__FUSEN_ANALYTICS_DISABLE_TIMER__ = window.setTimeout(() => {
    window[GA_DISABLE_KEY] = true;
    window.__FUSEN_ANALYTICS_DISABLE_TIMER__ = undefined;
  }, 3_000);
}

export function trackEvent(eventName: string, params: AnalyticsParams = {}) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  const isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
  if (isTauri && (window as Window & { __FUSEN_ANALYTICS_GRANTED__?: boolean }).__FUSEN_ANALYTICS_GRANTED__ !== true) return;
  const safeParams = isTauri
    ? Object.fromEntries(Object.entries(params).filter(([key]) => DESKTOP_ALLOWED_PARAMS.has(key)))
    : params;
  if (isTauri) window[GA_DISABLE_KEY] = false;
  window.gtag('event', eventName, safeParams);
  if (isTauri) scheduleDesktopAnalyticsDisable();
}

export function trackDonationEvent(eventName: string, params: AnalyticsParams = {}) {
  trackEvent(eventName, {
    event_category: 'donation',
    ...params,
  });
}
