import { NextRequest, NextResponse } from 'next/server';
import {
  oauthFetchSignal,
  readLimitedJson,
  RequestValidationError,
  requireString,
} from '../requestSecurity';

export async function POST(req: NextRequest) {
  let refreshToken: string;
  try {
    const body = await readLimitedJson(req);
    refreshToken = requireString(body, 'refresh_token', 4096);
  } catch (error) {
    const validation = error instanceof RequestValidationError ? error : null;
    return NextResponse.json(
      { error: validation?.message ?? 'invalid request' },
      { status: validation?.status ?? 400 },
    );
  }

  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: process.env.NEXT_PUBLIC_GDRIVE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET_PWA!,
    grant_type: 'refresh_token',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    signal: oauthFetchSignal(),
  });

  const data = await res.json();

  if (!res.ok) {
    return NextResponse.json(data, { status: res.status });
  }

  return NextResponse.json(data);
}
