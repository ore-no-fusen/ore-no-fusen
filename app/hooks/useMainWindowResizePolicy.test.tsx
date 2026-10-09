import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMainWindowResizePolicy } from './useMainWindowResizePolicy';

const windowMocks = vi.hoisted(() => ({
  setSize: vi.fn(),
  center: vi.fn(),
  show: vi.fn(),
  unminimize: vi.fn(),
  setFocus: vi.fn(),
  innerSize: vi.fn(() => Promise.resolve({ width: 780, height: 560 })),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ label: 'main', ...windowMocks }),
}));
vi.mock('@tauri-apps/api/dpi', () => ({
  LogicalSize: class { constructor(public width: number, public height: number) {} },
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

const options = {
  setupRequired: false,
  isSettingsOpen: false,
  isCheckingSetup: false,
  showUpdateDialog: false,
  isSearchOpen: false,
};

describe('メイン窓のリサイズ', () => {
  afterEach(() => vi.clearAllMocks());

  it('同意画面中は縮小せず、選択後に通常サイズへ戻す', async () => {
    const { rerender } = renderHook(({ pending }) => useMainWindowResizePolicy({
      ...options, showIphoneReturnDialog: false, showAnalyticsConsent: pending,
    }), { initialProps: { pending: true } });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(windowMocks.setSize).toHaveBeenCalledWith(expect.objectContaining({ width: 640, height: 520 }));
    expect(windowMocks.setSize).not.toHaveBeenCalledWith(expect.objectContaining({ width: 240, height: 300 }));
    rerender({ pending: false });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(windowMocks.setSize).toHaveBeenLastCalledWith(expect.objectContaining({ width: 240, height: 300 }));
  });

  it('設定読み込み中は縮小しない', async () => {
    renderHook(() => useMainWindowResizePolicy({ ...options, isCheckingSetup: true, showIphoneReturnDialog: false }));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(windowMocks.setSize).not.toHaveBeenCalled();
  });

  it('iPhone返送の確認画面を表示すると左右比較できる大きさに広げる', async () => {
    renderHook(() => useMainWindowResizePolicy({ ...options, showIphoneReturnDialog: true }));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(windowMocks.setSize).toHaveBeenCalledWith(expect.objectContaining({ width: 780, height: 560 }));
    expect(windowMocks.show).toHaveBeenCalled();
    expect(windowMocks.show.mock.invocationCallOrder[0]).toBeLessThan(windowMocks.setSize.mock.invocationCallOrder[0]);
  });

  it('通常画面では従来の小さいサイズへ戻す', async () => {
    renderHook(() => useMainWindowResizePolicy({ ...options, showIphoneReturnDialog: false }));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(windowMocks.setSize).toHaveBeenCalledWith(expect.objectContaining({ width: 240, height: 300 }));
  });
});
