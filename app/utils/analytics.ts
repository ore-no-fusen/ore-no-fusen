'use client';

type AnalyticsParams = Record<string, string | number | boolean | undefined>;

const DESKTOP_ALLOWED_PARAMS = new Set([
  'event_category',
  'app_version',
  'distribution',
  'creation_path',
  'error_category',
  'donation_source',
  'note_count_bucket',
  'tagged_note_count_bucket',
  'tag_count_bucket',
  'iphone_enabled',
  'feature_name',
]);

const ANONYMOUS_COUNT_BUCKETS = new Set(['0', '1-5', '6-10', '11-20', '21-50', '51+']);
const ALLOWED_FEATURE_NAMES = new Set([
  'tag_add',
  'alarm_set',
  'iphone_send',
  'iphone_receive',
  'search_open',
  'note_duplicate',
  'note_archive',
]);

declare global {
  interface Window {
    gtag?: (command: 'event', eventName: string, params?: AnalyticsParams) => void;
    __FUSEN_ANALYTICS_DISABLE_TIMER__?: number;
    'ga-disable-G-MGPKF0MQH4'?: boolean;
  }
}

const GA_DISABLE_KEY = 'ga-disable-G-MGPKF0MQH4' as const;

export function bucketAnonymousCount(count: number): string {
  if (count <= 0) return '0';
  if (count <= 5) return '1-5';
  if (count <= 10) return '6-10';
  if (count <= 20) return '11-20';
  if (count <= 50) return '21-50';
  return '51+';
}

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
    ? Object.fromEntries(Object.entries(params).filter(([key, value]) => {
        if (!DESKTOP_ALLOWED_PARAMS.has(key)) return false;
        if (key.endsWith('_count_bucket')) return typeof value === 'string' && ANONYMOUS_COUNT_BUCKETS.has(value);
        if (key === 'feature_name') return typeof value === 'string' && ALLOWED_FEATURE_NAMES.has(value);
        return true;
      }))
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
