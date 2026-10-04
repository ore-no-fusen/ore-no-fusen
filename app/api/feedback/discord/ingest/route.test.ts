import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashSecretToken } from '../../lib/security';
import { createMemoryFeedbackConversationStore } from '../../lib/store';
import { resolveDiscordConversationIdForMessage } from './resolve';
import { GET, POST } from './route';

describe('Discord ingest conversation resolution', () => {
  beforeEach(() => vi.stubEnv('VERCEL_ENV', 'production'));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('fetches the referenced Discord message when the message list omits embedded conversation data', async () => {
    const store = createMemoryFeedbackConversationStore();
    await store.createConversation({
      conversationId: 'conversation-1',
      secretTokenHash: hashSecretToken('secret'),
      discordChannelId: 'channel-1',
      deliveryEnabled: true,
      shadowOnly: true,
      createdAt: '2026-06-02T00:00:00.000Z',
      updatedAt: '2026-06-02T00:00:00.000Z',
    });

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      id: 'feedback-message-1',
      channel_id: 'channel-1',
      content: '',
      embeds: [
        {
          fields: [
            { name: '会話ID', value: 'conversation-1' },
          ],
        },
      ],
    }), { status: 200 })));

    const result = await resolveDiscordConversationIdForMessage(
      {
        id: 'developer-reply-1',
        channel_id: 'channel-1',
        content: '確認しました',
        author: { id: 'dev-1', bot: false },
        message_reference: {
          message_id: 'feedback-message-1',
          channel_id: 'channel-1',
        },
      },
      'bot-token',
      store,
    );

    expect(result).toEqual({
      conversationId: 'conversation-1',
      referencedMessageId: 'feedback-message-1',
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://discord.com/api/v10/channels/channel-1/messages/feedback-message-1',
      { headers: { Authorization: 'Bot bot-token' } },
    );
  });

  it('keeps replies rejected when the referenced Discord message is not tied to an existing conversation', async () => {
    const store = createMemoryFeedbackConversationStore();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      id: 'feedback-message-unknown',
      channel_id: 'channel-1',
      content: '',
      embeds: [
        {
          fields: [
            { name: '会話ID', value: 'missing-conversation' },
          ],
        },
      ],
    }), { status: 200 })));

    const result = await resolveDiscordConversationIdForMessage(
      {
        id: 'developer-reply-1',
        channel_id: 'channel-1',
        content: '確認しました',
        author: { id: 'dev-1', bot: false },
        message_reference: {
          message_id: 'feedback-message-unknown',
          channel_id: 'channel-1',
        },
      },
      'bot-token',
      store,
    );

    expect(result).toEqual({
      conversationId: null,
      referencedMessageId: 'feedback-message-unknown',
    });
  });
});

describe('Discord reply environment isolation', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('does not resolve a production embed into a development conversation with the same ID', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    const network = vi.fn(); vi.stubGlobal('fetch', network);
    const store = {
      getConversationIdByDiscordMessage: vi.fn(async () => null),
      getConversationIdByDiscordThread: vi.fn(async () => null),
      getConversation: vi.fn(async () => ({ conversationId: 'same-id' })),
    } as unknown as Parameters<typeof resolveDiscordConversationIdForMessage>[2];
    const result = await resolveDiscordConversationIdForMessage({
      id: 'reply', channel_id: 'channel', content: 'production reply',
      referenced_message: { id: 'production-notification', embeds: [{ fields: [{ name: '会話ID', value: 'same-id' }] }] },
    }, 'test-bot', store);
    expect(result.conversationId).toBeNull();
    expect(store.getConversation).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });

  it('existing production fallback cannot resolve a development notification with the same ID', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    const notification = { id: 'development-notification', embeds: [{ fields: [{ name: '開発会話ID', value: 'same-id' }] }] };
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(notification)));
    const store = {
      getConversationIdByDiscordMessage: vi.fn(async () => null),
      getConversationIdByDiscordThread: vi.fn(async () => null),
      getConversation: vi.fn(async () => ({ conversationId: 'same-id' })),
    } as unknown as Parameters<typeof resolveDiscordConversationIdForMessage>[2];
    const result = await resolveDiscordConversationIdForMessage({ id: 'reply', channel_id: 'channel', content: 'development reply', referenced_message: notification }, 'test-bot', store);
    expect(result.conversationId).toBeNull();
    expect(store.getConversation).not.toHaveBeenCalled();
  });

  it('development resolves only its saved notification mapping', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    const store = {
      getConversationIdByDiscordMessage: vi.fn(async () => 'development-conversation'),
      getConversationIdByDiscordThread: vi.fn(async () => null),
      getConversation: vi.fn(),
    } as unknown as Parameters<typeof resolveDiscordConversationIdForMessage>[2];
    expect((await resolveDiscordConversationIdForMessage({ id: 'reply', channel_id: 'channel', content: 'development reply', message_reference: { message_id: 'development-notification' } }, 'test-bot', store)).conversationId).toBe('development-conversation');
  });
});

describe('Discord ingest cursor input', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('declares the data environment without accepting a GET import', async () => {
    for (const environment of ['preview', 'production']) {
      vi.stubEnv('VERCEL_ENV', environment);
      const response = await GET();
      expect(response.status).toBe(405);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect((await response.json()).environment).toBe(environment === 'production' ? 'production' : 'development');
    }
  });

  it('rejects an invalid cursor before calling Discord', async () => {
    vi.stubEnv('FEEDBACK_CONVERSATION_INGEST_SECRET', 'test-secret');
    const response = await POST(new Request('https://example.test/api/feedback/discord/ingest', {
      method: 'POST', headers: { Authorization: 'Bearer test-secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({ afterId: 'not-a-snowflake' }),
    }));
    expect(response.status).toBe(400);
  });
});
