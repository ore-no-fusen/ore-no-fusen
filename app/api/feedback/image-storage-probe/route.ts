import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import {
  createPrivateImageFile,
  deletePrivateImageFile,
  FeedbackImageStorageError,
  readPrivateImageFile,
} from '../lib/appwrite-storage';
import { hashSecretToken, safeEqualHash } from '../lib/security';

const PROBE_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);

function unavailable(): NextResponse {
  return NextResponse.json({ error: 'Not Found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
}

function rejectProbe(
  reason: 'disabled' | 'missing_expected_token' | 'missing_supplied_token' | 'token_mismatch',
  lengths?: { expected: number; supplied: number },
): NextResponse {
  // This temporary route never logs request headers, tokens, IDs, or image data.
  console.info('image-storage-probe rejected', { reason, ...(lengths ? { tokenLengths: lengths } : {}) });
  return unavailable();
}

export async function GET(): Promise<NextResponse> {
  return unavailable();
}

export async function POST(request: Request): Promise<NextResponse> {
  const expectedToken = process.env.IMAGE_STORAGE_PROBE_TOKEN;
  const suppliedToken = request.headers.get('x-image-storage-probe-token') ?? '';
  if (process.env.IMAGE_STORAGE_PROBE_ENABLED !== 'true') return rejectProbe('disabled');
  if (!expectedToken) return rejectProbe('missing_expected_token');
  if (!suppliedToken) return rejectProbe('missing_supplied_token');
  if (!safeEqualHash(hashSecretToken(suppliedToken), hashSecretToken(expectedToken))) {
    return rejectProbe('token_mismatch', { expected: expectedToken.length, supplied: suppliedToken.length });
  }

  const fileId = randomUUID();
  let created = false;
  let stage: 'create' | 'read' | 'delete' = 'create';
  try {
    await createPrivateImageFile(fileId, PROBE_BYTES);
    created = true;
    stage = 'read';
    const restored = await readPrivateImageFile(fileId);
    const matches = restored.length === PROBE_BYTES.length &&
      !restored.some((byte, index) => byte !== PROBE_BYTES[index]);
    stage = 'delete';
    await deletePrivateImageFile(fileId);
    created = false;
    if (!matches) {
      return NextResponse.json({ ok: false, reason: 'content_mismatch' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({ ok: true, bytes: restored.length }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof FeedbackImageStorageError) {
      console.error('image-storage-probe storage failure', {
        stage,
        status: error.status,
        upstreamType: error.upstreamType ?? 'unknown',
      });
    }
    throw error;
  } finally {
    if (created) await deletePrivateImageFile(fileId);
  }
}
