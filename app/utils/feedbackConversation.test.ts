import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getDeveloperFeedbackApiBaseUrl,
  getFeedbackApiBaseUrl,
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
