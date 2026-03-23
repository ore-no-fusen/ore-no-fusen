import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { code, code_verifier, redirect_uri } = await req.json();

  const params = new URLSearchParams({
    code,
    client_id: process.env.NEXT_PUBLIC_GDRIVE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET_PWA!,
    redirect_uri,
    code_verifier,
    grant_type: 'authorization_code',
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
