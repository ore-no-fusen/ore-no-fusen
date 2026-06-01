const CONVERSATION_ID_KEY = 'ore-no-fusen.feedback.conversation_id';
const SECRET_TOKEN_KEY = 'ore-no-fusen.feedback.secret_token';
const LAST_POLL_KEY = 'ore-no-fusen.feedback.last_poll_at';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export type FeedbackConversationIdentity = {
  conversationId: string;
  secretToken: string;
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function getStorage(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function createConversationId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `fc_${Date.now().toString(36)}_${randomBase64Url(12)}`;
}

export function getOrCreateFeedbackConversationIdentity(storage?: StorageLike): FeedbackConversationIdentity {
  const target = getStorage(storage);
  if (!target) {
    return {
      conversationId: createConversationId(),
      secretToken: randomBase64Url(32),
    };
  }

  const existingConversationId = target.getItem(CONVERSATION_ID_KEY);
  const existingSecretToken = target.getItem(SECRET_TOKEN_KEY);
  if (existingConversationId && existingSecretToken) {
    return { conversationId: existingConversationId, secretToken: existingSecretToken };
  }

  const identity = {
    conversationId: createConversationId(),
    secretToken: randomBase64Url(32),
  };
  target.setItem(CONVERSATION_ID_KEY, identity.conversationId);
  target.setItem(SECRET_TOKEN_KEY, identity.secretToken);
  return identity;
}

export function saveFeedbackConversationIdentity(identity: FeedbackConversationIdentity, storage?: StorageLike): void {
  const target = getStorage(storage);
  if (!target) return;
  target.setItem(CONVERSATION_ID_KEY, identity.conversationId);
  target.setItem(SECRET_TOKEN_KEY, identity.secretToken);
}

export function shouldPollFeedbackConversation(now = Date.now(), storage?: StorageLike): boolean {
  const target = getStorage(storage);
  if (!target) return false;
  const rawLastPollAt = target.getItem(LAST_POLL_KEY);
  if (!rawLastPollAt) return true;
  const lastPollAt = Number(rawLastPollAt);
  return !Number.isFinite(lastPollAt) || now - lastPollAt >= ONE_DAY_MS;
}

export function markFeedbackConversationPollAttempt(now = Date.now(), storage?: StorageLike): void {
  const target = getStorage(storage);
  if (!target) return;
  target.setItem(LAST_POLL_KEY, String(now));
}

export function getFeedbackApiBaseUrl(): string {
  return process.env.NODE_ENV === 'development'
    ? 'http://localhost:3002/api/feedback'
    : 'https://ore-no-fusen.vercel.app/api/feedback';
}
