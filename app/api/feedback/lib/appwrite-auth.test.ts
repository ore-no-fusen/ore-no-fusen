import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appwriteUserIdForConversation, createFeedbackImageJwt, ensureFeedbackImageUser } from './appwrite-auth';

describe('Appwrite image authentication', () => {
  beforeEach(() => {
    vi.stubEnv('APPWRITE_ENDPOINT', 'https://example.appwrite.io/v1');
    vi.stubEnv('APPWRITE_PROJECT_ID', 'project');
    vi.stubEnv('APPWRITE_BUCKET_ID', 'bucket');
    vi.stubEnv('APPWRITE_AUTH_API_KEY', 'server-secret');
  });

  it('derives a stable non-secret Appwrite user id within the 36 character limit', () => {
    const first = appwriteUserIdForConversation('conversation-a');
    expect(first).toBe(appwriteUserIdForConversation('conversation-a'));
    expect(first).not.toContain('conversation-a');
    expect(first.length).toBeLessThanOrEqual(36);
  });

  it('creates a short-lived JWT without exposing the API key in URLs', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sessions: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ $id: 'session-1' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ jwt: 'short-jwt' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(createFeedbackImageJwt('fb_user')).resolves.toMatchObject({ jwt: 'short-jwt', bucketId: 'bucket' });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    for (const [url, init] of fetchMock.mock.calls) {
      expect(String(url)).not.toContain('server-secret');
      expect((init as RequestInit).headers).toMatchObject({ 'X-Appwrite-Key': 'server-secret' });
    }
  });

  it('reuses an unexpired user session instead of creating one on every short JWT request', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        sessions: [{ $id: 'session-existing', expire: new Date(Date.now() + 60 * 60 * 1000).toISOString() }],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ jwt: 'short-jwt' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(createFeedbackImageJwt('fb_user')).resolves.toMatchObject({ jwt: 'short-jwt' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [, init] = fetchMock.mock.calls[2] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ sessionId: 'session-existing', duration: 900 });
  });

  it('can provision the deterministic user without creating a session', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(ensureFeedbackImageUser('fb_user')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://example.appwrite.io/v1/users');
  });
});
