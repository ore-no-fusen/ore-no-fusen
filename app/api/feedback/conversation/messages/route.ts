import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import {
  boundedString,
  createSecretToken,
  discordFetchSignal,
  FeedbackRequestError,
  hashSecretToken,
  readFeedbackJson,
} from '../../lib/security';
import { createFeedbackConversationStore } from '../../lib/store';
import { conversationMemberNumber } from '../../../members/lib/conversation-number';
import {
  createPrivateImageViewUrl,
  FeedbackImageStorageError,
  getPrivateImageFileMetadata,
} from '../../lib/appwrite-storage';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function formatRecentContext(messages: Array<{ authorType: 'user' | 'developer'; body: string }>): string {
  if (messages.length === 0) return '過去のやりとりはまだありません。';
  return messages
    .map((message) => `${message.authorType === 'developer' ? 'アプリ開発者' : 'ユーザー'}: ${message.body}`)
    .join('\n')
    .slice(0, 1000);
}

function fileIds(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 3
    || new Set(value).size !== value.length
    || !value.every((id) => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/.test(id))) {
    throw new FeedbackRequestError('Invalid fileIds', 400);
  }
  return value;
}

export async function GET() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405, headers: corsHeaders() });
}

export async function POST(req: Request) {
  try {
    if (process.env.FEEDBACK_CONVERSATION_ENABLED === 'false') {
      return NextResponse.json({ error: 'Conversation disabled' }, { status: 503, headers: corsHeaders() });
    }

    const body = await readFeedbackJson(req);
    const content = boundedString(body.content, 'content', 1000, true);
    const providedFileIds = fileIds(body.fileIds);
    const providedConversationId = boundedString(body.conversationId, 'conversationId', 100);
    const providedSecretToken = boundedString(body.secretToken, 'secretToken', 200);
    const conversationId = providedConversationId
      ? providedConversationId
      : randomUUID();
    const secretToken = providedSecretToken
      ? providedSecretToken
      : createSecretToken();
    const type = boundedString(body.type, 'type', 32) || 'message';
    const contact = boundedString(body.contact, 'contact', 250);
    const systemInfo = boundedString(body.systemInfo, 'systemInfo', 500) || 'Unknown';
    const version = boundedString(body.version, 'version', 100) || 'Unknown';
    const now = new Date().toISOString();
    const store = createFeedbackConversationStore();
    // Authenticate/reserve ownership before reading history or notifying Discord.
    await store.createConversation({
      ...(await store.getConversation(conversationId)),
      conversationId, secretTokenHash: hashSecretToken(secretToken),
      deliveryEnabled: true, shadowOnly: process.env.FEEDBACK_CONVERSATION_SHADOW_MODE === 'true',
      createdAt: now, updatedAt: now,
    });
    const conversation = await store.getConversation(conversationId);
    const verifiedFileIds: string[] = [];
    for (const fileId of providedFileIds) {
      if (!conversation?.appwriteUserId) throw new FeedbackRequestError('Image not found', 404);
      const metadata = await getPrivateImageFileMetadata(fileId);
      const expectedRead = `read("user:${conversation.appwriteUserId}")`;
      const expectedDelete = `delete("user:${conversation.appwriteUserId}")`;
      if (!ALLOWED_IMAGE_TYPES.has(metadata.mimeType)
        || metadata.byteSize < 1
        || metadata.byteSize > MAX_IMAGE_BYTES
        || !metadata.permissions.includes(expectedRead)
        || !metadata.permissions.includes(expectedDelete)) {
        throw new FeedbackRequestError('Invalid image file', 400);
      }
      verifiedFileIds.push(metadata.fileId);
    }
    const recentMessages = await store.listLatestMessages(conversationId, 5);
    const memberNumber = await conversationMemberNumber(conversationId).catch(() => null);

    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
      throw new Error('Missing Discord webhook');
    }

    const embed = {
      title: `📨 新着フィードバック: ${type}`,
      color: type === 'bug' ? 0xff0000 : type === 'feature' ? 0x00ff00 : 0x0099ff,
      fields: [
        ...(memberNumber ? [{ name:'会員番号', value:memberNumber }] : []),
        { name: '内容', value: content },
        { name: '連絡先', value: contact || 'なし', inline: true },
        { name: 'バージョン', value: version || '不明', inline: true },
        { name: '会話ID', value: conversationId },
        { name: '直近5件', value: formatRecentContext(recentMessages) },
      ],
      footer: {
        text: `OS: ${systemInfo || 'Unknown'} | IP: ${req.headers.get('x-forwarded-for') || 'Unknown'}`,
      },
      timestamp: now,
    };
    const discordImageUrls = await Promise.all(
      verifiedFileIds.map((fileId) => createPrivateImageViewUrl(fileId)),
    );

    const discordUrl = new URL(webhookUrl);
    discordUrl.searchParams.set('wait', 'true');
    const discordResponse = await fetch(discordUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [embed, ...discordImageUrls.map((url) => ({ image: { url } }))],
      }),
      signal: discordFetchSignal(),
    });
    if (!discordResponse.ok) {
      throw new Error(`Discord API error: ${discordResponse.status}`);
    }
    const discordMessage = await discordResponse.json().catch(() => null) as {
      id?: string;
      channel_id?: string;
      thread_id?: string;
    } | null;

    await store.createConversation({
      ...conversation,
      conversationId,
      secretTokenHash: hashSecretToken(secretToken),
      discordChannelId: discordMessage?.channel_id,
      discordMessageId: discordMessage?.id,
      discordThreadId: discordMessage?.thread_id,
      deliveryEnabled: true,
      shadowOnly: process.env.FEEDBACK_CONVERSATION_SHADOW_MODE === 'true',
      createdAt: now,
      updatedAt: now,
    });
    await store.appendMessage({
      messageId: randomUUID(),
      conversationId,
      authorType: 'user',
      body: content,
      createdAt: now,
      readByUser: true,
      shadowOnly: false,
    });

    return NextResponse.json({ success: true, conversationId, secretToken }, { headers: corsHeaders() });
  } catch (error) {
    if (error instanceof FeedbackRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: corsHeaders() });
    }
    if (error instanceof FeedbackImageStorageError) {
      const status = error.status >= 500 ? 503 : 404;
      return NextResponse.json({ error: status === 503 ? 'Image storage unavailable' : 'Image not found' }, { status, headers: corsHeaders() });
    }
    console.error('Feedback conversation message error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}
