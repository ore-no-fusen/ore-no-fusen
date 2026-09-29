import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMainWindowResizePolicy } from './useMainWindowResizePolicy';

const windowMocks = vi.hoisted(() => ({
  setSize: vi.fn(),
  center: vi.fn(),
  show: vi.fn(),
  unminimize: vi.fn(),
  setFocus: vi.fn(),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ label: 'main', ...windowMocks }),
}));
vi.mock('@tauri-apps/api/dpi', () => ({
  LogicalSize: class { constructor(public width: number, public height: number) {} },
}));

const options = {
  setupRequired: false,
  isSettingsOpen: false,
  isCheckingSetup: false,
  showUpdateDialog: false,
  isSearchOpen: false,
};

describe('メイン窓のリサイズ', () => {
  afterEach(() => vi.clearAllMocks());

  it('iPhone返送の確認中は比較できる大きさを維持する', async () => {
    renderHook(() => useMainWindowResizePolicy({ ...options, showIphoneReturnDialog: true }));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(windowMocks.setSize).not.toHaveBeenCalled();
  });

  it('通常画面では従来の小さいサイズへ戻す', async () => {
    renderHook(() => useMainWindowResizePolicy({ ...options, showIphoneReturnDialog: false }));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(windowMocks.setSize).toHaveBeenCalledWith(expect.objectContaining({ width: 240, height: 300 }));
  });
});
