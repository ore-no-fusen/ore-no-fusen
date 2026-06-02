import { extractConversationIdFromDiscordEmbeds } from '../../lib/security';
import type { FeedbackConversationStore } from '../../lib/store';

type DiscordEmbed = {
  fields?: Array<{
    name?: string;
    value?: string;
  }>;
};

export type DiscordMessage = {
  id: string;
  channel_id: string;
  content: string;
  embeds?: DiscordEmbed[];
  author?: {
    id?: string;
    bot?: boolean;
  };
  message_reference?: {
    message_id?: string;
    channel_id?: string;
  };
  referenced_message?: {
    id?: string;
    embeds?: DiscordEmbed[];
  } | null;
  thread?: {
    id?: string;
  } | null;
};

async function fetchDiscordMessage(
  botToken: string,
  channelId: string,
  messageId: string,
): Promise<DiscordMessage | null> {
  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, {
    headers: { Authorization: `Bot ${botToken}` },
  });
  if (!response.ok) return null;
  return await response.json() as DiscordMessage;
}

export async function resolveDiscordConversationIdForMessage(
  message: DiscordMessage,
  botToken: string,
  store: Pick<
    FeedbackConversationStore,
    'getConversation' | 'getConversationIdByDiscordMessage' | 'getConversationIdByDiscordThread'
  >,
): Promise<{ conversationId: string | null; referencedMessageId: string | null }> {
  const referencedMessageId = message.message_reference?.message_id ?? message.referenced_message?.id ?? null;
  let mappedConversationId = referencedMessageId
    ? await store.getConversationIdByDiscordMessage(referencedMessageId)
    : null;

  if (!mappedConversationId && message.thread?.id) {
    mappedConversationId = await store.getConversationIdByDiscordThread(message.thread.id);
  }

  if (!mappedConversationId) {
    const embeddedConversationId = extractConversationIdFromDiscordEmbeds(message.referenced_message?.embeds);
    if (embeddedConversationId && await store.getConversation(embeddedConversationId)) {
      mappedConversationId = embeddedConversationId;
    }
  }

  if (!mappedConversationId && referencedMessageId) {
    const referencedChannelId = message.message_reference?.channel_id ?? message.channel_id;
    const referencedMessage = await fetchDiscordMessage(botToken, referencedChannelId, referencedMessageId);
    const embeddedConversationId = extractConversationIdFromDiscordEmbeds(referencedMessage?.embeds);
    if (embeddedConversationId && await store.getConversation(embeddedConversationId)) {
      mappedConversationId = embeddedConversationId;
    }
  }

  return { conversationId: mappedConversationId, referencedMessageId };
}
