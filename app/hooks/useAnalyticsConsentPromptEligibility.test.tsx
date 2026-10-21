import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAnalyticsConsentPromptEligibility } from './useAnalyticsConsentPrompt';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  onFocusChanged: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ onFocusChanged: mocks.onFocusChanged }) }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.invoke.mockResolvedValue({ consentPromptEligible: false });
  mocks.onFocusChanged.mockResolvedValue(mocks.dispose);
});
afterEach(cleanup);

it('付箋ウィンドウや初期設定中は案内判定を開始しない', () => {
  const { result } = renderHook(() => useAnalyticsConsentPromptEligibility(false));
  expect(result.current).toBe(false);
  expect(mocks.invoke).not.toHaveBeenCalled();
  expect(mocks.onFocusChanged).not.toHaveBeenCalled();
});

it('初回は表示せず、後日メイン画面へ戻ったときに端末内の条件を読み直す', async () => {
  const { result, unmount } = renderHook(() => useAnalyticsConsentPromptEligibility(true));
  await waitFor(() => expect(mocks.onFocusChanged).toHaveBeenCalledOnce());
  expect(result.current).toBe(false);
  mocks.invoke.mockResolvedValue({ consentPromptEligible: true });
  await act(async () => { mocks.onFocusChanged.mock.calls[0][0]({ payload: false }); });
  expect(mocks.invoke).toHaveBeenCalledTimes(1);
  await act(async () => { mocks.onFocusChanged.mock.calls[0][0]({ payload: true }); });
  expect(result.current).toBe(true);
  expect(mocks.invoke).toHaveBeenLastCalledWith('member_get');
  unmount();
  expect(mocks.dispose).toHaveBeenCalledOnce();
});

it('端末内の案内状態を読めないときは勝手に案内しない', async () => {
  mocks.invoke.mockRejectedValue(new Error('unavailable'));
  const { result } = renderHook(() => useAnalyticsConsentPromptEligibility(true));
  await waitFor(() => expect(mocks.onFocusChanged).toHaveBeenCalledOnce());
  expect(result.current).toBe(false);
});
