import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryFeedbackConversationStore } from '../../lib/store';
import { hashSecretToken } from '../../lib/security';
import { extractConversationIdFromDiscordEmbeds } from '../../lib/security';

const mocks = vi.hoisted(() => ({
  store: null as ReturnType<typeof createMemoryFeedbackConversationStore> | null,
  readFeedbackImage: vi.fn(),
}));
vi.mock('../../lib/blob-storage', async (original) => ({
  ...await original<typeof import('../../lib/blob-storage')>(),
  readFeedbackImage: mocks.readFeedbackImage,
}));
vi.mock('../../lib/store', async (original) => {
  const actual = await original<typeof import('../../lib/store')>();
  return { ...actual, createFeedbackConversationStore: () => mocks.store };
});
vi.mock('../../../members/lib/conversation-number', () => ({ conversationMemberNumber: vi.fn(async () => null) }));

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
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'discord-1' }), { status: 200 })));
  });

  it('keeps the existing text-only request compatible', async () => {
    const response = await POST(request({ content: 'hello' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect((await mocks.store!.listMessages(body.conversationId, body.secretToken))[0].body).toBe('hello');
    const payload = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(payload.embeds[0].fields).toContainEqual({ name: '開発会話ID', value: body.conversationId });
    expect(extractConversationIdFromDiscordEmbeds(payload.embeds)).toBeNull();
  });

  it('rejects retired attachment IDs unless the client can report text-only delivery', async () => {
    const input = { conversationId: 'conversation-a', secretToken: 'secret-a', content: '本文', fileIds: ['upload-a'] };
    expect((await POST(request(input))).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
    const response = await POST(request({ ...input, allowTextOnlyOnImageFailure: true }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ imagesOmitted: true });
    expect(mocks.readFeedbackImage).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects more than three images', async () => {
    const response = await POST(request({ content: '本文', fileIds: ['a', 'b', 'c', 'd'] }));
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('attaches private Blob bytes to Discord without sending a storage URL', async () => {
    const fileId = 'b_' + 'a'.repeat(32);
    mocks.readFeedbackImage.mockResolvedValueOnce({
      file: new Blob(['test image'], { type: 'image/png' }), extension: 'png',
    });
    const response = await POST(request({
      conversationId: 'conversation-a', secretToken: 'secret-a', content: '本文', fileIds: [fileId],
    }));
    expect(response.status).toBe(200);
    expect(mocks.readFeedbackImage).toHaveBeenCalledWith('conversation-a', fileId);
    const form = vi.mocked(fetch).mock.calls[0][1]?.body as FormData;
    expect(form.get('files[0]')).toMatchObject({ size: 10, type: 'image/png' });
    expect(JSON.parse(String(form.get('payload_json')))).toMatchObject({
      attachments: [{ id: 0, filename: 'image-1.png' }],
    });
  });

  it('rejects a Blob absent from the authenticated conversation, even with fallback enabled', async () => {
    mocks.readFeedbackImage.mockResolvedValueOnce(null);
    const response = await POST(request({
      conversationId: 'conversation-b', secretToken: 'secret-b', content: '本文',
      fileIds: ['b_' + 'a'.repeat(32)], allowTextOnlyOnImageFailure: true,
    }));
    expect(response.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends only text on Blob storage failure when the client can report it', async () => {
    mocks.readFeedbackImage.mockRejectedValue(new Error('Storage unavailable'));
    const input = { conversationId: 'conversation-a', secretToken: 'secret-a', content: '本文', fileIds: ['b_' + 'a'.repeat(32)] };
    expect((await POST(request(input))).status).toBe(500);
    expect(fetch).not.toHaveBeenCalled();
    const response = await POST(request({ ...input, allowTextOnlyOnImageFailure: true }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ imagesOmitted: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(payload.embeds).toHaveLength(1);
    expect(payload.embeds[0].fields).toContainEqual({ name: '内容', value: '本文' });
  });
});
