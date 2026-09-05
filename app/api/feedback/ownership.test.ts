import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFeedbackConversationStore } from './lib/store';
import { hashSecretToken } from './lib/security';
import { POST as feedback } from './route';
import { POST as message } from './conversation/messages/route';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('conversation ownership before notification', () => {
  it.each([feedback, message])('rejects wrong credentials before history or Discord access', async (post) => {
    vi.stubEnv('FIREBASE_PROJECT_ID',''); vi.stubEnv('DISCORD_WEBHOOK_URL','https://example.test/webhook');
    const store = createFeedbackConversationStore();
    const id = crypto.randomUUID();
    const original = { conversationId:id, secretTokenHash:hashSecretToken('correct'), createdAt:'2026-01-01T00:00:00Z', updatedAt:'2026-01-01T00:00:00Z', deliveryEnabled:true, shadowOnly:false };
    await store.createConversation(original);
    const network = vi.fn(); vi.stubGlobal('fetch',network);
    const response = await post(new Request('https://example.test/api/feedback', { method:'POST',body:JSON.stringify({ conversationId:id,secretToken:'wrong',content:'hello' }) }));
    expect(response.status).toBe(403); expect(network).not.toHaveBeenCalled();
    expect(await store.getConversation(id)).toEqual(original);
    await store.createConversation({ ...original, createdAt:'2026-09-04T00:00:00Z' });
    expect((await store.getConversation(id))?.createdAt).toBe(original.createdAt);
  });
});
