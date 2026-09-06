import { afterEach, describe, expect, it, vi } from 'vitest';
import { bucketAnonymousCount, trackEvent } from './analytics';

describe('anonymous count buckets', () => {
  it.each([
    [0, '0'], [1, '1-5'], [5, '1-5'], [6, '6-10'], [10, '6-10'],
    [11, '11-20'], [20, '11-20'], [21, '21-50'], [50, '21-50'], [51, '51+'],
  ])('buckets %i without sending an exact count', (count, expected) => {
    expect(bucketAnonymousCount(count)).toBe(expected);
  });
});

describe('desktop analytics consent gate', () => {
  afterEach(() => {
    vi.useRealTimers();
    delete (window as any).__TAURI_INTERNALS__;
    delete (window as any).__FUSEN_ANALYTICS_GRANTED__;
    delete (window as any).__FUSEN_ANALYTICS_DISABLE_TIMER__;
    delete (window as any)['ga-disable-G-MGPKF0MQH4'];
    delete (window as any).gtag;
  });

  it('does not send desktop events before consent', () => {
    const gtag = vi.fn();
    (window as any).__TAURI_INTERNALS__ = {};
    (window as any).gtag = gtag;

    trackEvent('note_created', { event_category: 'activation' });

    expect(gtag).not.toHaveBeenCalled();
  });

  it('queues feature counts without sending GA4 during the operation', () => {
    vi.useFakeTimers();
    const gtag = vi.fn();
    (window as any).__TAURI_INTERNALS__ = {};
    (window as any).__FUSEN_ANALYTICS_GRANTED__ = true;
    (window as any).gtag = gtag;

    trackEvent('note_created', { event_category: 'activation' });

    expect(gtag).not.toHaveBeenCalled();
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

    expect(gtag).not.toHaveBeenCalled();
  });

  it('does not send legacy desktop snapshots in real time', () => {
    const gtag = vi.fn();
    (window as any).__TAURI_INTERNALS__ = {};
    (window as any).__FUSEN_ANALYTICS_GRANTED__ = true;
    (window as any).gtag = gtag;

    trackEvent('usage_snapshot', {
      event_category: 'usage',
      note_count_bucket: '6-10',
      tagged_note_count_bucket: '1-5',
      tag_count_bucket: '1-5',
      iphone_enabled: true,
      tag_name: 'private',
    });

    expect(gtag).not.toHaveBeenCalled();
  });

  it('rejects exact counts, unknown buckets, and unapproved feature names', () => {
    const gtag = vi.fn();
    (window as any).__TAURI_INTERNALS__ = {};
    (window as any).__FUSEN_ANALYTICS_GRANTED__ = true;
    (window as any).gtag = gtag;

    trackEvent('feature_used', {
      event_category: 'usage',
      note_count: 12,
      note_count_bucket: '12',
      feature_name: 'private_dynamic_value',
    });

    expect(gtag).not.toHaveBeenCalled();
  });

  it('keeps website analytics behavior unchanged', () => {
    const gtag = vi.fn();
    (window as any).gtag = gtag;

    trackEvent('store_click');

    expect(gtag).toHaveBeenCalledWith('event', 'store_click', {});
  });
});
