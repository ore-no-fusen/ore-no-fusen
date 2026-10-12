import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../feedback/lib/store', () => ({ getFirestoreAccessToken: vi.fn(async () => 'test-token') }));
import { FirestoreMemberDatabase } from './database';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('letter delivery cache', () => {
  it('shares active history reads briefly, isolates environments, and refreshes stopped letters', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-13T00:00:00Z'));
    let active = true;
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ documents: [
      { name: 'documents/announcements/live', updateTime: '1', fields: { payload: { stringValue: JSON.stringify({ active, expiresAt: '2026-10-14T00:00:00Z' }) } } },
      { name: 'documents/announcements/old', updateTime: '1', fields: { payload: { stringValue: JSON.stringify({ active: true, expiresAt: '2026-10-12T00:00:00Z' }) } } },
    ] }) }));
    vi.stubGlobal('fetch', fetchMock);
    const db = () => new FirestoreMemberDatabase('email', 'key', 'cache-test', '(default)', 'production');
    const first = await Promise.all([db().deliveryAnnouncements(), db().deliveryAnnouncements()]);
    expect(first.map(rows => rows.length)).toEqual([1, 1]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await new FirestoreMemberDatabase('email', 'key', 'cache-test', '(default)', 'development').deliveryAnnouncements();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    active = false;
    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(await db().deliveryAnnouncements()).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it('does not cache failures and allows the next request to retry', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true, json: async () => ({ documents: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    const db = new FirestoreMemberDatabase('email', 'key', 'cache-failure-test', '(default)', 'production');
    await expect(db.deliveryAnnouncements()).rejects.toThrow();
    expect(await db.deliveryAnnouncements()).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
