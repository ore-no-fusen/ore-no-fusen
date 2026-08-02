import { afterEach, describe, expect, it, vi } from 'vitest';
import { trackEvent } from './analytics';

describe('desktop analytics consent gate', () => {
  afterEach(() => {
    delete (window as any).__TAURI_INTERNALS__;
    delete (window as any).__FUSEN_ANALYTICS_GRANTED__;
    delete (window as any).gtag;
  });

  it('does not send desktop events before consent', () => {
    const gtag = vi.fn();
    (window as any).__TAURI_INTERNALS__ = {};
    (window as any).gtag = gtag;

    trackEvent('note_created', { event_category: 'activation' });

    expect(gtag).not.toHaveBeenCalled();
  });

  it('sends only after desktop consent is granted', () => {
    const gtag = vi.fn();
    (window as any).__TAURI_INTERNALS__ = {};
    (window as any).__FUSEN_ANALYTICS_GRANTED__ = true;
    (window as any).gtag = gtag;

    trackEvent('note_created', { event_category: 'activation' });

    expect(gtag).toHaveBeenCalledWith('event', 'note_created', {
      event_category: 'activation',
    });
  });

  it('removes content-like parameters from desktop events', () => {
    const gtag = vi.fn();
    (window as any).__TAURI_INTERNALS__ = {};
    (window as any).__FUSEN_ANALYTICS_GRANTED__ = true;
    (window as any).gtag = gtag;

    trackEvent('note_created', {
      event_category: 'activation',
      note_title: 'private title',
      file_path: 'C:\\private\\note.md',
    });

    expect(gtag).toHaveBeenCalledWith('event', 'note_created', {
      event_category: 'activation',
    });
  });

  it('keeps website analytics behavior unchanged', () => {
    const gtag = vi.fn();
    (window as any).gtag = gtag;

    trackEvent('store_click');

    expect(gtag).toHaveBeenCalledWith('event', 'store_click', {});
  });
});
