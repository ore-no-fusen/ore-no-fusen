'use client';
import { useEffect, useRef, type RefObject } from 'react';
import { trackEvent } from '../utils/analytics';

// Evidence of intentional foreground viewing, not proof of comprehension.
// Startup, restore, focus alone, hover and synthetic events never start a timer.
export function useNoteReading(contentRef: RefObject<HTMLElement | null>, noteKey: string, enabled: boolean) {
  const recordedDay = useRef('');
  useEffect(() => {
    if (!enabled || !noteKey) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const eligible = () => document.visibilityState === 'visible' && document.hasFocus()
      && (window as Window & {__FUSEN_ANALYTICS_GRANTED__?:boolean}).__FUSEN_ANALYTICS_GRANTED__ === true
      && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
    const cancel = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
    const start = (event: Event) => {
      if (!event.isTrusted || !(event.target instanceof Node) || !contentRef.current?.contains(event.target) || !eligible()) return;
      if (recordedDay.current === new Date().toISOString().slice(0,10) || timer !== undefined) return;
      timer = setTimeout(() => {
        timer = undefined;
        if (!eligible()) return;
        recordedDay.current = new Date().toISOString().slice(0,10);
        trackEvent('feature_used', {feature_name:'note_read'});
      }, 5000);
    };
    document.addEventListener('pointerdown', start, true);
    document.addEventListener('keydown', start, true);
    document.addEventListener('visibilitychange', cancel);
    window.addEventListener('blur', cancel);
    return () => {
      cancel(); document.removeEventListener('pointerdown', start, true);
      document.removeEventListener('keydown', start, true);
      document.removeEventListener('visibilitychange', cancel); window.removeEventListener('blur', cancel);
    };
  }, [contentRef, noteKey, enabled]);
}
