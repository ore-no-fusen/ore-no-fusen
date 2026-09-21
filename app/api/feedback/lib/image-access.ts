import type { FeedbackConversationStore } from './store';
import { FeedbackRequestError } from './security';
import { readPrivateImageFile } from './appwrite-storage';

export type FeedbackImageRecord = {
  attachmentId: string;
  conversationId: string;
  fileIds: string[];
  state: 'uploading' | 'ready' | 'deleting';
  expiresAt: string;
};

type ReadOwnedImagePartInput = {
  store: FeedbackConversationStore;
  record: FeedbackImageRecord | null;
  conversationId: string;
  secretToken: string;
  partIndex: number;
  now?: Date;
};

export async function readOwnedImagePart(input: ReadOwnedImagePartInput): Promise<Uint8Array> {
  const { store, record, conversationId, secretToken, partIndex, now = new Date() } = input;
  if (!record || record.conversationId !== conversationId) {
    throw new FeedbackRequestError('Image not found', 404);
  }
  if (!await store.verifyConversationAccess(conversationId, secretToken)) {
    throw new FeedbackRequestError('Image not found', 404);
  }
  if (record.state !== 'ready' || Date.parse(record.expiresAt) <= now.getTime()) {
    throw new FeedbackRequestError('Image not found', 404);
  }
  if (!Number.isInteger(partIndex) || partIndex < 0 || partIndex >= record.fileIds.length) {
    throw new FeedbackRequestError('Image not found', 404);
  }
  return await readPrivateImageFile(record.fileIds[partIndex]);
}
