'use client';

import { countMemberFeature } from './memberUsageQueue';

type AnalyticsParams = Record<string, string | number | boolean | undefined>;

const ALLOWED_FEATURE_NAMES = new Set([
  'tag_add',
  'alarm_set',
  'iphone_send',
  'iphone_receive',
  'search_open',
  'note_duplicate',
  'note_archive',
  'note_edited',
  'outline_toggle',
  'image_attach',
]);

declare global {
  interface Window {
    gtag?: (command: 'event', eventName: string, params?: AnalyticsParams) => void;
    'ga-disable-G-MGPKF0MQH4'?: boolean;
  }
}

export function bucketAnonymousCount(count: number): string {
  if (count <= 0) return '0';
  if (count <= 5) return '1-5';
  if (count <= 10) return '6-10';
  if (count <= 20) return '11-20';
  if (count <= 50) return '21-50';
  return '51+';
}

export function trackEvent(eventName: string, params: AnalyticsParams = {}) {
  if (typeof window === 'undefined') return;
  const isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
  if (isTauri && (window as Window & { __FUSEN_ANALYTICS_GRANTED__?: boolean }).__FUSEN_ANALYTICS_GRANTED__ !== true) return;
  if (isTauri && (eventName === 'feature_used' || eventName === 'note_created')) {
    const feature = eventName === 'note_created' ? 'note_created' : params.feature_name;
    if (typeof feature === 'string' && (feature === 'note_created' || ALLOWED_FEATURE_NAMES.has(feature))) {
      countMemberFeature(feature);
    }
    return;
  }
  // Desktop analytics is weekly-only. Other legacy events are intentionally ignored.
  if (isTauri) return;
  if (typeof window.gtag !== 'function') return;
  window.gtag('event', eventName, params);
}

export function trackDonationEvent(eventName: string, params: AnalyticsParams = {}) {
  trackEvent(eventName, {
    event_category: 'donation',
    ...params,
  });
}
