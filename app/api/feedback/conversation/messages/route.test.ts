import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryFeedbackConversationStore } from '../../lib/store';
import { hashSecretToken } from '../../lib/security';

const mocks = vi.hoisted(() => ({
  store: null as ReturnType<typeof createMemoryFeedbackConversationStore> | null,
  getPrivateImageFileMetadata: vi.fn(),
  createPrivateImageViewUrl: vi.fn(),
}));
vi.mock('../../lib/store', async (original) => {
  const actual = await original<typeof import('../../lib/store')>();
  return { ...actual, createFeedbackConversationStore: () => mocks.store };
});
vi.mock('../../../members/lib/conversation-number', () => ({ conversationMemberNumber: vi.fn(async () => null) }));
vi.mock('../../lib/appwrite-storage', async (original) => {
  const actual = await original<typeof import('../../lib/appwrite-storage')>();
  return {
    ...actual,
    getPrivateImageFileMetadata: mocks.getPrivateImageFileMetadata,
    createPrivateImageViewUrl: mocks.createPrivateImageViewUrl,
  };
});

import { POST } from './route';

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/feedback/conversation/messages', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('conversation messages attachments', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mocks.store = createMemoryFeedbackConversationStore();
    process.env.DISCORD_WEBHOOK_URL = 'https://discord.example/webhook';
    mocks.createPrivateImageViewUrl.mockResolvedValue('https://image.example/view');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'discord-1' }), { status: 200 })));
  });

  it('keeps the existing text-only request compatible', async () => {
    const response = await POST(request({ content: 'hello' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect((await mocks.store!.listMessages(body.conversationId, body.secretToken))[0].body).toBe('hello');
  });

  it('sends an owned image to Discord together with the required body text', async () => {
    await mocks.store!.createConversation({
      conversationId: 'conversation-a', secretTokenHash: hashSecretToken('secret-a'), appwriteUserId: 'fb_user-a',
      deliveryEnabled: true, shadowOnly: false, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
    });
    mocks.getPrivateImageFileMetadata.mockResolvedValue({
      fileId: 'upload-a', mimeType: 'image/webp', byteSize: 80,
      permissions: ['read("user:fb_user-a")', 'delete("user:fb_user-a")'],
    });

    const response = await POST(request({
      conversationId: 'conversation-a', secretToken: 'secret-a', content: '画像を確認してください', fileIds: ['upload-a'],
    }));

    expect(response.status).toBe(200);
    expect(mocks.createPrivateImageViewUrl).toHaveBeenCalledWith('upload-a');
    const discordInit = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(discordInit.body))).toMatchObject({
      embeds: [
        { fields: expect.arrayContaining([{ name: '内容', value: '画像を確認してください' }]) },
        { image: { url: 'https://image.example/view' } },
      ],
    });
  });

  it('rejects an image not owned by the conversation before calling Discord', async () => {
    await mocks.store!.createConversation({
      conversationId: 'conversation-a', secretTokenHash: hashSecretToken('secret-a'), appwriteUserId: 'fb_user-a',
      deliveryEnabled: true, shadowOnly: false, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
    });
    mocks.getPrivateImageFileMetadata.mockResolvedValue({
      fileId: 'upload-a', mimeType: 'image/webp', byteSize: 80,
      permissions: ['read("user:someone-else")', 'delete("user:someone-else")'],
    });

    const response = await POST(request({
      conversationId: 'conversation-a', secretToken: 'secret-a', content: '本文', fileIds: ['upload-a'],
    }));
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects more than three images', async () => {
    const response = await POST(request({ content: '本文', fileIds: ['a', 'b', 'c', 'd'] }));
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});
