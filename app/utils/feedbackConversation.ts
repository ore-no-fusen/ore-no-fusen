const CONVERSATION_ID_KEY = 'ore-no-fusen.feedback.conversation_id';
const SECRET_TOKEN_KEY = 'ore-no-fusen.feedback.secret_token';
const LAST_POLL_KEY = 'ore-no-fusen.feedback.last_poll_at';
const HAS_UNREAD_DEVELOPER_REPLY_KEY = 'ore-no-fusen.feedback.has_unread_developer_reply';
const LAST_UNREAD_CHECK_DATE_KEY = 'ore-no-fusen.feedback.last_unread_check_date';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAILY_UNREAD_CHECK_HOUR_JST = 4;
const PRODUCTION_FEEDBACK_API_BASE_URL = 'https://ore-no-fusen.vercel.app/api/feedback';
const DEVELOP_FEEDBACK_API_BASE_URL = 'https://ore-no-fusen-git-develop-uch54s-projects.vercel.app/api/feedback';

export type FeedbackConversationIdentity = {
  conversationId: string;
  secretToken: string;
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem'> & Partial<Pick<Storage, 'removeItem'>>;

export type FeedbackConversationMessage = {
  messageId: string;
  authorType: 'user' | 'developer';
  body: string;
  createdAt: string;
  readByUser: boolean;
};

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

export function getFeedbackConversationIdentity(storage?: StorageLike): FeedbackConversationIdentity | null {
  const target = getStorage(storage);
  if (!target) return null;
  const conversationId = target.getItem(CONVERSATION_ID_KEY);
  const secretToken = target.getItem(SECRET_TOKEN_KEY);
  if (!conversationId || !secretToken) return null;
  return { conversationId, secretToken };
}

export function saveFeedbackConversationIdentity(identity: FeedbackConversationIdentity, storage?: StorageLike): void {
  const target = getStorage(storage);
  if (!target) return;
  target.setItem(CONVERSATION_ID_KEY, identity.conversationId);
  target.setItem(SECRET_TOKEN_KEY, identity.secretToken);
}

export function clearFeedbackConversationIdentity(storage?: StorageLike): void {
  const target = getStorage(storage);
  if (!target?.removeItem) return;
  target.removeItem(CONVERSATION_ID_KEY);
  target.removeItem(SECRET_TOKEN_KEY);
  target.removeItem(LAST_POLL_KEY);
  target.removeItem(HAS_UNREAD_DEVELOPER_REPLY_KEY);
  target.removeItem(LAST_UNREAD_CHECK_DATE_KEY);
}

export function getFeedbackConversationUnreadState(storage?: StorageLike): boolean {
  const target = getStorage(storage);
  if (!target) return false;
  return target.getItem(HAS_UNREAD_DEVELOPER_REPLY_KEY) === 'true';
}

export function setFeedbackConversationUnreadState(hasUnread: boolean, storage?: StorageLike): void {
  const target = getStorage(storage);
  if (!target) return;
  target.setItem(HAS_UNREAD_DEVELOPER_REPLY_KEY, hasUnread ? 'true' : 'false');
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

function getJstDateParts(now: Date): { date: string; hour: number } {
  const shifted = new Date(now.getTime() + JST_OFFSET_MS);
  return {
    date: shifted.toISOString().slice(0, 10),
    hour: shifted.getUTCHours(),
  };
}

export function shouldRunDailyFeedbackUnreadCheck(now = new Date(), storage?: StorageLike): boolean {
  const target = getStorage(storage);
  if (!target) return false;
  const { date, hour } = getJstDateParts(now);
  if (hour < DAILY_UNREAD_CHECK_HOUR_JST) return false;
  return target.getItem(LAST_UNREAD_CHECK_DATE_KEY) !== date;
}

export function markDailyFeedbackUnreadCheck(now = new Date(), storage?: StorageLike): void {
  const target = getStorage(storage);
  if (!target) return;
  target.setItem(LAST_UNREAD_CHECK_DATE_KEY, getJstDateParts(now).date);
}

export function hasUnreadDeveloperReply(messages: FeedbackConversationMessage[]): boolean {
  return messages.some((message) => message.authorType === 'developer' && !message.readByUser);
}

export function getUnreadDeveloperReplyIds(messages: FeedbackConversationMessage[]): string[] {
  return messages
    .filter((message) => message.authorType === 'developer' && !message.readByUser)
    .map((message) => message.messageId);
}

export async function pollFeedbackConversationMessages(
  identity: FeedbackConversationIdentity,
  fetchImpl: typeof fetch = fetch,
): Promise<FeedbackConversationMessage[]> {
  const response = await fetchImpl(`${getFeedbackApiBaseUrl()}/conversation/poll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(identity),
  });
  if (!response.ok) throw new Error(`Server error: ${response.status}`);
  const data = await response.json().catch(() => null) as { messages?: FeedbackConversationMessage[] } | null;
  return data?.messages ?? [];
}

export async function ackFeedbackConversationMessages(
  identity: FeedbackConversationIdentity,
  messageIds: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (messageIds.length === 0) return true;
  const response = await fetchImpl(`${getFeedbackApiBaseUrl()}/conversation/ack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...identity, messageIds }),
  });
  if (!response.ok) return false;
  const data = await response.json().catch(() => null) as { success?: boolean } | null;
  return data?.success === true;
}

export async function deleteFeedbackConversation(
  identity: FeedbackConversationIdentity,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const response = await fetchImpl(`${getFeedbackApiBaseUrl()}/conversation/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(identity),
  });
  if (!response.ok) return false;
  const data = await response.json().catch(() => null) as { success?: boolean } | null;
  return data?.success === true;
}

export function getFeedbackApiBaseUrl(): string {
  if (process.env.NODE_ENV === 'development') {
    return DEVELOP_FEEDBACK_API_BASE_URL;
  }

  if (typeof window !== 'undefined') {
    const isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
    const origin = window.location.origin;
    if (!isTauri && /^https?:\/\//.test(origin)) {
      return `${origin}/api/feedback`;
    }
  }

  return PRODUCTION_FEEDBACK_API_BASE_URL;
}

export function getDeveloperFeedbackApiBaseUrl(): string {
  if (process.env.NODE_ENV === 'development') {
    return DEVELOP_FEEDBACK_API_BASE_URL;
  }

  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    if (/^https?:\/\/ore-no-fusen-[^.]+\.vercel\.app$/.test(origin)) {
      return `${origin}/api/feedback`;
    }
  }

  return PRODUCTION_FEEDBACK_API_BASE_URL;
}
