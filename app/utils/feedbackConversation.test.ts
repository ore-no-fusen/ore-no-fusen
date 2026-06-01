import { describe, expect, it, vi } from 'vitest';
import {
  getOrCreateFeedbackConversationIdentity,
  markFeedbackConversationPollAttempt,
  shouldPollFeedbackConversation,
} from './feedbackConversation';

function createMemoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => map.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      map.set(key, value);
    }),
  };
}

describe('feedback conversation identity', () => {
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
});
