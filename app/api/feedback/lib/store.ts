import { hashSecretToken, safeEqualHash } from './security';
import type { FeedbackConversation, FeedbackConversationMessage } from './types';

export interface FeedbackConversationStore {
  createConversation(conversation: FeedbackConversation): Promise<void>;
  getConversation(conversationId: string): Promise<FeedbackConversation | null>;
  getConversationIdByDiscordMessage(discordMessageId: string): Promise<string | null>;
  getConversationIdByDiscordThread(discordThreadId: string): Promise<string | null>;
  appendMessage(message: FeedbackConversationMessage): Promise<boolean>;
  hasDiscordMessage(discordMessageId: string): Promise<boolean>;
  listMessages(conversationId: string, secretToken: string): Promise<FeedbackConversationMessage[]>;
  listLatestMessages(conversationId: string, limit: number): Promise<FeedbackConversationMessage[]>;
  listUnreadDeveloperMessages(conversationId: string, secretToken: string): Promise<FeedbackConversationMessage[]>;
  markMessagesRead(conversationId: string, secretToken: string, messageIds: string[]): Promise<boolean>;
  deleteConversation(conversationId: string, secretToken: string): Promise<boolean>;
}

class MemoryFeedbackConversationStore implements FeedbackConversationStore {
  private conversations = new Map<string, FeedbackConversation>();
  private discordMessageToConversation = new Map<string, string>();
  private discordThreadToConversation = new Map<string, string>();
  private messages = new Map<string, FeedbackConversationMessage>();

  async createConversation(conversation: FeedbackConversation): Promise<void> {
    this.conversations.set(conversation.conversationId, conversation);
    if (conversation.discordMessageId) {
      this.discordMessageToConversation.set(conversation.discordMessageId, conversation.conversationId);
    }
    if (conversation.discordThreadId) {
      this.discordThreadToConversation.set(conversation.discordThreadId, conversation.conversationId);
    }
  }

  async getConversation(conversationId: string): Promise<FeedbackConversation | null> {
    return this.conversations.get(conversationId) ?? null;
  }

  async getConversationIdByDiscordMessage(discordMessageId: string): Promise<string | null> {
    return this.discordMessageToConversation.get(discordMessageId) ?? null;
  }

  async getConversationIdByDiscordThread(discordThreadId: string): Promise<string | null> {
    return this.discordThreadToConversation.get(discordThreadId) ?? null;
  }

  async appendMessage(message: FeedbackConversationMessage): Promise<boolean> {
    if (this.messages.has(message.messageId)) return false;
    if (message.discordMessageId && await this.hasDiscordMessage(message.discordMessageId)) return false;
    this.messages.set(message.messageId, message);
    return true;
  }

  async hasDiscordMessage(discordMessageId: string): Promise<boolean> {
    return [...this.messages.values()].some((message) => message.discordMessageId === discordMessageId);
  }

