import { createHash, randomBytes } from 'crypto';
import type { DeveloperReplyEligibilityInput, DeveloperReplyEligibilityResult } from './types';

export type DiscordEmbedLike = {
  fields?: Array<{
    name?: string;
    value?: string;
  }>;
};

export class FeedbackRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function readFeedbackJson(
  request: Request,
  maxBytes = 32 * 1024,
): Promise<Record<string, unknown>> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new FeedbackRequestError('request body too large', 413);
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new FeedbackRequestError('request body too large', 413);
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new FeedbackRequestError('invalid JSON body', 400);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new FeedbackRequestError('invalid JSON body', 400);
  }
  return value as Record<string, unknown>;
}

export function boundedString(
  value: unknown,
  field: string,
  maxLength: number,
  required = false,
): string {
  if (value === undefined || value === null || value === '') {
    if (required) throw new FeedbackRequestError(`invalid ${field}`, 400);
    return '';
  }
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new FeedbackRequestError(`invalid ${field}`, 400);
  }
  const trimmed = value.trim();
  if (required && !trimmed) {
    throw new FeedbackRequestError(`invalid ${field}`, 400);
  }
  return trimmed;
}

export function discordFetchSignal(): AbortSignal {
  return AbortSignal.timeout(10_000);
}

export function createSecretToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSecretToken(secretToken: string): string {
  return createHash('sha256').update(secretToken, 'utf8').digest('hex');
}

export function safeEqualHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function parseAllowedDiscordUserIds(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function extractConversationIdFromDiscordEmbeds(embeds: DiscordEmbedLike[] | undefined): string | null {
  for (const embed of embeds ?? []) {
    for (const field of embed.fields ?? []) {
      if (field.name === '会話ID' && field.value?.trim()) {
        return field.value.trim();
      }
    }
  }

  return null;
}

export function evaluateDeveloperReplyEligibility(
  input: DeveloperReplyEligibilityInput,
): DeveloperReplyEligibilityResult {
  const { message, allowedDiscordUserIds, mappedConversationId, alreadyIngested } = input;

  if ((!message.referencedMessageId && !message.threadId) || !mappedConversationId) {
    return { ok: false, reason: 'not_reply_to_conversation' };
  }

  if (message.authorIsBot) {
    return { ok: false, reason: 'bot_message' };
  }

  if (!allowedDiscordUserIds.includes(message.authorId)) {
    return { ok: false, reason: 'author_not_allowed' };
  }

  if (!message.content.trim()) {
    return { ok: false, reason: 'empty_body' };
  }

  if (alreadyIngested) {
    return { ok: false, reason: 'duplicate' };
  }

  return {
    ok: true,
    conversationId: mappedConversationId,
    reason: 'accepted',
  };
}
