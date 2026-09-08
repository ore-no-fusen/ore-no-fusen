import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { conversationMemberNumber } from './conversation-number';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('./database', () => ({ memberDatabase: () => ({ get }) }));

describe('Discord member number field value', () => {
  beforeEach(() => {
    vi.stubEnv('MEMBER_API_ENABLED', 'true');
    get.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('returns only the number because the Discord field already has a label', async () => {
    get.mockResolvedValueOnce({ value: { memberId: 'member' } })
      .mockResolvedValueOnce({ value: { generalNumber: 10000 } });
    expect(await conversationMemberNumber('conversation')).toBe('10000');
  });

  it('omits the field when the conversation is not linked', async () => {
    get.mockResolvedValueOnce(null);
    expect(await conversationMemberNumber('conversation')).toBeNull();
  });

  it('omits the field when the linked member is missing', async () => {
    get.mockResolvedValueOnce({ value: { memberId: 'member' } }).mockResolvedValueOnce(null);
    expect(await conversationMemberNumber('conversation')).toBeNull();
  });
});
