import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ackFeedbackConversationMessages,
  clearFeedbackConversationIdentity,
  deleteFeedbackConversation,
  getDeveloperFeedbackApiBaseUrl,
  getFeedbackApiBaseUrl,
  getFeedbackConversationIdentity,
  getFeedbackConversationUnreadState,
  getOrCreateFeedbackConversationIdentity,
  getUnreadDeveloperReplyIds,
  hasUnreadDeveloperReply,
  markDailyFeedbackUnreadCheck,
  markFeedbackConversationPollAttempt,
  pollFeedbackConversationMessages,
  setFeedbackConversationUnreadState,
  shouldRunDailyFeedbackUnreadCheck,
  shouldPollFeedbackConversation,
} from './feedbackConversation';

function createMemoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => map.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      map.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      map.delete(key);
    }),
  };
}

describe('feedback conversation identity', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it('creates and persists an anonymous conversation identity', () => {
    const storage = createMemoryStorage();

    const first = getOrCreateFeedbackConversationIdentity(storage);
    const second = getOrCreateFeedbackConversationIdentity(storage);

    expect(first.conversationId).toBeTruthy();
    expect(first.secretToken).toBeTruthy();
    expect(second).toEqual(first);
  });

  it('polls at most once a day', () => {
    const storage = createMemoryStorage();

    expect(shouldPollFeedbackConversation(1_000, storage)).toBe(true);
    markFeedbackConversationPollAttempt(1_000, storage);

    expect(shouldPollFeedbackConversation(1_000 + 23 * 60 * 60 * 1000, storage)).toBe(false);
    expect(shouldPollFeedbackConversation(1_000 + 24 * 60 * 60 * 1000, storage)).toBe(true);
  });

  it('reads an existing identity without creating a new one', () => {
    const storage = createMemoryStorage();

    expect(getFeedbackConversationIdentity(storage)).toBeNull();

    const identity = getOrCreateFeedbackConversationIdentity(storage);
    expect(getFeedbackConversationIdentity(storage)).toEqual(identity);
  });

  it('clears the local identity after server deletion', () => {
    const storage = createMemoryStorage();
    getOrCreateFeedbackConversationIdentity(storage);

    clearFeedbackConversationIdentity(storage);

    expect(getFeedbackConversationIdentity(storage)).toBeNull();
  });

  it('stores the unread developer reply flag locally', () => {
    const storage = createMemoryStorage();

    expect(getFeedbackConversationUnreadState(storage)).toBe(false);
    setFeedbackConversationUnreadState(true, storage);
    expect(getFeedbackConversationUnreadState(storage)).toBe(true);
    setFeedbackConversationUnreadState(false, storage);
    expect(getFeedbackConversationUnreadState(storage)).toBe(false);
  });

  it('runs the daily unread check only after 4:00 JST and once per JST date', () => {
    const storage = createMemoryStorage();

    expect(shouldRunDailyFeedbackUnreadCheck(new Date('2026-06-03T18:59:00.000Z'), storage)).toBe(false);
    expect(shouldRunDailyFeedbackUnreadCheck(new Date('2026-06-03T19:00:00.000Z'), storage)).toBe(true);

    markDailyFeedbackUnreadCheck(new Date('2026-06-03T19:00:00.000Z'), storage);
    expect(shouldRunDailyFeedbackUnreadCheck(new Date('2026-06-03T23:00:00.000Z'), storage)).toBe(false);
    expect(shouldRunDailyFeedbackUnreadCheck(new Date('2026-06-04T19:00:00.000Z'), storage)).toBe(true);
  });

  it('detects unread developer replies only', () => {
    const messages = [
      { messageId: 'user-1', authorType: 'user' as const, body: 'hello', createdAt: '2026-06-01T00:00:00.000Z', readByUser: false },
      { messageId: 'dev-read', authorType: 'developer' as const, body: 'read', createdAt: '2026-06-01T00:00:01.000Z', readByUser: true },
      { messageId: 'dev-unread', authorType: 'developer' as const, body: 'unread', createdAt: '2026-06-01T00:00:02.000Z', readByUser: false },
    ];

    expect(hasUnreadDeveloperReply(messages)).toBe(true);
    expect(getUnreadDeveloperReplyIds(messages)).toEqual(['dev-unread']);
    expect(hasUnreadDeveloperReply(messages.filter((message) => message.messageId !== 'dev-unread'))).toBe(false);
  });

  it('polls conversation messages through the feedback API', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      messages: [
        {
          messageId: 'message-1',
          authorType: 'developer',
          body: 'hello',
          createdAt: '2026-06-01T00:00:00.000Z',
          readByUser: false,
        },
      ],
    }))) as unknown as typeof fetch;

    const messages = await pollFeedbackConversationMessages({
      conversationId: 'conversation-1',
      secretToken: 'secret',
    }, fetchImpl);

    expect(messages).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledWith(`${window.location.origin}/api/feedback/conversation/poll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: 'conversation-1', secretToken: 'secret' }),
    });
  });

  it('acks displayed conversation messages through the feedback API', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ success: true }))) as unknown as typeof fetch;

    await expect(ackFeedbackConversationMessages({
      conversationId: 'conversation-1',
      secretToken: 'secret',
    }, ['message-1'], fetchImpl)).resolves.toBe(true);

    expect(fetchImpl).toHaveBeenCalledWith(`${window.location.origin}/api/feedback/conversation/ack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: 'conversation-1',
        secretToken: 'secret',
        messageIds: ['message-1'],
      }),
    });
  });

  it('deletes a conversation through the authenticated feedback API', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ success: true }))) as unknown as typeof fetch;
    const identity = { conversationId: 'conversation-1', secretToken: 'secret' };

    await expect(deleteFeedbackConversation(identity, fetchImpl)).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(`${window.location.origin}/api/feedback/conversation/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(identity),
    });
  });

  it('uses the current web origin for hosted browser pages', () => {
    expect(getFeedbackApiBaseUrl()).toBe(`${window.location.origin}/api/feedback`);
  });

  it('uses the develop branch API for feedback in local development', () => {
    vi.stubEnv('NODE_ENV', 'development');

    expect(getFeedbackApiBaseUrl()).toBe(
      'https://ore-no-fusen-git-develop-uch54s-projects.vercel.app/api/feedback',
    );
  });

  it('uses the public production API from the Tauri desktop runtime', () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });

    expect(getFeedbackApiBaseUrl()).toBe('https://ore-no-fusen.vercel.app/api/feedback');
  });

  it('uses the develop branch API for developer-only actions in local development', () => {
    vi.stubEnv('NODE_ENV', 'development');

    expect(getDeveloperFeedbackApiBaseUrl()).toBe(
      'https://ore-no-fusen-git-develop-uch54s-projects.vercel.app/api/feedback',
    );
  });
});
