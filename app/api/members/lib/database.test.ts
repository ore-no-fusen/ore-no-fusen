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
describe('listPaths', () => {
  it('queries only the document names under the prefix, without reading payloads', async () => {
    const calls: Array<{ url: string; body: any }> = [];
    const fetchMock = vi.fn(async (url: string, init: any) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return { ok: true, json: async () => ([
        { document: { name: 'projects/p/databases/(default)/documents/member_environments/production/usage_history/subjA_2026-W43' } },
        { document: { name: 'projects/p/databases/(default)/documents/member_environments/production/usage_history/subjA_2026-W44' } },
        { readTime: '2026-11-26T00:00:00Z' },
      ]) };
    });
    vi.stubGlobal('fetch', fetchMock);
    const db = new FirestoreMemberDatabase('email', 'key', 'p', '(default)', 'production');
    await expect(db.listPaths('usage_history', 'subjA_')).resolves.toEqual([
      'usage_history/subjA_2026-W43', 'usage_history/subjA_2026-W44',
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calls[0].url).toContain('member_environments/production:runQuery');
    const query = calls[0].body.structuredQuery;
    expect(query.from).toEqual([{ collectionId: 'usage_history' }]);
    const filters = query.where.compositeFilter.filters;
    expect(filters[0].fieldFilter.op).toBe('GREATER_THAN_OR_EQUAL');
    expect(filters[0].fieldFilter.value.referenceValue).toBe(
      'projects/p/databases/(default)/documents/member_environments/production/usage_history/subjA_');
    expect(filters[1].fieldFilter.op).toBe('LESS_THAN');
    expect(filters[1].fieldFilter.value.referenceValue).toBe(
      'projects/p/databases/(default)/documents/member_environments/production/usage_history/subjA`');
  });
  it('returns an empty list when nothing matches', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ([{ readTime: '2026-11-26T00:00:00Z' }]) })));
    const db = new FirestoreMemberDatabase('email', 'key', 'p', '(default)', 'production');
    await expect(db.listPaths('usage_history', 'nobody_')).resolves.toEqual([]);
  });
});
