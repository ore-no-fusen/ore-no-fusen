import { describe, expect, it } from 'vitest';
import {
  boundedString,
  evaluateDeveloperReplyEligibility,
  extractConversationIdFromDiscordEmbeds,
  hashSecretToken,
  parseAllowedDiscordUserIds,
  readFeedbackJson,
  safeEqualHash,
} from './security';
import type { DiscordCandidateMessage } from './types';

const baseMessage: DiscordCandidateMessage = {
  id: 'discord-reply-1',
  channelId: 'channel-1',
  authorId: 'dev-1',
  authorIsBot: false,
  content: 'ありがとうございます',
  referencedMessageId: 'feedback-message-1',
};

describe('developer reply safety gates', () => {
  it('accepts a Discord reply from an allowed developer mapped to a conversation', () => {
    const result = evaluateDeveloperReplyEligibility({
      message: baseMessage,
      allowedDiscordUserIds: ['dev-1'],
      mappedConversationId: 'conversation-1',
      alreadyIngested: false,
    });

    expect(result).toEqual({ ok: true, reason: 'accepted', conversationId: 'conversation-1' });
  });

  it('rejects channel direct messages because they are not tied to a conversation message', () => {
    const result = evaluateDeveloperReplyEligibility({
      message: { ...baseMessage, referencedMessageId: null, threadId: null },
      allowedDiscordUserIds: ['dev-1'],
      mappedConversationId: 'conversation-1',
      alreadyIngested: false,
    });

    expect(result).toEqual({ ok: false, reason: 'not_reply_to_conversation' });
  });

  it('accepts thread messages when the thread maps to a conversation', () => {
    const result = evaluateDeveloperReplyEligibility({
      message: { ...baseMessage, referencedMessageId: null, threadId: 'thread-1' },
      allowedDiscordUserIds: ['dev-1'],
      mappedConversationId: 'conversation-1',
      alreadyIngested: false,
    });

    expect(result).toEqual({ ok: true, reason: 'accepted', conversationId: 'conversation-1' });
  });

  it('rejects replies from non-developers', () => {
    const result = evaluateDeveloperReplyEligibility({
      message: { ...baseMessage, authorId: 'user-1' },
      allowedDiscordUserIds: ['dev-1'],
      mappedConversationId: 'conversation-1',
      alreadyIngested: false,
    });

    expect(result).toEqual({ ok: false, reason: 'author_not_allowed' });
  });

  it('rejects bot messages', () => {
    const result = evaluateDeveloperReplyEligibility({
      message: { ...baseMessage, authorIsBot: true },
      allowedDiscordUserIds: ['dev-1'],
      mappedConversationId: 'conversation-1',
      alreadyIngested: false,
    });

    expect(result).toEqual({ ok: false, reason: 'bot_message' });
  });

  it('rejects duplicate Discord replies', () => {
    const result = evaluateDeveloperReplyEligibility({
      message: baseMessage,
      allowedDiscordUserIds: ['dev-1'],
      mappedConversationId: 'conversation-1',
      alreadyIngested: true,
    });

    expect(result).toEqual({ ok: false, reason: 'duplicate' });
  });

  it('rejects empty replies', () => {
    const result = evaluateDeveloperReplyEligibility({
      message: { ...baseMessage, content: '   ' },
      allowedDiscordUserIds: ['dev-1'],
      mappedConversationId: 'conversation-1',
      alreadyIngested: false,
    });

    expect(result).toEqual({ ok: false, reason: 'empty_body' });
  });
});

describe('feedback token hashing', () => {
  it('hashes and compares token hashes', () => {
    const hash = hashSecretToken('secret');
    expect(hash).not.toBe('secret');
    expect(safeEqualHash(hash, hashSecretToken('secret'))).toBe(true);
    expect(safeEqualHash(hash, hashSecretToken('other'))).toBe(false);
  });

  it('parses allowed Discord user ids', () => {
    expect(parseAllowedDiscordUserIds(' dev-1,dev-2 ,, ')).toEqual(['dev-1', 'dev-2']);
  });
});

describe('Discord embed conversation id extraction', () => {
  it('extracts the conversation id from a feedback embed field', () => {
    expect(extractConversationIdFromDiscordEmbeds([
      {
        fields: [
          { name: '内容', value: 'hello' },
          { name: '会話ID', value: '  conversation-1  ' },
        ],
      },
    ])).toBe('conversation-1');
  });

  it('ignores embeds without a conversation id field', () => {
    expect(extractConversationIdFromDiscordEmbeds([
      { fields: [{ name: '内容', value: 'hello' }] },
    ])).toBeNull();
  });
});

describe('feedback request limits', () => {
  it('rejects JSON bodies larger than 32KB', async () => {
    const request = new Request('https://example.test', {
      method: 'POST',
      body: JSON.stringify({ content: 'x'.repeat(33 * 1024) }),
    });

    await expect(readFeedbackJson(request)).rejects.toMatchObject({ status: 413 });
  });

  it('rejects missing required and oversized strings', () => {
    expect(() => boundedString('', 'content', 1000, true)).toThrow('invalid content');
    expect(() => boundedString('x'.repeat(1001), 'content', 1000, true)).toThrow('invalid content');
  });
});
