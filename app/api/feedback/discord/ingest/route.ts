import { NextResponse } from 'next/server';
import { isDiscordIngestFailure, runDiscordIngest } from './run';
import { FeedbackRequestError, readFeedbackJson } from '../../lib/security';
import { feedbackEnvironment } from '../../lib/environment';

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
  const environment = feedbackEnvironment();
  return NextResponse.json({ error: 'Method Not Allowed', environment,
    ...(environment === 'development' ? { developmentReplyMapping: 'notification-only' } : {}),
  }, { status: 405, headers: { ...corsHeaders(), 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    }
    const body = req.headers.get('content-type') === 'application/json' ? await readFeedbackJson(req, 1024) : {};
    const afterId = body.afterId;
    if (afterId !== undefined && (typeof afterId !== 'string' || !/^\d{15,25}$/.test(afterId))) {
      return NextResponse.json({ error: 'Invalid Discord cursor' }, { status: 400, headers: corsHeaders() });
    }
    const result = await runDiscordIngest(afterId as string | undefined);
    if (isDiscordIngestFailure(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status, headers: corsHeaders() });
    }
    return NextResponse.json({ ...result, environment: feedbackEnvironment() }, { headers: corsHeaders() });
  } catch (error) {
    if (error instanceof FeedbackRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: corsHeaders() });
    }
    console.error('Discord ingest error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}
