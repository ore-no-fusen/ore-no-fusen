import { createHash } from 'crypto';

export class FeedbackImageAuthError extends Error {
  constructor(message: string, readonly status = 503) { super(message); }
}

type PublicStorageConfig = { endpoint: string; projectId: string; bucketId: string };

function config(): PublicStorageConfig & { apiKey: string } {
  const endpoint = process.env.APPWRITE_ENDPOINT?.replace(/\/$/, '');
  const projectId = process.env.APPWRITE_PROJECT_ID;
  const bucketId = process.env.APPWRITE_BUCKET_ID;
  const apiKey = process.env.APPWRITE_AUTH_API_KEY;
  if (!endpoint?.startsWith('https://') || !projectId || !bucketId || !apiKey) {
    throw new FeedbackImageAuthError('Image authentication unavailable');
  }
  return { endpoint, projectId, bucketId, apiKey };
}

async function request(path: string, init: RequestInit): Promise<Response> {
  const { endpoint, projectId, apiKey } = config();
  return fetch(`${endpoint}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'X-Appwrite-Project': projectId,
      'X-Appwrite-Key': apiKey,
      ...(init.headers ?? {}),
    },
  });
}

export function appwriteUserIdForConversation(conversationId: string): string {
  return `fb_${createHash('sha256').update(conversationId).digest('hex').slice(0, 32)}`;
}

export async function ensureFeedbackImageUser(userId: string): Promise<void> {
  const created = await request('/users', { method: 'POST', body: JSON.stringify({ userId, name: 'Feedback conversation' }) });
  if (!created.ok && created.status !== 409) throw new FeedbackImageAuthError('Image user unavailable');
}

export async function createFeedbackImageJwt(userId: string): Promise<PublicStorageConfig & { jwt: string; expiresAt: string }> {
  await ensureFeedbackImageUser(userId);

  const sessionsResponse = await request(`/users/${encodeURIComponent(userId)}/sessions`, { method: 'GET' });
  if (!sessionsResponse.ok) throw new FeedbackImageAuthError('Image session unavailable');
  const listed = await sessionsResponse.json().catch(() => null) as {
    sessions?: Array<{ $id?: string; expire?: string }>;
  } | null;
  if (!Array.isArray(listed?.sessions)) throw new FeedbackImageAuthError('Invalid image session list');
  const reusable = listed.sessions.find((session) =>
    typeof session.$id === 'string'
      && (!session.expire || Date.parse(session.expire) > Date.now() + 60_000),
  );
  let sessionId = reusable?.$id;
  if (!sessionId) {
    const sessionResponse = await request(`/users/${encodeURIComponent(userId)}/sessions`, { method: 'POST', body: '{}' });
    if (!sessionResponse.ok) throw new FeedbackImageAuthError('Image session unavailable');
    const session = await sessionResponse.json().catch(() => null) as { $id?: string } | null;
    sessionId = session?.$id;
  }
  if (!sessionId) throw new FeedbackImageAuthError('Invalid image session');

  const durationSeconds = 15 * 60;
  const jwtResponse = await request(`/users/${encodeURIComponent(userId)}/jwts`, {
    method: 'POST', body: JSON.stringify({ sessionId, duration: durationSeconds }),
  });
  if (!jwtResponse.ok) throw new FeedbackImageAuthError('Image token unavailable');
  const token = await jwtResponse.json().catch(() => null) as { jwt?: string } | null;
  if (!token?.jwt) throw new FeedbackImageAuthError('Invalid image token');
  const { endpoint, projectId, bucketId } = config();
  return { endpoint, projectId, bucketId, jwt: token.jwt, expiresAt: new Date(Date.now() + durationSeconds * 1000).toISOString() };
}
