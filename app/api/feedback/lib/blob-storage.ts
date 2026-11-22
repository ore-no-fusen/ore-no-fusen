import { createHash } from 'node:crypto';
import { del, get, put } from '@vercel/blob';
import { feedbackEnvironment } from './environment';
import { MAX_FEEDBACK_UPLOAD_BYTES } from '@/app/utils/feedbackImage';

const FEEDBACK_IMAGE_RETENTION_DAYS = 30;
export const MAX_BLOB_IMAGE_BYTES = MAX_FEEDBACK_UPLOAD_BYTES;
export const BLOB_IMAGE_ID = /^b_[a-f0-9]{32}$/;
export const BLOB_IMAGE_TYPES = new Map([
  ['image/png', 'png'], ['image/jpeg', 'jpg'], ['image/webp', 'webp'],
]);

export function feedbackImageBlobPath(conversationId: string, fileId: string): string {
  const owner = createHash('sha256').update(conversationId).digest('hex');
  return `feedback/${feedbackEnvironment()}/${owner}/${fileId}`;
}

// Call only after the request's conversation ownership and image bytes have been validated.
export async function storeFeedbackImage(
  conversationId: string,
  fileId: string,
  image: Blob,
) {
  const token = process.env.FEEDBACK_BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error('Feedback Blob storage is not configured');
  return put(feedbackImageBlobPath(conversationId, fileId), image, {
    access: 'private',
    allowOverwrite: false,
    ttlDays: FEEDBACK_IMAGE_RETENTION_DAYS,
    token,
  });
}

export async function readFeedbackImage(conversationId: string, fileId: string) {
  const token = process.env.FEEDBACK_BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error('Feedback Blob storage is not configured');
  const result = await get(feedbackImageBlobPath(conversationId, fileId), {
    access: 'private', token, abortSignal: AbortSignal.timeout(8000),
  });
  if (!result || result.statusCode !== 200) return null;
  const { contentType, size } = result.blob;
  const extension = BLOB_IMAGE_TYPES.get(contentType);
  if (!extension || size < 1 || size > MAX_BLOB_IMAGE_BYTES) {
    await result.stream.cancel();
    return null;
  }
  return {
    file: await new Response(result.stream, { headers: { 'Content-Type': contentType } }).blob(),
    extension,
  };
}

export async function deleteFeedbackImage(conversationId: string, fileId: string) {
  const token = process.env.FEEDBACK_BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error('Feedback Blob storage is not configured');
  await del(feedbackImageBlobPath(conversationId, fileId), { token });
}
