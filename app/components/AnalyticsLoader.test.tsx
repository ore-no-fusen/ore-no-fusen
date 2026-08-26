import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import React from 'react';

const { invokeMock, listenMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  listenMock: vi.fn(async () => vi.fn()),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
vi.mock('@tauri-apps/api/event', () => ({ listen: listenMock }));

import AnalyticsLoader from './AnalyticsLoader';
import { isTauriRuntime } from '../utils/runtimeEnvironment';

describe('AnalyticsLoader', () => {
  it('treats both packaged builds and tauri dev as the desktop runtime', () => {
    expect(isTauriRuntime('true', undefined)).toBe(true);
    expect(isTauriRuntime(undefined, '1')).toBe(true);
    expect(isTauriRuntime(undefined, undefined)).toBe(false);
  });

  beforeEach(() => {
    invokeMock.mockReset();
    listenMock.mockClear();
    delete (window as any).gtag;
    delete (window as any).dataLayer;
    delete (window as any).__FUSEN_ANALYTICS_GRANTED__;
    document.querySelectorAll('[data-fusen-analytics="ga4"]').forEach((node) => node.remove());
  });

  afterEach(() => cleanup());

  it('does not load GA4 before consent', async () => {
    invokeMock.mockResolvedValue({ analytics_consent: undefined });
    render(<AnalyticsLoader isTauriBuild />);

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('get_settings'));
    expect(document.querySelector('[data-fusen-analytics="ga4"]')).toBeNull();
    expect((window as any).__FUSEN_ANALYTICS_GRANTED__).toBe(false);
  });

  it('loads GA4 and queues app_started after consent', async () => {
    invokeMock.mockResolvedValue({ analytics_consent: 'granted' });
    render(<AnalyticsLoader isTauriBuild />);

    await waitFor(() => expect(document.querySelector('[data-fusen-analytics="ga4"]')).not.toBeNull());
    expect((window as any).__FUSEN_ANALYTICS_GRANTED__).toBe(true);
    expect((window as any).dataLayer.some(
      (command: ArrayLike<unknown>) => Array.from(command)[0] === 'event' && Array.from(command)[1] === 'app_started',
    )).toBe(true);
  });
});
