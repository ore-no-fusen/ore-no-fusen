import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveImmediateStartupStep, useAppInit } from './useAppInit';
import { markSharedLoginReturn } from '@/app/shared/lib/login-return';

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: undefined });
});

describe('resolveImmediateStartupStep', () => {
  it('通知設定済みの通常起動は書ける画面を即時に選ぶ', () => {
    expect(resolveImmediateStartupStep('token', true)).toBe('write');
  });

  it('通知設定前と未ログインの導線を維持する', () => {
    expect(resolveImmediateStartupStep('token', false)).toBe('push');
    expect(resolveImmediateStartupStep(null, false)).toBe('login');
  });
});

describe('useAppInit service worker in development', () => {
  it('does not register or wait for a service worker and shows login immediately', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false }),
    });
    const register = vi.fn();
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register, controller: null },
    });
    const setSwReady = vi.fn();
    const setStep = vi.fn();

    renderHook(() => useAppInit({
      setIsStandalone: vi.fn(),
      setSwReady,
      setStep,
      setAccessToken: vi.fn(),
      setIsLoading: vi.fn(),
      setErrorMessage: vi.fn(),
      setPendingHydrate: vi.fn(),
    }));

    await waitFor(() => expect(setSwReady).toHaveBeenCalledWith(true));
    expect(register).not.toHaveBeenCalled();
    expect(setStep).toHaveBeenCalledWith('login');
  });
});

describe('OAuth return routing', () => {
  it('consumes a shared return from the original callback query before removing it', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    window.history.replaceState({}, '', '/viewer?code=shared-callback');
    localStorage.setItem('pkce_verifier', 'test-verifier');
    markSharedLoginReturn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ access_token: 'test-access-token' }) }));
    const setStep = vi.fn();
    renderHook(() => useAppInit({
      setIsStandalone: vi.fn(),
      setSwReady: vi.fn(),
      setStep,
      setAccessToken: vi.fn(),
      setIsLoading: vi.fn(),
      setErrorMessage: vi.fn(),
      setPendingHydrate: vi.fn(),
    }));

    await waitFor(() => expect(sessionStorage.getItem('viewer_return_to')).toBeNull());
    expect(setStep).not.toHaveBeenCalledWith('push');
    expect(window.location.pathname).toBe('/viewer');
  });

  it('returns a cancelled shared OAuth flow to the shared login screen for retry', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    window.history.replaceState({}, '', '/viewer?error=access_denied');
    markSharedLoginReturn();
    const setStep = vi.fn();
    const setErrorMessage = vi.fn();
    renderHook(() => useAppInit({
      setIsStandalone: vi.fn(),
      setSwReady: vi.fn(),
      setStep,
      setAccessToken: vi.fn(),
      setIsLoading: vi.fn(),
      setErrorMessage,
      setPendingHydrate: vi.fn(),
    }));

    await waitFor(() => expect(setStep).toHaveBeenCalledWith('login'));
    expect(setErrorMessage).toHaveBeenCalledWith('Google接続はキャンセルされました。もう一度ログインできます。');
    expect(sessionStorage.getItem('viewer_return_to')).toBe('/shared');
  });

  it('does not describe a Google-side OAuth error as user cancellation', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    window.history.replaceState({}, '', '/viewer?error=server_error');
    markSharedLoginReturn();
    const setErrorMessage = vi.fn();
    renderHook(() => useAppInit({
      setIsStandalone: vi.fn(),
      setSwReady: vi.fn(),
      setStep: vi.fn(),
      setAccessToken: vi.fn(),
      setIsLoading: vi.fn(),
      setErrorMessage,
      setPendingHydrate: vi.fn(),
    }));

    await waitFor(() => expect(setErrorMessage).toHaveBeenCalledWith('Google接続に失敗しました。もう一度ログインできます。'));
  });
});
