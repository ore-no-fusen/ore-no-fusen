import { createHash, randomBytes } from 'crypto';
import type { DeveloperReplyEligibilityInput, DeveloperReplyEligibilityResult } from './types';

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
