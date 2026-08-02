import { NextRequest, NextResponse } from 'next/server';
import {
  oauthFetchSignal,
  readLimitedJson,
  RequestValidationError,
  requireString,
} from '../requestSecurity';

export async function POST(req: NextRequest) {
  let code: string;
  let codeVerifier: string;
  let redirectUri: string;
  try {
    const body = await readLimitedJson(req);
    code = requireString(body, 'code', 4096);
    codeVerifier = requireString(body, 'code_verifier', 256);
    redirectUri = requireString(body, 'redirect_uri', 2048);
  } catch (error) {
    const validation = error instanceof RequestValidationError ? error : null;
    return NextResponse.json(
      { error: validation?.message ?? 'invalid request' },
      { status: validation?.status ?? 400 },
    );
  }

  const params = new URLSearchParams({
    code,
    client_id: process.env.NEXT_PUBLIC_GDRIVE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET_PWA!,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
    grant_type: 'authorization_code',
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
