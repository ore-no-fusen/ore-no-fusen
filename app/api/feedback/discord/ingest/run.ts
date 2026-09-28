import { randomUUID } from 'crypto';
import {
  evaluateDeveloperReplyEligibility,
  parseAllowedDiscordUserIds,
} from '../../lib/security';
import { createFeedbackConversationStore } from '../../lib/store';
import type { DiscordCandidateMessage } from '../../lib/types';
import { resolveDiscordConversationIdForMessage } from './resolve';
import type { DiscordMessage } from './resolve';

export type DiscordIngestResult = {
  ingested: number;
  rejected: Array<{ discordMessageId: string; reason: string }>;
  lastSeenId?: string;
};

export type DiscordIngestFailure = {
  error: string;
  status: number;
};

export function isDiscordIngestFailure(result: DiscordIngestResult | DiscordIngestFailure): result is DiscordIngestFailure {
  return 'error' in result;
}

export async function runDiscordIngest(afterId?: string): Promise<DiscordIngestResult | DiscordIngestFailure> {
  if (process.env.FEEDBACK_CONVERSATION_ENABLED === 'false') {
    return { ingested: 0, rejected: [] };
  }

  const botToken = process.env.DISCORD_BOT_TOKEN;
  const channelId = process.env.DISCORD_FEEDBACK_CHANNEL_ID;
  if (!botToken || !channelId) {
    return { error: 'Missing Discord configuration', status: 500 };
  }

  const store = createFeedbackConversationStore();
  const allowedDiscordUserIds = parseAllowedDiscordUserIds(process.env.ALLOWED_DISCORD_USER_IDS);
  const messages: DiscordMessage[] = [];
  let beforeId: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const params = new URLSearchParams({ limit: afterId ? '100' : '50' });
    if (beforeId) params.set('before', beforeId);
    else if (afterId) params.set('after', afterId);
    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages?${params}`, {
      headers: { Authorization: `Bot ${botToken}` },
    });
    if (!response.ok) return { error: `Discord API error: ${response.status}`, status: 502 };
    const pageMessages = await response.json() as DiscordMessage[];
    messages.push(...pageMessages.filter(message => !afterId || BigInt(message.id) > BigInt(afterId)));
    if (!afterId || pageMessages.length < 100 || pageMessages.some(message => BigInt(message.id) <= BigInt(afterId))) break;
    if (page === 9) return { error: 'Too many new Discord messages to import at once', status: 503 };
    beforeId = pageMessages.at(-1)?.id;
  }
  const lastSeenId = messages[0]?.id ?? afterId;
  let ingested = 0;
  const rejected: Array<{ discordMessageId: string; reason: string }> = [];

  for (const message of messages.reverse()) {
    const botMessage = message.author?.bot === true;
    if (botMessage || !allowedDiscordUserIds.includes(message.author?.id ?? '')) {
      rejected.push({ discordMessageId: message.id, reason: botMessage ? 'bot_message' : 'author_not_allowed' });
      continue;
    }
    const { conversationId: mappedConversationId, referencedMessageId } =
      await resolveDiscordConversationIdForMessage(message, botToken, store);
    const candidate: DiscordCandidateMessage = {
      id: message.id,
      channelId: message.channel_id,
      authorId: message.author?.id ?? '',
      authorIsBot: message.author?.bot === true,
      content: message.content,
      referencedMessageId,
      threadId: message.thread?.id ?? null,
    };
    const result = evaluateDeveloperReplyEligibility({
      message: candidate,
      allowedDiscordUserIds,
      mappedConversationId,
      alreadyIngested: await store.hasDiscordMessage(message.id),
    });

    if (!result.ok) {
      rejected.push({ discordMessageId: message.id, reason: result.reason });
      continue;
    }

    const saved = await store.appendMessage({
      messageId: randomUUID(),
      conversationId: result.conversationId,
      authorType: 'developer',
      body: message.content.trim(),
      discordMessageId: message.id,
      createdAt: message.timestamp && Number.isFinite(Date.parse(message.timestamp)) ? message.timestamp : new Date().toISOString(),
      readByUser: false,
      shadowOnly: process.env.FEEDBACK_CONVERSATION_SHADOW_MODE === 'true',
    });
    if (saved) ingested += 1;
  }

  return { ingested, rejected, ...(lastSeenId ? { lastSeenId } : {}) };
}
