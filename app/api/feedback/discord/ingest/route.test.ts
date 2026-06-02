import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashSecretToken } from '../../lib/security';
import { createMemoryFeedbackConversationStore } from '../../lib/store';
import { resolveDiscordConversationIdForMessage } from './resolve';

describe('Discord ingest conversation resolution', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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
