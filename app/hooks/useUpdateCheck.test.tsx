import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUpdateCheck } from './useUpdateCheck';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    setSize: vi.fn(async () => {}),
    center: vi.fn(async () => {}),
    show: vi.fn(async () => {}),
    setFocus: vi.fn(async () => {}),
  }),
}));

describe('useUpdateCheck', () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockImplementation(async (command: string) => {
      if (command === 'fusen_get_distribution_info') return 'msix';
      if (command === 'fusen_check_store_update') return true;
      return {};
    });
  });

  it('Store版は起動時にStoreの更新を確認して通知できる', async () => {
    const { result } = renderHook(() => useUpdateCheck({ isMainWindow: true }));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 3100)); });
    await waitFor(() => expect(result.current.storeUpdateAvailable).toBe(true));
    expect(invoke).toHaveBeenCalledWith('fusen_check_store_update');
    act(() => result.current.dismissStoreUpdate());
    expect(result.current.storeUpdateAvailable).toBe(false);
  });
});
