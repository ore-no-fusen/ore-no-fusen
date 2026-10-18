import React from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RegisterPWA from './RegisterPWA';

const tauriRuntime = vi.hoisted(() => ({ value: false }));

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => tauriRuntime.value,
}));

function installServiceWorkerMock(options: { controlled?: boolean; unregisterResult?: boolean } = {}) {
  const unregister = vi.fn(async () => options.unregisterResult ?? false);
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
    vi.unstubAllEnvs();
    sessionStorage.clear();
  });

  it('registers the service worker for browser/PWA users', async () => {
    const { register, getRegistrations } = installServiceWorkerMock();

    render(<RegisterPWA />);

    await waitFor(() => {
      expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
    });
    expect(getRegistrations).not.toHaveBeenCalled();
  });

  it('unregisters an old service worker instead of registering it in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { register, getRegistrations, unregister } = installServiceWorkerMock();

    render(<RegisterPWA />);

    await waitFor(() => expect(getRegistrations).toHaveBeenCalled());
    expect(register).not.toHaveBeenCalled();
    expect(unregister).toHaveBeenCalled();
  });

  it('reloads once after removing a controlling development service worker', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { register, getRegistrations, unregister } = installServiceWorkerMock({
      controlled: true,
      unregisterResult: true,
    });
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, hostname: 'localhost', pathname: '/shared', search: '', reload },
    });

    render(<RegisterPWA />);

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(getRegistrations).toHaveBeenCalled();
    expect(unregister).toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  it('does not reload during OAuth callback code exchange', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { unregister } = installServiceWorkerMock({ controlled: true, unregisterResult: true });
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, hostname: 'localhost', pathname: '/viewer', search: '?code=one-time-code', reload },
    });

    render(<RegisterPWA />);

    await waitFor(() => expect(unregister).toHaveBeenCalled());
    expect(reload).not.toHaveBeenCalled();
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
