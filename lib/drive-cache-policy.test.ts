import { describe, expect, it, vi } from 'vitest';
import { clearDriveCacheEntries, driveApiRoute } from './drive-cache-policy.mjs';

describe('Drive cache boundary', () => {
  it('matches only exact Google API hosts and Drive/account endpoints', () => {
    for (const url of ['https://www.googleapis.com/drive/v3/files/a?alt=media','https://content.googleapis.com/drive/v2/files/a','https://www.googleapis.com/upload/drive/v3/files','https://www.googleapis.com/oauth2/v2/userinfo']) expect(driveApiRoute({url:new URL(url)})).toBe(true);
    for (const url of ['https://www.googleapis.com.evil.test/drive/v3/files','https://example.test/drive/v3/files','https://fonts.googleapis.com/css?family=abc','https://www.googleapis.com/calendar/v3/events']) expect(driveApiRoute({url:new URL(url)})).toBe(false);
  });
  it('deletes only Drive entries and preserves each cache and other assets', async () => {
    const removed: string[]=[];
    const entries=['https://www.googleapis.com/drive/v3/files/a?alt=media','https://example.test/viewer','https://example.test/a.png'];
    const cache={keys:async()=>entries.map(url=>({url})),delete:vi.fn(async(request:{url:string})=>{removed.push(request.url);return true;})};
    const storage={keys:async()=>['cross-origin','viewer-shell'],open:vi.fn(async()=>cache)};
    expect(await clearDriveCacheEntries(storage as unknown as CacheStorage)).toBe(2);
    expect(removed).toEqual([entries[0],entries[0]]);
    expect(storage.open).toHaveBeenCalledTimes(2);
  });
  it('reports cleanup failure instead of treating it as success', async () => {
    const storage={keys:async()=>['old-cache'],open:async()=>({keys:async()=>[{url:'https://www.googleapis.com/drive/v3/files/a'}],delete:async()=>{throw new Error('storage unavailable');}})};
    await expect(clearDriveCacheEntries(storage as unknown as CacheStorage)).rejects.toThrow('storage unavailable');
  });
});
