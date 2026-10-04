import { getDeveloperFeedbackApiBaseUrl } from './feedbackConversation';

export const DISCORD_INGEST_SECRET_STORAGE_KEY = 'ore-no-fusen.feedback.discord_ingest_secret';
export const DISCORD_AUTO_INGEST_STORAGE_KEY = 'ore-no-fusen.feedback.discord_auto_ingest';
export const DISCORD_INGEST_TARGET_STORAGE_KEY = 'ore-no-fusen.feedback.discord_ingest_target';
export type DiscordIngestTarget = 'production' | 'development';
const DISCORD_CURSOR_STORAGE_KEY = 'ore-no-fusen.feedback.discord_cursor.';

export function getDiscordIngestTarget(storage?: Storage): DiscordIngestTarget {
  const saved = storage?.getItem(DISCORD_INGEST_TARGET_STORAGE_KEY);
  if (saved === 'production' || saved === 'development') return saved;
  return getDeveloperFeedbackApiBaseUrl() === 'https://ore-no-fusen.vercel.app/api/feedback'
    ? 'production' : 'development';
}

export function getDiscordIngestApiBaseUrl(storage: Storage = window.localStorage): string {
  const target = storage.getItem(DISCORD_INGEST_TARGET_STORAGE_KEY);
  if (target === 'production') return 'https://ore-no-fusen.vercel.app/api/feedback';
  if (target === 'development') return 'https://ore-no-fusen-git-develop-uch54s-projects.vercel.app/api/feedback';
  return getDeveloperFeedbackApiBaseUrl();
}

export function isDiscordAutoIngestReady(storage: Storage = window.localStorage): boolean {
  return storage.getItem(DISCORD_AUTO_INGEST_STORAGE_KEY) === 'true'
    && Boolean(storage.getItem(DISCORD_INGEST_SECRET_STORAGE_KEY)?.trim());
}

export async function ingestNewDiscordReplies(
  storage: Storage = window.localStorage,
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  const secret = storage.getItem(DISCORD_INGEST_SECRET_STORAGE_KEY)?.trim();
  if (!secret || storage.getItem(DISCORD_AUTO_INGEST_STORAGE_KEY) !== 'true') return 0;
  const baseUrl = getDiscordIngestApiBaseUrl(storage);
  const cursorKey = DISCORD_CURSOR_STORAGE_KEY + baseUrl;
  const afterId = storage.getItem(cursorKey);
  const response = await fetchImpl(`${baseUrl}/discord/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
    body: JSON.stringify(afterId ? { afterId } : {}),
  });
  if (!response.ok) throw new Error(`Discord reply import failed: ${response.status}`);
  const result = await response.json() as { ingested?: number; lastSeenId?: string };
  if (result.lastSeenId && /^\d{15,25}$/.test(result.lastSeenId)) {
    storage.setItem(cursorKey, result.lastSeenId);
  }
  return result.ingested ?? 0;
}
