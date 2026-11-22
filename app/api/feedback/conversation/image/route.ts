import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { BLOB_IMAGE_ID, BLOB_IMAGE_TYPES, deleteFeedbackImage, MAX_BLOB_IMAGE_BYTES, storeFeedbackImage } from '../../lib/blob-storage';
import { boundedString, FeedbackRequestError, hashSecretToken } from '../../lib/security';
import { createFeedbackConversationStore } from '../../lib/store';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
};

function matchesImageType(bytes: Buffer, type: string) {
  if (type === 'image/png') return bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  if (type === 'image/jpeg') return bytes.subarray(0, 3).toString('hex') === 'ffd8ff';
  return bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
}

async function handle(req: Request, deleting: boolean) {
  try {
    if (process.env.FEEDBACK_CONVERSATION_ENABLED === 'false' || !process.env.FEEDBACK_BLOB_READ_WRITE_TOKEN) {
      throw new FeedbackRequestError('Image storage unavailable', 503);
    }
    if (Number(req.headers.get('content-length')) > MAX_BLOB_IMAGE_BYTES + 8192) {
      throw new FeedbackRequestError('Image too large', 413);
    }
    const form = await req.formData().catch(() => null);
    if (!form) throw new FeedbackRequestError('Invalid form', 400);
    const conversationId = boundedString(form.get('conversationId'), 'conversationId', 100, true);
    const secretToken = boundedString(form.get('secretToken'), 'secretToken', 200, true);
    const store = createFeedbackConversationStore();
    if (deleting) {
      const fileId = boundedString(form.get('fileId'), 'fileId', 34, true);
      if (!BLOB_IMAGE_ID.test(fileId) || !await store.verifyConversationAccess(conversationId, secretToken)) {
        throw new FeedbackRequestError('Image not found', 404);
      }
      await deleteFeedbackImage(conversationId, fileId);
      return new NextResponse(null, { status: 204, headers });
    }
    const image = form.get('image');
    if (!(image instanceof Blob) || !BLOB_IMAGE_TYPES.has(image.type) || image.size < 1
      || image.size > MAX_BLOB_IMAGE_BYTES || !matchesImageType(Buffer.from(await image.slice(0, 12).arrayBuffer()), image.type)) {
      throw new FeedbackRequestError('Invalid image file', 400);
    }
    const existing = await store.getConversation(conversationId);
    const now = new Date().toISOString();
    await store.createConversation({
      ...existing, conversationId, secretTokenHash: hashSecretToken(secretToken),
      deliveryEnabled: existing?.deliveryEnabled ?? true,
      shadowOnly: existing?.shadowOnly ?? (process.env.FEEDBACK_CONVERSATION_SHADOW_MODE === 'true'),
      createdAt: existing?.createdAt ?? now, updatedAt: now,
    });
    const fileId = 'b_' + randomUUID().replaceAll('-', '');
    await storeFeedbackImage(conversationId, fileId, image);
    return NextResponse.json({ fileId }, { status: 201, headers });
  } catch (error) {
    if (error instanceof FeedbackRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status === 403 ? 404 : error.status, headers });
    }
    return NextResponse.json({ error: 'Image storage unavailable' }, { status: 503, headers });
  }
}

export const POST = (req: Request) => handle(req, false);
export const DELETE = (req: Request) => handle(req, true);
export const OPTIONS = () => new NextResponse(null, { status: 204, headers });
