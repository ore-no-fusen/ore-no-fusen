import { NextResponse } from 'next/server';
import { appwriteUserIdForConversation, createFeedbackImageJwt, FeedbackImageAuthError } from '../../lib/appwrite-auth';
import { boundedString, FeedbackRequestError, hashSecretToken, readFeedbackJson } from '../../lib/security';
import { createFeedbackConversationStore } from '../../lib/store';

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Cache-Control': 'no-store' };

export async function POST(req: Request) {
  try {
    const imageStorageEnabled = process.env.IMAGE_STORAGE_ENABLED === 'true'
      || process.env.IMAGE_STORAGE_PROBE_ENABLED === 'true';
    if (!imageStorageEnabled) throw new FeedbackRequestError('Image upload unavailable', 503);
    const body = await readFeedbackJson(req, 4 * 1024);
    const conversationId = boundedString(body.conversationId, 'conversationId', 100, true);
    const secretToken = boundedString(body.secretToken, 'secretToken', 200, true);
    const store = createFeedbackConversationStore();
    const existing = await store.getConversation(conversationId);
    const userId = existing?.appwriteUserId ?? appwriteUserIdForConversation(conversationId);
    const now = new Date().toISOString();
    await store.createConversation({
      ...existing,
      conversationId,
      secretTokenHash: hashSecretToken(secretToken),
      appwriteUserId: userId,
      deliveryEnabled: existing?.deliveryEnabled ?? true,
      shadowOnly: existing?.shadowOnly ?? (process.env.FEEDBACK_CONVERSATION_SHADOW_MODE === 'true'),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    const session = await createFeedbackImageJwt(userId);
    return NextResponse.json({ ...session, userId }, { headers });
  } catch (error) {
    if (error instanceof FeedbackRequestError) {
      const status = error.status === 403 ? 404 : error.status;
      return NextResponse.json({ error: status === 404 ? 'Image not found' : error.message }, { status, headers });
    }
    if (error instanceof FeedbackImageAuthError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
    console.error('Feedback image session error:', error);
    return NextResponse.json({ error: 'Image authentication unavailable' }, { status: 503, headers });
  }
}

export async function OPTIONS() { return new NextResponse(null, { status: 204, headers }); }
