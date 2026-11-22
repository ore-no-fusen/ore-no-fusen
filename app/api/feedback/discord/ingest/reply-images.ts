import { randomUUID } from 'node:crypto';
import { BLOB_IMAGE_TYPES, MAX_BLOB_IMAGE_BYTES, storeFeedbackImage } from '../../lib/blob-storage';
import { fetchWithDeadline } from '../../lib/request-budget';

export type DiscordReplyAttachment = {
  id?: string;
  url?: string;
  content_type?: string;
  size?: number;
};

export type DiscordReplyImage = { id: string; url: URL; type: string; size: number };

/** Only the attachment metadata returned by Discord may supply an image source. */
export function selectDiscordReplyImages(
  attachments: DiscordReplyAttachment[] | undefined,
): DiscordReplyImage[] {
  if (!Array.isArray(attachments)) return [];
  const images: DiscordReplyImage[] = [];
  const ids = new Set<string>();
  for (const attachment of attachments) {
    if (images.length >= 3) break;
    const { id, url, content_type: type, size } = attachment ?? {};
    if (typeof id !== 'string' || !/^\d{15,25}$/.test(id) || ids.has(id)
      || typeof type !== 'string' || !BLOB_IMAGE_TYPES.has(type)
      || typeof size !== 'number' || !Number.isSafeInteger(size) || size < 1 || size > MAX_BLOB_IMAGE_BYTES
      || typeof url !== 'string') continue;

    let parsed: URL;
    try { parsed = new URL(url); } catch { continue; }
    const path = parsed.pathname.match(/^\/attachments\/\d{15,25}\/(\d{15,25})\/[^/]+$/);
    if (parsed.origin !== 'https://cdn.discordapp.com' || parsed.username || parsed.password || path?.[1] !== id) continue;
    ids.add(id);
    images.push({ id, url: parsed, type, size });
  }
  return images;
}

export async function saveDiscordReplyImages(conversationId: string, images: DiscordReplyImage[]) {
  const ids: string[] = [];
  for (const image of images) {
    const response = await fetchWithDeadline(image.url.toString(), {
      redirect: 'error', signal: AbortSignal.timeout(3000),
    });
    if ([403, 404, 410].includes(response.status)) {
      await response.body?.cancel();
      continue;
    }
    if (!response.ok || !response.body) throw new Error('Discord attachment unavailable');
    const reader = response.body.getReader();
    const bytes = new Uint8Array(image.size);
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (size + value.length > bytes.length) {
          size = -1;
          await reader.cancel();
          break;
        }
        bytes.set(value, size);
        size += value.length;
      }
    } finally {
      reader.releaseLock();
    }
    if (size !== image.size) continue;
    const head = Buffer.from(bytes.subarray(0, 12));
    const valid = image.type === 'image/png' ? head.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
      : image.type === 'image/jpeg' ? head.subarray(0, 3).toString('hex') === 'ffd8ff'
      : head.subarray(0, 4).toString() === 'RIFF' && head.subarray(8, 12).toString() === 'WEBP';
    if (!valid) continue;
    const id = 'r_' + randomUUID().replaceAll('-', '');
    await storeFeedbackImage(conversationId, id, new Blob([bytes], { type: image.type }));
    ids.push(id);
  }
  return ids;
}
