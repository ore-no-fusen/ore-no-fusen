export const maxDuration = 20;
import { NextResponse } from 'next/server';


function isAuthorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = req.headers.get('authorization') ?? '';
  return header === `Bearer ${expected}`;
}

export async function GET(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // The Durable Object coordinator owns checkpoints and continuations.
    return NextResponse.json({ error: 'Retired: use the durable Discord coordinator' }, { status: 410 });
  } catch (error) {
    console.error('Discord cron ingest error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 });
}
