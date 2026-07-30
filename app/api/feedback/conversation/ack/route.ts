import { NextResponse } from 'next/server';
import { createFeedbackConversationStore } from '../../lib/store';
import type { FeedbackConversationMessage } from '../../lib/types';
import {
  boundedString,
  discordFetchSignal,
  FeedbackRequestError,
  readFeedbackJson,
} from '../../lib/security';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function GET() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405, headers: corsHeaders() });
}

function formatReadReceiptTimestamp(date = new Date()): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function buildReadReceiptContent(conversationId: string, messages: FeedbackConversationMessage[]): string {
  const messageCount = messages.length;
  const sortedMessageTimes = messages
    .map((message) => message.createdAt)
    .sort();
  const latestMessageAt = sortedMessageTimes[sortedMessageTimes.length - 1];

  return [
    'ユーザーがあなたの返信を見ました',
    `会話ID: ${conversationId}`,
    `見られた返信: ${messageCount}件`,
    `時刻: ${formatReadReceiptTimestamp()}`,
    latestMessageAt ? `対象の最新返信: ${latestMessageAt}` : null,
  ].filter((line): line is string => line !== null).join('\n');
}

async function notifyDiscordReadReceipt(conversationId: string, messages: FeedbackConversationMessage[]): Promise<void> {
  if (messages.length === 0) return;

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: buildReadReceiptContent(conversationId, messages),
      allowed_mentions: { parse: [] },
    }),
    signal: discordFetchSignal(),
  });

  if (!response.ok) {
    throw new Error(`Discord read receipt error: ${response.status}`);
  }
}

export async function POST(req: Request) {
  try {
    const body = await readFeedbackJson(req, 16 * 1024);
    const conversationId = boundedString(body.conversationId, 'conversationId', 100);
    const secretToken = boundedString(body.secretToken, 'secretToken', 200);
    const messageIds = Array.isArray(body.messageIds)
      ? body.messageIds
          .filter((id: unknown): id is string => typeof id === 'string' && id.length <= 100)
          .slice(0, 100)
      : [];
    if (!conversationId || !secretToken || messageIds.length === 0) {
      return NextResponse.json({ success: false }, { headers: corsHeaders() });
    }

    const store = createFeedbackConversationStore();
    const beforeMessages = await store.listMessages(conversationId, secretToken);
    const requestedIds = new Set(messageIds);
    const unreadDeveloperMessages = beforeMessages.filter((message) => (
      requestedIds.has(message.messageId) &&
      message.authorType === 'developer' &&
      !message.readByUser &&
      !message.shadowOnly
    ));

    const success = await store.markMessagesRead(conversationId, secretToken, messageIds);
    if (success) {
      await notifyDiscordReadReceipt(conversationId, unreadDeveloperMessages).catch((error) => {
        console.error('Discord read receipt notification error:', error);
      });
    }
    return NextResponse.json({ success }, { headers: corsHeaders() });
  } catch (error) {
    if (error instanceof FeedbackRequestError) {
      return NextResponse.json({ success: false, error: error.message }, {
        status: error.status,
        headers: corsHeaders(),
      });
    }
    console.error('Feedback conversation ack error:', error);
    return NextResponse.json({ success: false }, { headers: corsHeaders() });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}
