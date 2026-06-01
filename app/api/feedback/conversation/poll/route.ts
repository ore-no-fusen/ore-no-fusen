import { NextResponse } from 'next/server';
import { createFeedbackConversationStore } from '../../lib/store';

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

    const body = await req.json();
    const conversationId = typeof body.conversationId === 'string' ? body.conversationId : '';
    const secretToken = typeof body.secretToken === 'string' ? body.secretToken : '';
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
    console.error('Feedback conversation poll error:', error);
    return NextResponse.json({ messages: [] }, { headers: corsHeaders() });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}
