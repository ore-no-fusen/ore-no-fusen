import { fetchWithDeadline } from '../../lib/request-budget';

export class DiscordDependencyError extends Error {
  constructor(readonly kind: 'authentication' | 'rate_limit', readonly retryAfterMs = 0) {
    super('Discord dependency requires ' + (kind === 'authentication' ? 'configuration repair' : 'backoff'));
  }
}
export async function discordFetch(url: string, init: RequestInit): Promise<Response> {
  const response = await fetchWithDeadline(url, init);
  if (response.status === 401 || response.status === 403) throw new DiscordDependencyError('authentication');
  if (response.status === 429) {
    const raw = response.headers.get('Retry-After');
    const seconds = raw ? Number(raw) : NaN;
    const delay = Number.isFinite(seconds) ? seconds * 1000 : raw ? Date.parse(raw) - Date.now() : 0;
    throw new DiscordDependencyError('rate_limit', Number.isFinite(delay) ? Math.max(30_000, delay) : 30_000);
  }
  return response;
}
