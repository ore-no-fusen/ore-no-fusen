import { NextResponse } from 'next/server';
import { isDiscordIngestFailure, runDiscordIngest } from './run';

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
    const result = await runDiscordIngest();
    if (isDiscordIngestFailure(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status, headers: corsHeaders() });
    }
    return NextResponse.json(result, { headers: corsHeaders() });
  } catch (error) {
    console.error('Discord ingest error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}
