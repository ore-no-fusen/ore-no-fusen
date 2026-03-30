import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { refresh_token } = await req.json();

  const params = new URLSearchParams({
    refresh_token,
    client_id: process.env.NEXT_PUBLIC_GDRIVE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET_PWA!,
    grant_type: 'refresh_token',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await res.json();

  if (!res.ok) {
    return NextResponse.json(data, { status: res.status });
  }

  return NextResponse.json(data);
}
