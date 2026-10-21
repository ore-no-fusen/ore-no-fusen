import { describe, expect, it } from 'vitest';
import { parseSharingRecord, sharingState, type SharingRecord } from './web-sharing-state';
const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222', c = '33333333-3333-4333-8333-333333333333';
const record = (id: string, action: 'pause' | 'resume', parents: string[] = []): SharingRecord => ({ schemaVersion: 1, scope: { accountSubject: 'test', noteId: 'note', generation: 1 }, id, action, parents });
describe('independent Web sharing state', () => {
  it('validates a long history without a recursive depth or global operation limit', () => {
    const records = Array.from({length: 1024}, (_, i) => record(`${i.toString(16).padStart(8,'0')}-1111-4111-8111-111111111111`, i % 2 ? 'resume' : 'pause', i ? [`${(i-1).toString(16).padStart(8,'0')}-1111-4111-8111-111111111111`] : []));
    expect(sharingState(records).paused).toBe(false);
  });
  it('starts shared, pauses, resumes and stays resumed regardless of download order', () => {
    expect(sharingState([]).paused).toBe(false);
    expect(sharingState([record(a, 'pause')]).paused).toBe(true);
    expect(sharingState([record(b, 'resume', [a]), record(a, 'pause')])).toEqual({ paused: false, heads: [b] });
  });
  it('keeps a concurrent stop until a later resume observes both heads', () => {
    const records = [record(a, 'pause'), record(b, 'resume')];
    expect(sharingState(records).paused).toBe(true);
    expect(sharingState([...records, record(c, 'resume', [a, b])]).paused).toBe(false);
  });
  it('rejects missing history, cycles and conflicting IDs', () => {
    expect(() => sharingState([record(a, 'resume', [b])])).toThrow();
    expect(() => sharingState([record(a, 'pause', [b]), record(b, 'resume', [a])])).toThrow();
    expect(() => sharingState([record(a, 'pause'), record(a, 'resume')])).toThrow();
  });
  it('rejects another note as a parent and mismatched filenames', () => {
    expect(() => sharingState([record(a, 'pause'), { ...record(b, 'resume', [a]), scope: { accountSubject: 'test', noteId: 'other', generation: 1 } }])).toThrow();
    expect(() => parseSharingRecord(record(a, 'pause'), `web-sharing-${b}.json`)).toThrow();
    expect(parseSharingRecord(record(a, 'pause'), `web-sharing-${a}.json`).action).toBe('pause');
  });
});
