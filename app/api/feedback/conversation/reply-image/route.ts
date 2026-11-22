import { NextResponse } from 'next/server';
import { readFeedbackImage } from '../../lib/blob-storage';
import { boundedString, FeedbackRequestError, readFeedbackJson } from '../../lib/security';
import { createFeedbackConversationStore } from '../../lib/store';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};

export async function POST(request: Request) {
  try {
    const body = await readFeedbackJson(request, 4096);
    const conversationId = boundedString(body.conversationId, 'conversationId', 100, true);
    const secretToken = boundedString(body.secretToken, 'secretToken', 200, true);
    const fileId = boundedString(body.fileId, 'fileId', 34, true);
    if (process.env.FEEDBACK_CONVERSATION_ENABLED === 'false' || !/^r_[a-f0-9]{32}$/.test(fileId)) {
      return new NextResponse(null, { status: 404, headers });
    }
    const messages = await createFeedbackConversationStore().listMessages(conversationId, secretToken);
    if (!messages.some(message => !message.shadowOnly && message.authorType === 'developer' && message.replyImageIds?.includes(fileId))) {
      return new NextResponse(null, { status: 404, headers });
    }
    const image = await readFeedbackImage(conversationId, fileId);
    return image
      ? new NextResponse(image.file, { headers: { ...headers, 'Content-Type': image.file.type } })
      : new NextResponse(null, { status: 404, headers });
  } catch (error) {
    return new NextResponse(null, { status: error instanceof FeedbackRequestError ? error.status : 503, headers });
  }
}

export const OPTIONS = () => new NextResponse(null, { status: 204, headers });
