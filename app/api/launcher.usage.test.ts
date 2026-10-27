import { afterEach, describe, expect, it, vi } from 'vitest';
import { syncQuickLauncherToWeb } from './launcher';
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), trackEvent: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('../utils/analytics', () => ({ trackEvent: mocks.trackEvent }));
afterEach(() => vi.clearAllMocks());
describe('Web sync usage', () => {
  it('records a completed sync including an unchanged successful sync', async () => {
    const result = { uploaded: 0, applied: 0, unchanged: 1, revoked: 0, held: [] };
    mocks.invoke.mockResolvedValue(result);
    expect(await syncQuickLauncherToWeb()).toBe(result);
    expect(mocks.trackEvent).toHaveBeenCalledExactlyOnceWith('feature_used', { feature_name: 'web_sync' });
  });
  it('does not count an entirely held or failed sync', async () => {
    mocks.invoke.mockResolvedValue({ uploaded: 0, applied: 0, unchanged: 0, revoked: 0, held: ['conflict'] });
    await syncQuickLauncherToWeb();
    mocks.invoke.mockRejectedValue(new Error('offline'));
    await expect(syncQuickLauncherToWeb()).rejects.toThrow('offline');
    expect(mocks.trackEvent).not.toHaveBeenCalled();
  });
});
