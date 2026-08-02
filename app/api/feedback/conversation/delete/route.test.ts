import { beforeEach, describe, expect, it } from 'vitest';
import { hashSecretToken } from '../../lib/security';
import { createFeedbackConversationStore } from '../../lib/store';
import { POST } from './route';

describe('feedback conversation delete route', () => {
  beforeEach(async () => {
    const store = createFeedbackConversationStore();
    await store.createConversation({
      conversationId: 'conversation-delete-route',
      secretTokenHash: hashSecretToken('secret'),
      deliveryEnabled: true,
      shadowOnly: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  it('requires the matching secret token', async () => {
    const response = await POST(new Request('https://example.test/api/feedback/conversation/delete', {
      method: 'POST',
      body: JSON.stringify({
        conversationId: 'conversation-delete-route',
        secretToken: 'wrong',
      }),
    }));

    expect(response.status).toBe(404);
  });

  it('deletes an authenticated conversation', async () => {
    const response = await POST(new Request('https://example.test/api/feedback/conversation/delete', {
      method: 'POST',
      body: JSON.stringify({
        conversationId: 'conversation-delete-route',
        secretToken: 'secret',
      }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it('rejects oversized requests', async () => {
    const response = await POST(new Request('https://example.test/api/feedback/conversation/delete', {
      method: 'POST',
      body: JSON.stringify({ padding: 'x'.repeat(5 * 1024) }),
    }));

    expect(response.status).toBe(413);
  });
});
