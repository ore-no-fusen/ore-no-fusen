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

export async function POST(req: Request) {
  try {
    const body = await readFeedbackJson(req, 4 * 1024);
    const conversationId = boundedString(body.conversationId, 'conversationId', 100);
    const secretToken = boundedString(body.secretToken, 'secretToken', 200);
    if (!conversationId || !secretToken) {
      return NextResponse.json({ success: false }, { status: 400, headers: corsHeaders() });
    }

    const deleted = await createFeedbackConversationStore()
      .deleteConversation(conversationId, secretToken);
    return NextResponse.json({ success: deleted }, {
      status: deleted ? 200 : 404,
      headers: corsHeaders(),
    });
  } catch (error) {
    if (error instanceof FeedbackRequestError) {
      return NextResponse.json({ success: false, error: error.message }, {
        status: error.status,
        headers: corsHeaders(),
      });
    }
    console.error('Feedback conversation delete error:', error);
    return NextResponse.json({ success: false }, { status: 500, headers: corsHeaders() });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}
