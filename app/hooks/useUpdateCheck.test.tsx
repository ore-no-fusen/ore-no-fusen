import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUpdateCheck } from './useUpdateCheck';
const { invoke, check, relaunch } = vi.hoisted(() => ({ invoke: vi.fn(), check: vi.fn(), relaunch: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('@tauri-apps/plugin-updater', () => ({ check }));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({
  setSize: vi.fn(async () => {}), center: vi.fn(async () => {}), show: vi.fn(async () => {}),
  unminimize: vi.fn(async () => {}), setFocus: vi.fn(async () => {}),
}) }));
const boot = async () => { await act(async () => {
  await vi.advanceTimersByTimeAsync(3100);
  await vi.dynamicImportSettled();
}); };
describe('useUpdateCheck', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    invoke.mockReset().mockImplementation(async (command: string) => {
      if (command === 'fusen_get_distribution_info') return 'msix';
      if (command === 'fusen_check_store_update') return true;
      return {};
    });
    check.mockReset().mockResolvedValue(null); relaunch.mockReset();
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
  it('Store版はStore更新だけを確認し通知を閉じられる', async () => {
    const { result } = renderHook(() => useUpdateCheck({ isMainWindow: true }));
    await boot();
    expect(result.current.storeUpdateAvailable).toBe(true);
    expect(invoke).toHaveBeenCalledWith('fusen_check_store_update');
    expect(check).not.toHaveBeenCalled();
    act(() => result.current.dismissStoreUpdate());
    expect(result.current.storeUpdateAvailable).toBe(false);
  });
  it.each([false, 'error'])('Store更新なし/取得失敗ではdesktop更新へ進まない: %s', async value => {
    invoke.mockImplementation(async (command: string) => {
      if (command === 'fusen_get_distribution_info') return 'msix';
      if (command === 'fusen_check_store_update') {
        if (value === 'error') throw new Error('Store unavailable');
        return false;
      }
      return {};
    });
    const { result } = renderHook(() => useUpdateCheck({ isMainWindow: true })); await boot();
    expect(result.current.storeUpdateAvailable).toBe(false);
    expect(result.current.showUpdateDialog).toBe(false); expect(check).not.toHaveBeenCalled();
  });
  it.each(['unknown', 'error'])('配布判定が不明/失敗ならdesktop更新しない: %s', async value => {
    invoke.mockImplementation(async (command: string) => {
      if (command === 'fusen_get_distribution_info') {
        if (value === 'error') throw new Error('Detection unavailable');
        return 'unknown';
      }
      return {};
    });
    renderHook(() => useUpdateCheck({ isMainWindow: true })); await boot();
    expect(check).not.toHaveBeenCalled(); expect(invoke).not.toHaveBeenCalledWith('fusen_check_store_update');
  });
  it('desktop版は更新を検出し本人の確認操作でインストールする', async () => {
    invoke.mockResolvedValue('desktop');
    const downloadAndInstall = vi.fn().mockResolvedValue(undefined);
    check.mockResolvedValue({ version: '6.3.0', downloadAndInstall });
    const { result } = renderHook(() => useUpdateCheck({ isMainWindow: true })); await boot();
    expect(check).toHaveBeenCalledTimes(1); expect(result.current.showUpdateDialog).toBe(true);
    expect(downloadAndInstall).not.toHaveBeenCalled();
    await act(async () => { await result.current.handleUpdateConfirm(); });
    expect(downloadAndInstall).toHaveBeenCalledTimes(1); expect(relaunch).toHaveBeenCalledTimes(1);
    expect(result.current.pendingUpdate).toBeNull();
  });
  it('desktopの更新確認失敗は通知せず落ちない', async () => {
    invoke.mockResolvedValue('desktop'); check.mockRejectedValue(new Error('Network unavailable'));
    const { result } = renderHook(() => useUpdateCheck({ isMainWindow: true })); await boot();
    expect(check).toHaveBeenCalledTimes(1); expect(result.current.showUpdateDialog).toBe(false);
    expect(relaunch).not.toHaveBeenCalled();
  });
  it('付箋ウィンドウは更新確認を開始しない', async () => {
    renderHook(() => useUpdateCheck({ isMainWindow: false })); await boot();
    expect(invoke).not.toHaveBeenCalledWith('fusen_get_distribution_info'); expect(check).not.toHaveBeenCalled();
  });
});
