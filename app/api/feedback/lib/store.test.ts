import { describe, expect, it } from 'vitest';
import { hashSecretToken } from './security';
import { createMemoryFeedbackConversationStore } from './store';

describe('feedback conversation store', () => {
  it('deletes only a conversation authenticated by its secret', async () => {
    const store = createMemoryFeedbackConversationStore();
    await store.createConversation({
      conversationId: 'conversation-delete',
      secretTokenHash: hashSecretToken('secret'),
      discordMessageId: 'discord-root',
      deliveryEnabled: true,
      shadowOnly: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await store.appendMessage({
      messageId: 'message-delete',
      conversationId: 'conversation-delete',
      authorType: 'developer',
      body: 'reply',
      createdAt: new Date().toISOString(),
      discordMessageId: 'discord-reply',
      readByUser: false,
      shadowOnly: false,
    });

    expect(await store.deleteConversation('conversation-delete', 'wrong')).toBe(false);
    expect(await store.deleteConversation('conversation-delete', 'secret')).toBe(true);
    expect(await store.getConversation('conversation-delete')).toBeNull();
    expect(await store.getConversationIdByDiscordMessage('discord-root')).toBeNull();
    expect(await store.getConversationIdByDiscordMessage('discord-reply')).toBeNull();
    expect(await store.listMessages('conversation-delete', 'secret')).toEqual([]);
  });
  it('maps a Discord notification message to exactly one conversation', async () => {
    const store = createMemoryFeedbackConversationStore();
    await store.createConversation({
      conversationId: 'conversation-1',
      secretTokenHash: hashSecretToken('secret'),
      discordChannelId: 'channel-1',
      discordMessageId: 'message-1',
      deliveryEnabled: true,
      shadowOnly: false,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    });

    expect(await store.getConversationIdByDiscordMessage('message-1')).toBe('conversation-1');
    expect(await store.getConversationIdByDiscordMessage('missing')).toBeNull();
  });

  it('maps a Discord thread to exactly one conversation when thread replies are used', async () => {
    const store = createMemoryFeedbackConversationStore();
    await store.createConversation({
      conversationId: 'conversation-1',
      secretTokenHash: hashSecretToken('secret'),
      discordThreadId: 'thread-1',
      deliveryEnabled: true,
      shadowOnly: false,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    });

    expect(await store.getConversationIdByDiscordThread('thread-1')).toBe('conversation-1');
    expect(await store.getConversationIdByDiscordThread('missing')).toBeNull();
  });

  it('returns messages only when conversation id and secret token both match', async () => {
    const store = createMemoryFeedbackConversationStore();
    await store.createConversation({
      conversationId: 'conversation-1',
      secretTokenHash: hashSecretToken('secret'),
      deliveryEnabled: true,
      shadowOnly: false,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    });
    await store.appendMessage({
      messageId: 'message-1',
      conversationId: 'conversation-1',
      authorType: 'developer',
      body: 'ありがとうございます',
      createdAt: '2026-06-01T00:00:01.000Z',
      readByUser: false,
      shadowOnly: false,
    });

    expect(await store.listMessages('conversation-1', 'secret')).toHaveLength(1);
    expect(await store.listMessages('conversation-1', 'wrong')).toHaveLength(0);
    expect(await store.listMessages('missing', 'secret')).toHaveLength(0);
  });

  it('returns the latest 5 messages in chronological order', async () => {
    const store = createMemoryFeedbackConversationStore();
    await store.createConversation({
      conversationId: 'conversation-1',
      secretTokenHash: hashSecretToken('secret'),
      deliveryEnabled: true,
      shadowOnly: false,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    });

    for (let i = 1; i <= 7; i += 1) {
      await store.appendMessage({
        messageId: `message-${i}`,
        conversationId: 'conversation-1',
        authorType: i % 2 === 0 ? 'developer' : 'user',
        body: `message ${i}`,
        createdAt: `2026-06-01T00:00:0${i}.000Z`,
        readByUser: false,
        shadowOnly: false,
      });
    }

    expect((await store.listLatestMessages('conversation-1', 5)).map((message) => message.messageId))
      .toEqual(['message-3', 'message-4', 'message-5', 'message-6', 'message-7']);
  });

  it('does not save duplicate Discord developer messages', async () => {
    const store = createMemoryFeedbackConversationStore();

    const first = await store.appendMessage({
      messageId: 'message-1',
      conversationId: 'conversation-1',
      authorType: 'developer',
      body: 'ありがとうございます',
      discordMessageId: 'discord-reply-1',
      createdAt: '2026-06-01T00:00:01.000Z',
      readByUser: false,
      shadowOnly: false,
    });
    const second = await store.appendMessage({
      messageId: 'message-2',
      conversationId: 'conversation-1',
      authorType: 'developer',
      body: '二重',
      discordMessageId: 'discord-reply-1',
      createdAt: '2026-06-01T00:00:02.000Z',
      readByUser: false,
      shadowOnly: false,
    });

    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it('marks developer messages read only with the correct token', async () => {
    const store = createMemoryFeedbackConversationStore();
    await store.createConversation({
      conversationId: 'conversation-1',
      secretTokenHash: hashSecretToken('secret'),
      deliveryEnabled: true,
      shadowOnly: false,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    });
    await store.appendMessage({
      messageId: 'message-1',
      conversationId: 'conversation-1',
      authorType: 'developer',
      body: 'ありがとうございます',
      createdAt: '2026-06-01T00:00:01.000Z',
      readByUser: false,
      shadowOnly: false,
    });

    expect(await store.markMessagesRead('conversation-1', 'wrong', ['message-1'])).toBe(false);
    expect(await store.listUnreadDeveloperMessages('conversation-1', 'secret')).toHaveLength(1);
    expect(await store.markMessagesRead('conversation-1', 'secret', ['message-1'])).toBe(true);
    expect(await store.listUnreadDeveloperMessages('conversation-1', 'secret')).toHaveLength(0);
  });
});