  async listMessages(conversationId: string, secretToken: string): Promise<FeedbackConversationMessage[]> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation || !safeEqualHash(conversation.secretTokenHash, hashSecretToken(secretToken))) return [];
    return this.listConversationMessages(conversationId);
  }

  async listLatestMessages(conversationId: string, limit: number): Promise<FeedbackConversationMessage[]> {
    return this.listConversationMessages(conversationId).slice(-Math.max(0, limit));
  }

  async listUnreadDeveloperMessages(
    conversationId: string,
    secretToken: string,
  ): Promise<FeedbackConversationMessage[]> {
    const messages = await this.listMessages(conversationId, secretToken);
    return messages.filter(
      (message) => message.authorType === 'developer' && !message.readByUser && !message.shadowOnly,
    );
  }

  async markMessagesRead(conversationId: string, secretToken: string, messageIds: string[]): Promise<boolean> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation || !safeEqualHash(conversation.secretTokenHash, hashSecretToken(secretToken))) return false;
    const ids = new Set(messageIds);
    for (const [messageId, message] of this.messages.entries()) {
      if (message.conversationId === conversationId && ids.has(messageId)) {
        this.messages.set(messageId, { ...message, readByUser: true });
      }
    }
    return true;
  }

  async deleteConversation(conversationId: string, secretToken: string): Promise<boolean> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation || !safeEqualHash(conversation.secretTokenHash, hashSecretToken(secretToken))) return false;

    if (conversation.discordMessageId) this.discordMessageToConversation.delete(conversation.discordMessageId);
    if (conversation.discordThreadId) this.discordThreadToConversation.delete(conversation.discordThreadId);
    for (const [messageId, message] of this.messages.entries()) {
      if (message.conversationId !== conversationId) continue;
      if (message.discordMessageId) this.discordMessageToConversation.delete(message.discordMessageId);
      this.messages.delete(messageId);
    }
    this.conversations.delete(conversationId);
    return true;
  }

  private listConversationMessages(conversationId: string): FeedbackConversationMessage[] {
    return [...this.messages.values()]
      .filter((message) => message.conversationId === conversationId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}

type FirestoreValue =
  | { stringValue: string }
  | { booleanValue: boolean }
  | { nullValue: null };

type FirestoreDocument = {
  name?: string;
  fields?: Record<string, FirestoreValue>;
};

type FirestoreRunQueryRow = {
  document?: FirestoreDocument;
};

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function toFirestoreFields(input: Record<string, string | boolean | null | undefined>): Record<string, FirestoreValue> {
  const fields: Record<string, FirestoreValue> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string') fields[key] = { stringValue: value };
    else if (typeof value === 'boolean') fields[key] = { booleanValue: value };
    else if (value === null) fields[key] = { nullValue: null };
  }
  return fields;
}

function readString(fields: Record<string, FirestoreValue> | undefined, key: string): string | undefined {
  const value = fields?.[key];
  return value && 'stringValue' in value ? value.stringValue : undefined;
}

function readBoolean(fields: Record<string, FirestoreValue> | undefined, key: string, fallback: boolean): boolean {
  const value = fields?.[key];
  return value && 'booleanValue' in value ? value.booleanValue : fallback;
}

function conversationFromDocument(document: FirestoreDocument): FeedbackConversation | null {
  const fields = document.fields;
  const conversationId = readString(fields, 'conversation_id');
  const secretTokenHash = readString(fields, 'secret_token_hash');
  const createdAt = readString(fields, 'created_at');
  const updatedAt = readString(fields, 'updated_at');
  if (!conversationId || !secretTokenHash || !createdAt || !updatedAt) return null;

  return {
    conversationId,
    secretTokenHash,
    discordChannelId: readString(fields, 'discord_channel_id'),
    discordMessageId: readString(fields, 'discord_message_id'),
    discordThreadId: readString(fields, 'discord_thread_id'),
    deliveryEnabled: readBoolean(fields, 'delivery_enabled', true),
    shadowOnly: readBoolean(fields, 'shadow_only', false),
    createdAt,
    updatedAt,
  };
}

function messageFromDocument(document: FirestoreDocument): FeedbackConversationMessage | null {
  const fields = document.fields;
  const messageId = readString(fields, 'message_id');
  const conversationId = readString(fields, 'conversation_id');
  const authorType = readString(fields, 'author_type');
  const body = readString(fields, 'body');
  const createdAt = readString(fields, 'created_at');
  if (
    !messageId ||
    !conversationId ||
    (authorType !== 'user' && authorType !== 'developer') ||
    body === undefined ||
    !createdAt
  ) {
    return null;
  }

  return {
    messageId,
    conversationId,
    authorType,
    body,
    createdAt,
    discordMessageId: readString(fields, 'discord_message_id'),
    readByUser: readBoolean(fields, 'read_by_user', false),
    shadowOnly: readBoolean(fields, 'shadow_only', false),
  };
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

async function getFirestoreAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAt > nowSeconds + 60) {
    return cachedAccessToken.token;
  }

  const { createSign } = await import('crypto');
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Url(JSON.stringify({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  }));
  const unsigned = `${header}.${claim}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const normalizedPrivateKey = privateKey.replace(/\\n/g, '\n');
  const signature = signer.sign(normalizedPrivateKey).toString('base64url');
  const assertion = `${unsigned}.${signature}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!response.ok) {
    throw new Error(`Firebase auth error: ${response.status}`);
  }

  const data = await response.json() as { access_token: string; expires_in?: number };
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: nowSeconds + (data.expires_in ?? 3600),
  };
  return data.access_token;
}

