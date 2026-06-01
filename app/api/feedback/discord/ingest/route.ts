import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { evaluateDeveloperReplyEligibility, parseAllowedDiscordUserIds } from '../../lib/security';
import { createFeedbackConversationStore } from '../../lib/store';
import type { DiscordCandidateMessage } from '../../lib/types';

type DiscordMessage = {
  id: string;
  channel_id: string;
  content: string;
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
  } | null;
  thread?: {
    id?: string;
  } | null;
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function isAuthorized(req: Request): boolean {
  const expected = process.env.FEEDBACK_CONVERSATION_INGEST_SECRET;
  if (!expected) return false;
  const header = req.headers.get('authorization') ?? '';
  return header === `Bearer ${expected}`;
}

export async function GET() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405, headers: corsHeaders() });
}

export async function POST(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    }
    if (process.env.FEEDBACK_CONVERSATION_ENABLED === 'false') {
      return NextResponse.json({ ingested: 0, rejected: [] }, { headers: corsHeaders() });
    }

    const botToken = process.env.DISCORD_BOT_TOKEN;
    const channelId = process.env.DISCORD_FEEDBACK_CHANNEL_ID;
    if (!botToken || !channelId) {
      return NextResponse.json({ error: 'Missing Discord configuration' }, { status: 500, headers: corsHeaders() });
    }

    const store = createFeedbackConversationStore();
    const allowedDiscordUserIds = parseAllowedDiscordUserIds(process.env.ALLOWED_DISCORD_USER_IDS);
    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages?limit=50`, {
      headers: { Authorization: `Bot ${botToken}` },
    });
    if (!response.ok) {
      return NextResponse.json({ error: `Discord API error: ${response.status}` }, { status: 502, headers: corsHeaders() });
    }

    const messages = await response.json() as DiscordMessage[];
    let ingested = 0;
    const rejected: Array<{ discordMessageId: string; reason: string }> = [];

    for (const message of messages) {
      const referencedMessageId = message.message_reference?.message_id ?? message.referenced_message?.id ?? null;
      const mappedConversationId = referencedMessageId
        ? await store.getConversationIdByDiscordMessage(referencedMessageId)
        : message.thread?.id
          ? await store.getConversationIdByDiscordThread(message.thread.id)
          : null;
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

    return NextResponse.json({ ingested, rejected }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Discord ingest error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}
