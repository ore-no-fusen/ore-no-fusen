import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { createFeedbackConversationStore } from './store';
import { hashSecretToken } from './security';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('feedback environment isolation', () => {
  it('keeps identical conversation IDs separate in development and production', async () => {
    vi.stubEnv('FIREBASE_PROJECT_ID', '');
    vi.stubEnv('VERCEL_ENV', 'production');
    const production = createFeedbackConversationStore();
    await production.createConversation({ conversationId: 'isolation-check', secretTokenHash: hashSecretToken('prod'), deliveryEnabled: true, shadowOnly: false, createdAt: '2026-10-05', updatedAt: '2026-10-05' });
    vi.stubEnv('VERCEL_ENV', 'preview');
    const development = createFeedbackConversationStore();
    expect(await development.getConversation('isolation-check')).toBeNull();
    await development.createConversation({ conversationId: 'isolation-check', secretTokenHash: hashSecretToken('dev'), deliveryEnabled: true, shadowOnly: false, createdAt: '2026-10-05', updatedAt: '2026-10-05' });
    expect(await development.verifyConversationAccess('isolation-check', 'prod')).toBe(false);
    expect(await production.verifyConversationAccess('isolation-check', 'dev')).toBe(false);
  });

  it('uses separate Firestore paths even with the same project and database credentials', async () => {
    vi.stubEnv('FIREBASE_PROJECT_ID', 'isolation-project');
    vi.stubEnv('FIREBASE_CLIENT_EMAIL', 'test@example.test');
    vi.stubEnv('FIREBASE_PRIVATE_KEY', generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
    vi.stubEnv('FIREBASE_DATABASE_ID', '(default)');
    const paths: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'mock-token', expires_in: 3600 });
      paths.push(url);
      return new Response(null, { status: 404 });
    }));
    vi.stubEnv('VERCEL_ENV', 'production');
    await createFeedbackConversationStore().getConversation('same-id');
    vi.stubEnv('VERCEL_ENV', 'preview');
    await createFeedbackConversationStore().getConversation('same-id');
    expect(paths).toEqual([
      'https://firestore.googleapis.com/v1/projects/isolation-project/databases/(default)/documents/feedback_conversations/same-id',
      'https://firestore.googleapis.com/v1/projects/isolation-project/databases/(default)/documents/feedback_environments/development/feedback_conversations/same-id',
    ]);
  });
});
