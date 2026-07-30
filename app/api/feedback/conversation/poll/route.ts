import { NextResponse } from 'next/server';
import { createFeedbackConversationStore } from '../../lib/store';
import {
  boundedString,
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

export async function POST(req: Request) {
  try {
    if (process.env.FEEDBACK_CONVERSATION_ENABLED === 'false') {
      return NextResponse.json({ messages: [] }, { headers: corsHeaders() });
    }

    const body = await readFeedbackJson(req, 4 * 1024);
    const conversationId = boundedString(body.conversationId, 'conversationId', 100);
    const secretToken = boundedString(body.secretToken, 'secretToken', 200);
    if (!conversationId || !secretToken) {
      return NextResponse.json({ messages: [] }, { headers: corsHeaders() });
    }

    const store = createFeedbackConversationStore();
    const messages = await store.listMessages(conversationId, secretToken);
    return NextResponse.json({
      messages: messages
        .filter((message) => !message.shadowOnly)
        .map((message) => ({
          messageId: message.messageId,
          authorType: message.authorType,
          body: message.body,
          createdAt: message.createdAt,
          readByUser: message.readByUser,
        })),
    }, { headers: corsHeaders() });
  } catch (error) {
    if (error instanceof FeedbackRequestError) {
      return NextResponse.json({ messages: [], error: error.message }, {
        status: error.status,
        headers: corsHeaders(),
      });
    }
    console.error('Feedback conversation poll error:', error);
    return NextResponse.json({ messages: [] }, { headers: corsHeaders() });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}
