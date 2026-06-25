import React from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RegisterPWA from './RegisterPWA';

const tauriRuntime = vi.hoisted(() => ({ value: false }));

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => tauriRuntime.value,
}));

function installServiceWorkerMock(options: { controlled?: boolean } = {}) {
  const unregister = vi.fn(async () => undefined);
  const register = vi.fn(async () => undefined);
  const getRegistrations = vi.fn(async () => [{ scope: 'http://tauri.localhost/', unregister }]);

  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      register,
      getRegistrations,
      controller: options.controlled ? {} : null,
    },
  });

  return { register, getRegistrations, unregister };
}

describe('RegisterPWA', () => {
  afterEach(() => {
    cleanup();
    tauriRuntime.value = false;
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: undefined,
    });
    vi.restoreAllMocks();
  });

  it('registers the service worker for browser/PWA users', async () => {
    const { register, getRegistrations } = installServiceWorkerMock();

    render(<RegisterPWA />);

    await waitFor(() => {
      expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
    });
    expect(getRegistrations).not.toHaveBeenCalled();
  });

  it('does not register sw.js in the Tauri runtime', async () => {
    tauriRuntime.value = true;
    const { register, getRegistrations, unregister } = installServiceWorkerMock();

    render(<RegisterPWA />);

    await waitFor(() => {
      expect(getRegistrations).toHaveBeenCalled();
    });
    expect(register).not.toHaveBeenCalled();
    expect(unregister).toHaveBeenCalled();
  });

  it('reloads once after removing a controlling Tauri service worker', async () => {
    tauriRuntime.value = true;
    const { register, getRegistrations } = installServiceWorkerMock({ controlled: true });
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, hostname: 'localhost', reload },
    });

    render(<RegisterPWA />);

    await waitFor(() => {
      expect(getRegistrations).toHaveBeenCalled();
      expect(reload).toHaveBeenCalledTimes(1);
    });
    expect(register).not.toHaveBeenCalled();
  });

  it('does not register sw.js when Tauri globals are present', async () => {
    Object.defineProperty(window, '__TAURI__', {
      configurable: true,
      value: {},
    });
    const { register, getRegistrations } = installServiceWorkerMock();

    render(<RegisterPWA />);

    await waitFor(() => {
      expect(getRegistrations).toHaveBeenCalled();
    });
    expect(register).not.toHaveBeenCalled();
  });
});
