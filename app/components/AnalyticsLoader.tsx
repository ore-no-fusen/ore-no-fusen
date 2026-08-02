'use client';

import { useEffect } from 'react';

const GA_ID = 'G-MGPKF0MQH4';

type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  __FUSEN_ANALYTICS_GRANTED__?: boolean;
  'ga-disable-G-MGPKF0MQH4'?: boolean;
};

function loadGa4(sendPageView: boolean) {
  const analyticsWindow = window as AnalyticsWindow;
  if (analyticsWindow.gtag) return;
  analyticsWindow.dataLayer = analyticsWindow.dataLayer ?? [];
  analyticsWindow.gtag = (...args: unknown[]) => analyticsWindow.dataLayer?.push(args);
  analyticsWindow.gtag('js', new Date());
  analyticsWindow.gtag('config', GA_ID, { send_page_view: sendPageView });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  script.dataset.fusenAnalytics = 'ga4';
  document.head.appendChild(script);
}

export default function AnalyticsLoader({ isTauriBuild }: { isTauriBuild: boolean }) {
  useEffect(() => {
    if (!isTauriBuild) {
      loadGa4(true);
      return;
    }
    const isNoteWindow = new URLSearchParams(window.location.search).has('path');

    let unlisten: (() => void) | undefined;
    let cancelled = false;
    const applyConsent = (consent?: string) => {
      const analyticsWindow = window as AnalyticsWindow;
      analyticsWindow.__FUSEN_ANALYTICS_GRANTED__ = consent === 'granted';
      analyticsWindow['ga-disable-G-MGPKF0MQH4'] = consent !== 'granted';
      if (consent !== 'granted' || cancelled) return;
      const wasLoaded = Boolean(analyticsWindow.gtag);
      loadGa4(false);
      if (!wasLoaded && !isNoteWindow) {
        analyticsWindow.gtag?.('event', 'app_started', {
          event_category: 'activation',
          app_version: process.env.NEXT_PUBLIC_APP_VERSION ?? 'unknown',
          distribution: 'desktop_app',
        });
      }
    };

    import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke<{ analytics_consent?: string }>('get_settings'))
      .then((settings) => applyConsent(settings.analytics_consent))
      .catch(() => {});
    import('@tauri-apps/api/event').then(async ({ listen }) => {
      unlisten = await listen<{ analytics_consent?: string }>('settings_updated', (event) => {
        applyConsent(event.payload.analytics_consent);
      });
    }).catch(() => {});

    return () => { cancelled = true; unlisten?.(); };
  }, [isTauriBuild]);

  return null;
}
