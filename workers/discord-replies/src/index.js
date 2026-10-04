const INGEST_URL = 'https://ore-no-fusen.vercel.app/api/feedback/discord/ingest';
const RETRY_DELAY_MS = 5 * 60_000;
const CURSOR_KEY = 'discord-cursor';
const RETRY_KEY = 'retry-after';

// One server-owned coordinator serializes scheduled imports and keeps the
// checkpoint across deployments. No author PC or public HTTP trigger is used.
export class DiscordIngestCoordinator {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/tick') {
      return new Response(null, { status: 404 });
    }
    return this.state.blockConcurrencyWhile(async () => {
      const retryAfter = await this.state.storage.get(RETRY_KEY);
      if (typeof retryAfter === 'number' && Date.now() < retryAfter) {
        return Response.json({ deferred: true });
      }
      const secret = this.env.FEEDBACK_CONVERSATION_INGEST_SECRET?.trim();
      if (!secret) return Response.json({ error: 'Missing ingest configuration' }, { status: 503 });
      const afterId = await this.state.storage.get(CURSOR_KEY);
      try {
        const response = await fetch(INGEST_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
          body: JSON.stringify(afterId ? { afterId } : {}),
          signal: AbortSignal.timeout(20_000),
          redirect: 'manual',
        });
        if (!response.ok) throw new Error('Import rejected');
        const result = await response.json();
        if (!Number.isInteger(result.ingested) || result.ingested < 0 || !Array.isArray(result.rejected)) {
          throw new Error('Invalid import response');
        }
        if (result.lastSeenId !== undefined) {
          if (typeof result.lastSeenId !== 'string' || !/^\d{15,25}$/.test(result.lastSeenId)
            || (afterId && BigInt(result.lastSeenId) < BigInt(afterId))) {
            throw new Error('Invalid checkpoint');
          }
          if (result.lastSeenId !== afterId) await this.state.storage.put(CURSOR_KEY, result.lastSeenId);
        }
        // Only counts are returned/logged, never credentials or message bodies.
        return Response.json({ ingested: result.ingested, rejected: result.rejected.length });
      } catch {
        await this.state.storage.put(RETRY_KEY, Date.now() + RETRY_DELAY_MS);
        return Response.json({ error: 'Discord import failed; checkpoint retained' }, { status: 502 });
      }
    });
  }
}

export default {
  fetch() {
    return new Response(null, { status: 404 });
  },
  async scheduled(_event, env) {
    const id = env.INGEST_COORDINATOR.idFromName('production');
    const response = await env.INGEST_COORDINATOR.get(id).fetch('https://coordinator/tick', { method: 'POST' });
    if (!response.ok) throw new Error('Discord server import failed');
  },
};
