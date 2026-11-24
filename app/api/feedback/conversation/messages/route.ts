import { fetchWithDeadline } from '@/app/api/feedback/lib/request-budget';
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
import { feedbackEnvironment, feedbackDiscordConversationFieldName } from '../../lib/environment';
import { conversationMemberNumber } from '../../../members/lib/conversation-number';
import { BLOB_IMAGE_ID, readFeedbackImage } from '../../lib/blob-storage';

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
    const blobImages: NonNullable<Awaited<ReturnType<typeof readFeedbackImage>>>[] = [];
    let imagesOmitted = providedFileIds.some(fileId => !BLOB_IMAGE_ID.test(fileId));
    if (imagesOmitted && body.allowTextOnlyOnImageFailure !== true) {
      throw new FeedbackRequestError('Image not found', 404);
    }
    if (!imagesOmitted) {
      try {
        for (const fileId of providedFileIds) {
          const image = await readFeedbackImage(conversationId, fileId);
          if (!image) throw new FeedbackRequestError('Image not found', 404);
          blobImages.push(image);
        }
      } catch (error) {
        // Only opt-in clients can report omitted attachments. Preserve ownership errors.
        if (body.allowTextOnlyOnImageFailure !== true || error instanceof FeedbackRequestError) throw error;
        imagesOmitted = true;
        blobImages.length = 0;
      }
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
        { name: '環境', value: feedbackEnvironment() === 'development' ? '開発（検証用）' : '本番', inline: true },
        ...(memberNumber ? [{ name:'会員番号', value:memberNumber }] : []),
        { name: '内容', value: content },
        { name: '連絡先', value: contact || 'なし', inline: true },
        { name: 'バージョン', value: version || '不明', inline: true },
        { name: feedbackDiscordConversationFieldName(), value: conversationId },
        { name: '直近5件', value: formatRecentContext(recentMessages) },
      ],
      footer: {
        text: `OS: ${systemInfo || 'Unknown'} | IP: ${req.headers.get('x-forwarded-for') || 'Unknown'}`,
      },
      timestamp: now,
    };
    const discordUrl = new URL(webhookUrl);
    discordUrl.searchParams.set('wait', 'true');
    const payload = {
      embeds: [embed],
    };
    const form = blobImages.length ? new FormData() : null;
    if (form) {
      const attachments = blobImages.map(({ file, extension }, id) => {
        const filename = `image-${id + 1}.${extension}`;
        form.append(`files[${id}]`, file, filename);
        return { id, filename };
      });
      form.set('payload_json', JSON.stringify({ ...payload, attachments }));
    }
    const discordResponse = await fetchWithDeadline(discordUrl.toString(), {
      method: 'POST',
      headers: form ? undefined : { 'Content-Type': 'application/json' },
      body: form ?? JSON.stringify(payload),
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

    return NextResponse.json({ success: true, conversationId, secretToken, ...(imagesOmitted ? { imagesOmitted: true } : {}) }, { headers: corsHeaders() });
  } catch (error) {
    if (error instanceof FeedbackRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: corsHeaders() });
    }
    console.error('Feedback conversation message error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}
