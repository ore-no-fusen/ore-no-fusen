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
};

export type DiscordIngestFailure = {
  error: string;
  status: number;
};

export function isDiscordIngestFailure(result: DiscordIngestResult | DiscordIngestFailure): result is DiscordIngestFailure {
  return 'error' in result;
}

export async function runDiscordIngest(): Promise<DiscordIngestResult | DiscordIngestFailure> {
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
  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages?limit=50`, {
    headers: { Authorization: `Bot ${botToken}` },
  });
  if (!response.ok) {
    return { error: `Discord API error: ${response.status}`, status: 502 };
  }

  const messages = await response.json() as DiscordMessage[];
  let ingested = 0;
  const rejected: Array<{ discordMessageId: string; reason: string }> = [];

  for (const message of messages) {
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
      createdAt: new Date().toISOString(),
      readByUser: false,
      shadowOnly: process.env.FEEDBACK_CONVERSATION_SHADOW_MODE === 'true',
    });
    if (saved) ingested += 1;
  }

  return { ingested, rejected };
}
