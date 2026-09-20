import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryFeedbackConversationStore } from '../../lib/store';
import { hashSecretToken } from '../../lib/security';

const mocks = vi.hoisted(() => ({
  store: null as ReturnType<typeof createMemoryFeedbackConversationStore> | null,
  createJwt: vi.fn(),
}));
vi.mock('../../lib/store', async (original) => {
  const actual = await original<typeof import('../../lib/store')>();
  return { ...actual, createFeedbackConversationStore: () => mocks.store };
});
vi.mock('../../lib/appwrite-auth', async (original) => {
  const actual = await original<typeof import('../../lib/appwrite-auth')>();
  return { ...actual, createFeedbackImageJwt: mocks.createJwt };
});
import { POST } from './route';

const request = (secretToken: string) => new Request('http://localhost/session', {
  method: 'POST', body: JSON.stringify({ conversationId: 'conversation-a', secretToken }),
});

describe('feedback image session route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('IMAGE_STORAGE_ENABLED', 'true');
    mocks.store = createMemoryFeedbackConversationStore();
    mocks.createJwt.mockResolvedValue({ endpoint: 'https://example.appwrite.io/v1', projectId: 'project', bucketId: 'bucket', jwt: 'short-jwt', expiresAt: '2026-09-12T00:15:00Z' });
  });

  it('reserves the first conversation and returns only public config plus JWT', async () => {
    const response = await POST(request('owner-secret'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ jwt: 'short-jwt', userId: expect.stringMatching(/^fb_/) });
    expect(await mocks.store!.verifyConversationAccess('conversation-a', 'owner-secret')).toBe(true);
  });

  it('accepts the existing probe flag on the image attachment preview branch', async () => {
    vi.stubEnv('IMAGE_STORAGE_ENABLED', 'false');
    vi.stubEnv('IMAGE_STORAGE_PROBE_ENABLED', 'true');
    const response = await POST(request('owner-secret'));
    expect(response.status).toBe(200);
  });

  it('returns the same not-found response for another user and never issues a JWT', async () => {
    await mocks.store!.createConversation({ conversationId: 'conversation-a', secretTokenHash: hashSecretToken('owner-secret'), deliveryEnabled: true, shadowOnly: false, createdAt: '2026-01-01', updatedAt: '2026-01-01' });
    const response = await POST(request('attacker-secret'));
    expect(response.status).toBe(404);
    expect(mocks.createJwt).not.toHaveBeenCalled();
  });
});
