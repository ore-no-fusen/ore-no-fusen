const INGEST_URLS = {
  production: 'https://ore-no-fusen.vercel.app/api/feedback/discord/ingest',
  development: 'https://ore-no-fusen-git-develop-uch54s-projects.vercel.app/api/feedback/discord/ingest',
};
function ingestEnvironment(env) {
  const environment = env.INGEST_ENVIRONMENT;
  return typeof environment === 'string' && Object.hasOwn(INGEST_URLS, environment) ? environment : null;
}
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
      const environment = ingestEnvironment(this.env);
      if (!environment) return Response.json({ error: 'Invalid ingest environment' }, { status: 503 });
      const afterId = await this.state.storage.get(CURSOR_KEY);
      try {
        // Check before the write request: an old Preview may still share the
        // production collections and must never receive a development import.
        if (environment === 'development') {
          const probe = await fetch(INGEST_URLS.development, {
            method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(5_000),
          });
          const declaration = await probe.json();
          if (probe.status !== 405 || declaration.environment !== 'development'
            || declaration.developmentReplyMapping !== 'notification-only') {
            throw new Error('Development isolation not confirmed');
          }
        }
        const response = await fetch(INGEST_URLS[environment], {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
          body: JSON.stringify(afterId ? { afterId } : {}),
          signal: AbortSignal.timeout(20_000),
          redirect: 'manual',
        });
        if (!response.ok) throw new Error('Import rejected');
        const result = await response.json();
        // A development deployment must confirm its isolated data namespace.
        if (environment === 'development' && result.environment !== 'development') {
          throw new Error('Development isolation not confirmed');
        }
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
    const environment = ingestEnvironment(env);
    if (!environment) throw new Error('Invalid ingest environment');
    const id = env.INGEST_COORDINATOR.idFromName(environment);
    const response = await env.INGEST_COORDINATOR.get(id).fetch('https://coordinator/tick', { method: 'POST' });
    if (!response.ok) throw new Error('Discord server import failed');
  },
};