class FirestoreFeedbackConversationStore implements FeedbackConversationStore {
  private readonly rootUrl: string;

  constructor(
    private readonly projectId: string,
    private readonly clientEmail: string,
    private readonly privateKey: string,
    databaseId = '(default)',
  ) {
    this.rootUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await getFirestoreAccessToken(this.clientEmail, this.privateKey);
    const response = await fetch(`${this.rootUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (response.status === 404) return null as T;
    if (!response.ok) {
      throw new Error(`Firestore error: ${response.status}`);
    }
    return await response.json() as T;
  }

  async createConversation(conversation: FeedbackConversation): Promise<void> {
    await this.request(`/feedback_conversations/${conversation.conversationId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        fields: toFirestoreFields({
          conversation_id: conversation.conversationId,
          secret_token_hash: conversation.secretTokenHash,
          discord_channel_id: conversation.discordChannelId,
          discord_message_id: conversation.discordMessageId,
          discord_thread_id: conversation.discordThreadId,
          delivery_enabled: conversation.deliveryEnabled,
          shadow_only: conversation.shadowOnly,
          created_at: conversation.createdAt,
          updated_at: conversation.updatedAt,
        }),
      }),
    });

    if (conversation.discordMessageId) {
      await this.writeDiscordIndex(conversation.discordMessageId, conversation.conversationId, 'message');
    }
    if (conversation.discordThreadId) {
      await this.writeDiscordIndex(conversation.discordThreadId, conversation.conversationId, 'thread');
    }
  }

  async getConversation(conversationId: string): Promise<FeedbackConversation | null> {
    const document = await this.request<FirestoreDocument | null>(`/feedback_conversations/${conversationId}`);
    return document ? conversationFromDocument(document) : null;
  }

  async getConversationIdByDiscordMessage(discordMessageId: string): Promise<string | null> {
    return await this.readDiscordIndex(discordMessageId);
  }

  async getConversationIdByDiscordThread(discordThreadId: string): Promise<string | null> {
    return await this.readDiscordIndex(discordThreadId);
  }

  async appendMessage(message: FeedbackConversationMessage): Promise<boolean> {
    if (message.discordMessageId && await this.hasDiscordMessage(message.discordMessageId)) return false;

    await this.request(`/feedback_conversations/${message.conversationId}/messages/${message.messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        fields: toFirestoreFields({
          message_id: message.messageId,
          conversation_id: message.conversationId,
          author_type: message.authorType,
          body: message.body,
          created_at: message.createdAt,
          discord_message_id: message.discordMessageId,
          read_by_user: message.readByUser,
          shadow_only: message.shadowOnly,
        }),
      }),
    });

    if (message.discordMessageId) {
      await this.writeDiscordIndex(message.discordMessageId, message.conversationId, 'developer_message');
    }
    return true;
  }

  async hasDiscordMessage(discordMessageId: string): Promise<boolean> {
    return (await this.readDiscordIndex(discordMessageId)) !== null;
  }

  async listMessages(conversationId: string, secretToken: string): Promise<FeedbackConversationMessage[]> {
    const conversation = await this.getConversation(conversationId);
    if (!conversation || !safeEqualHash(conversation.secretTokenHash, hashSecretToken(secretToken))) return [];
    return await this.listConversationMessages(conversationId);
  }

  async listLatestMessages(conversationId: string, limit: number): Promise<FeedbackConversationMessage[]> {
    return (await this.listConversationMessages(conversationId)).slice(-Math.max(0, limit));
  }

  async listUnreadDeveloperMessages(
    conversationId: string,
    secretToken: string,
  ): Promise<FeedbackConversationMessage[]> {
    const messages = await this.listMessages(conversationId, secretToken);
    return messages.filter(
      (message) => message.authorType === 'developer' && !message.readByUser && !message.shadowOnly,
    );
  }

  async markMessagesRead(conversationId: string, secretToken: string, messageIds: string[]): Promise<boolean> {
    const conversation = await this.getConversation(conversationId);
    if (!conversation || !safeEqualHash(conversation.secretTokenHash, hashSecretToken(secretToken))) return false;
    const ids = new Set(messageIds);
    const messages = await this.listConversationMessages(conversationId);
    for (const message of messages) {
      if (!ids.has(message.messageId)) continue;
      await this.request(`/feedback_conversations/${message.conversationId}/messages/${message.messageId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          fields: toFirestoreFields({
            message_id: message.messageId,
            conversation_id: message.conversationId,
            author_type: message.authorType,
            body: message.body,
            created_at: message.createdAt,
            discord_message_id: message.discordMessageId,
            read_by_user: true,
            shadow_only: message.shadowOnly,
          }),
        }),
      });
    }
    return true;
  }

  async deleteConversation(conversationId: string, secretToken: string): Promise<boolean> {
    const conversation = await this.getConversation(conversationId);
    if (!conversation || !safeEqualHash(conversation.secretTokenHash, hashSecretToken(secretToken))) return false;

    const messages = await this.listConversationMessages(conversationId);
    const mappingIds = new Set([
      conversation.discordMessageId,
      conversation.discordThreadId,
      ...messages.map((message) => message.discordMessageId),
    ].filter((id): id is string => Boolean(id)));

    for (const message of messages) {
      await this.request(`/feedback_conversations/${conversationId}/messages/${message.messageId}`, {
        method: 'DELETE',
      });
    }
    for (const mappingId of mappingIds) {
      await this.request(`/feedback_discord_mappings/${mappingId}`, { method: 'DELETE' });
    }
    await this.request(`/feedback_conversations/${conversationId}`, { method: 'DELETE' });
    return true;
  }

  private async listConversationMessages(conversationId: string): Promise<FeedbackConversationMessage[]> {
    const data = await this.request<{ documents?: FirestoreDocument[] } | null>(
      `/feedback_conversations/${conversationId}/messages`,
    );
    const documents = data?.documents ?? [];
    return documents
      .map(messageFromDocument)
      .filter((message): message is FeedbackConversationMessage => message !== null)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  private async writeDiscordIndex(
    discordId: string,
    conversationId: string,
    kind: string,
  ): Promise<void> {
    await this.request(`/feedback_discord_mappings/${discordId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        fields: toFirestoreFields({
          discord_id: discordId,
          conversation_id: conversationId,
          kind,
        }),
      }),
    });
  }

  private async readDiscordIndex(discordId: string): Promise<string | null> {
    const document = await this.request<FirestoreDocument | null>(`/feedback_discord_mappings/${discordId}`);
    return readString(document?.fields, 'conversation_id') ?? null;
  }
}

const globalStore = globalThis as typeof globalThis & {
  __feedbackConversationMemoryStore?: FeedbackConversationStore;
};

export function createFeedbackConversationStore(): FeedbackConversationStore {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (projectId && clientEmail && privateKey) {
    return new FirestoreFeedbackConversationStore(
      projectId,
      clientEmail,
      privateKey,
      process.env.FIREBASE_DATABASE_ID || '(default)',
    );
  }

  if (!globalStore.__feedbackConversationMemoryStore) {
    globalStore.__feedbackConversationMemoryStore = new MemoryFeedbackConversationStore();
  }
  return globalStore.__feedbackConversationMemoryStore;
}

export function createMemoryFeedbackConversationStore(): FeedbackConversationStore {
  return new MemoryFeedbackConversationStore();
}
