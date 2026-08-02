import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashSecretToken } from '../../lib/security';
import { createFeedbackConversationStore } from '../../lib/store';
import { POST } from './route';

async function createConversationWithMessage(message: {
  conversationId: string;
  messageId: string;
  authorType: 'user' | 'developer';
  readByUser: boolean;
}) {
  const store = createFeedbackConversationStore();
  await store.createConversation({
    conversationId: message.conversationId,
    secretTokenHash: hashSecretToken('secret'),
    deliveryEnabled: true,
    shadowOnly: false,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  });
  await store.appendMessage({
    messageId: message.messageId,
    conversationId: message.conversationId,
    authorType: message.authorType,
    body: 'message body',
    createdAt: '2026-06-01T00:00:01.000Z',
    readByUser: message.readByUser,
    shadowOnly: false,
  });
  return store;
}

describe('feedback conversation ack route', () => {
  afterEach(() => {
    delete process.env.DISCORD_WEBHOOK_URL;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('posts a Discord read receipt only for newly read developer messages', async () => {
    const conversationId = `conversation-${crypto.randomUUID()}`;
    const unreadDeveloperId = `${conversationId}-developer-unread`;
    const alreadyReadDeveloperId = `${conversationId}-developer-already-read`;
    const userMessageId = `${conversationId}-user-message`;
    const store = await createConversationWithMessage({
      conversationId,
      messageId: unreadDeveloperId,
      authorType: 'developer',
      readByUser: false,
    });
    await store.appendMessage({
      messageId: alreadyReadDeveloperId,
      conversationId,
      authorType: 'developer',
      body: 'already read',
      createdAt: '2026-06-01T00:00:02.000Z',
      readByUser: true,
      shadowOnly: false,
    });
    await store.appendMessage({
      messageId: userMessageId,
      conversationId,
      authorType: 'user',
      body: 'user message',
      createdAt: '2026-06-01T00:00:03.000Z',
      readByUser: false,
      shadowOnly: false,
    });

    process.env.DISCORD_WEBHOOK_URL = 'https://discord.example/webhook';
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(new Request('https://example.test/api/feedback/conversation/ack', {
      method: 'POST',
      body: JSON.stringify({
        conversationId,
        secretToken: 'secret',
        messageIds: [unreadDeveloperId, alreadyReadDeveloperId, userMessageId],
      }),
    }));

    await expect(response.json()).resolves.toEqual({ success: true });
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith('https://discord.example/webhook', expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: expect.any(AbortSignal),
      }));
    });
    const firstCall = fetchMock.mock.calls[0];
    if (!firstCall) throw new Error('Discord webhook was not called');
    const requestInit = firstCall[1] as RequestInit;
    const body = JSON.parse(requestInit.body as string);
    expect(body.content).toContain('ユーザーがあなたの返信を見ました');
    expect(body.content).toContain(`会話ID: ${conversationId}`);
    expect(body.content).toContain('見られた返信: 1件');
    expect(body.allowed_mentions).toEqual({ parse: [] });
  });

  it('does not post a Discord read receipt when no unread developer message was newly read', async () => {
    const conversationId = `conversation-${crypto.randomUUID()}`;
    const alreadyReadDeveloperId = `${conversationId}-developer-already-read`;
    await createConversationWithMessage({
      conversationId,
      messageId: alreadyReadDeveloperId,
      authorType: 'developer',
      readByUser: true,
    });

    process.env.DISCORD_WEBHOOK_URL = 'https://discord.example/webhook';
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(new Request('https://example.test/api/feedback/conversation/ack', {
      method: 'POST',
      body: JSON.stringify({
        conversationId,
        secretToken: 'secret',
        messageIds: [alreadyReadDeveloperId],
      }),
    }));

    await expect(response.json()).resolves.toEqual({ success: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still returns success when the Discord read receipt notification fails', async () => {
    const conversationId = `conversation-${crypto.randomUUID()}`;
    const unreadDeveloperId = `${conversationId}-developer-unread`;
    const store = await createConversationWithMessage({
      conversationId,
      messageId: unreadDeveloperId,
      authorType: 'developer',
      readByUser: false,
    });

    process.env.DISCORD_WEBHOOK_URL = 'https://discord.example/webhook';
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 500 })));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await POST(new Request('https://example.test/api/feedback/conversation/ack', {
      method: 'POST',
      body: JSON.stringify({
        conversationId,
        secretToken: 'secret',
        messageIds: [unreadDeveloperId],
      }),
    }));

    await expect(response.json()).resolves.toEqual({ success: true });
    expect(await store.listUnreadDeveloperMessages(conversationId, 'secret')).toHaveLength(0);
    await vi.waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        'Discord read receipt notification error:',
        expect.any(Error),
      );
    });
  });
});
