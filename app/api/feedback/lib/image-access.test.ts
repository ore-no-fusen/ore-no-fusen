import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFeedbackConversationStore } from './store';
import { hashSecretToken } from './security';
import { readOwnedImagePart, type FeedbackImageRecord } from './image-access';
import { readPrivateImageFile } from './appwrite-storage';

vi.mock('./appwrite-storage', () => ({ readPrivateImageFile: vi.fn() }));

const now = new Date('2026-09-09T00:00:00.000Z');

async function addConversation(conversationId: string, token: string): Promise<void> {
  await createFeedbackConversationStore().createConversation({
    conversationId,
    secretTokenHash: hashSecretToken(token),
    deliveryEnabled: true,
    shadowOnly: false,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
}

function record(conversationId: string, attachmentId: string): FeedbackImageRecord {
  return {
    attachmentId,
    conversationId,
    fileIds: [`${attachmentId}.0`],
    state: 'ready',
    expiresAt: '2026-10-09T00:00:00.000Z',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readPrivateImageFile).mockResolvedValue(Uint8Array.from([1, 2, 3]));
});

describe('feedback image ownership boundary', () => {
  it('allows A to read A and B to read B', async () => {
    const suffix = crypto.randomUUID();
    const aId = `a-${suffix}`;
    const bId = `b-${suffix}`;
    await addConversation(aId, 'token-a');
    await addConversation(bId, 'token-b');

    await expect(readOwnedImagePart({ store: createFeedbackConversationStore(), record: record(aId, 'image-a'), conversationId: aId, secretToken: 'token-a', partIndex: 0, now })).resolves.toEqual(Uint8Array.from([1, 2, 3]));
    await expect(readOwnedImagePart({ store: createFeedbackConversationStore(), record: record(bId, 'image-b'), conversationId: bId, secretToken: 'token-b', partIndex: 0, now })).resolves.toEqual(Uint8Array.from([1, 2, 3]));
  });

  it.each([
    ['A credentials with B image', 'a', 'token-a', 'b'],
    ['B credentials with A image', 'b', 'token-b', 'a'],
    ['wrong token', 'a', 'wrong', 'a'],
  ])('rejects %s before requesting any image bytes', async (_label, requester, token, owner) => {
    const suffix = crypto.randomUUID();
    const aId = `a-${suffix}`;
    const bId = `b-${suffix}`;
    await addConversation(aId, 'token-a');
    await addConversation(bId, 'token-b');
    const requesterId = requester === 'a' ? aId : bId;
    const ownerId = owner === 'a' ? aId : bId;

    await expect(readOwnedImagePart({ store: createFeedbackConversationStore(), record: record(ownerId, 'private-image'), conversationId: requesterId, secretToken: token, partIndex: 0, now })).rejects.toMatchObject({ status: 404 });
    expect(readPrivateImageFile).not.toHaveBeenCalled();
  });

  it.each([
    [null, 0],
    [{ ...record('owner', 'uploading'), state: 'uploading' as const }, 0],
    [{ ...record('owner', 'expired'), expiresAt: now.toISOString() }, 0],
    [record('owner', 'bad-part'), -1],
    [record('owner', 'bad-part'), 1],
  ])('rejects unavailable metadata or parts before storage access', async (image, partIndex) => {
    await addConversation('owner', 'owner-token');
    await expect(readOwnedImagePart({ store: createFeedbackConversationStore(), record: image, conversationId: 'owner', secretToken: 'owner-token', partIndex, now })).rejects.toMatchObject({ status: 404 });
    expect(readPrivateImageFile).not.toHaveBeenCalled();
  });
});
