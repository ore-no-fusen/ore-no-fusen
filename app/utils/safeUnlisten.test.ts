import { describe, expect, it, vi } from 'vitest';
import { safeUnlisten, safeUnlistenWhenResolved } from './safeUnlisten';

describe('safeUnlisten', () => {
  it('swallows synchronous cleanup errors', () => {
    expect(() => safeUnlisten(() => {
      throw new Error('cleanup failed');
    })).not.toThrow();
  });

  it('swallows asynchronous cleanup errors', async () => {
    expect(() => safeUnlisten(() => Promise.reject(new Error('cleanup failed')))).not.toThrow();
    await Promise.resolve();
  });

  it('cleans up resolved listener promises', async () => {
    const unlisten = vi.fn();
    safeUnlistenWhenResolved(Promise.resolve(unlisten));
    await Promise.resolve();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it('swallows rejected listener setup promises', async () => {
    expect(() => safeUnlistenWhenResolved(Promise.reject(new Error('setup failed')))).not.toThrow();
    await Promise.resolve();
  });
});
