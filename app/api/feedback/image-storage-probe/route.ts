import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { createPrivateImageFile, deletePrivateImageFile, readPrivateImageFile } from '../lib/appwrite-storage';
import { hashSecretToken, safeEqualHash } from '../lib/security';

const PROBE_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);

function unavailable(): NextResponse {
  return NextResponse.json({ error: 'Not Found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(): Promise<NextResponse> {
  return unavailable();
}

export async function POST(request: Request): Promise<NextResponse> {
  const expectedToken = process.env.IMAGE_STORAGE_PROBE_TOKEN;
  const suppliedToken = request.headers.get('x-image-storage-probe-token') ?? '';
  if (
    process.env.IMAGE_STORAGE_PROBE_ENABLED !== 'true' || !expectedToken || !suppliedToken ||
    !safeEqualHash(hashSecretToken(suppliedToken), hashSecretToken(expectedToken))
  ) return unavailable();

  const fileId = randomUUID();
  let created = false;
  try {
    await createPrivateImageFile(fileId, PROBE_BYTES);
    created = true;
    const restored = await readPrivateImageFile(fileId);
    if (restored.length !== PROBE_BYTES.length || restored.some((byte, index) => byte !== PROBE_BYTES[index])) {
      return NextResponse.json({ ok: false, reason: 'content_mismatch' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({ ok: true, bytes: restored.length }, { headers: { 'Cache-Control': 'no-store' } });
  } finally {
    if (created) await deletePrivateImageFile(fileId).catch(() => undefined);
  }
}
