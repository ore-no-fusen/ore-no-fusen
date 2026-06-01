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
    const body = await req.json();
    const conversationId = typeof body.conversationId === 'string' ? body.conversationId : '';
    const secretToken = typeof body.secretToken === 'string' ? body.secretToken : '';
    const messageIds = Array.isArray(body.messageIds)
      ? body.messageIds.filter((id: unknown): id is string => typeof id === 'string')
      : [];
    if (!conversationId || !secretToken || messageIds.length === 0) {
      return NextResponse.json({ success: false }, { headers: corsHeaders() });
    }

    const store = createFeedbackConversationStore();
    const success = await store.markMessagesRead(conversationId, secretToken, messageIds);
    return NextResponse.json({ success }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Feedback conversation ack error:', error);
    return NextResponse.json({ success: false }, { headers: corsHeaders() });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}
