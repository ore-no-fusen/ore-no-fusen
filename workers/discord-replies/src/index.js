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
    if (request.method === 'POST' && new URL(request.url).pathname === '/reset-auth') {
      return this.state.blockConcurrencyWhile(async () => {
        for (const key of ['ingest-auth-error', 'ingest-upstream-error', RETRY_KEY]) await this.state.storage.delete(key);
        return Response.json({ retryReady: true, checkpointRetained: true });
      });
    }
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/tick') {
      return new Response(null, { status: 404 });
    }
    return this.state.blockConcurrencyWhile(async () => {
      const upstreamStop = await this.state.storage.get('ingest-upstream-error');
      if (upstreamStop?.repairRevision === (this.env.INGEST_REPAIR_REVISION ?? '0')) return Response.json({ error: 'Discord configuration requires repair and operator retry' }, { status: 503 });
      if (upstreamStop) { await this.state.storage.delete('ingest-upstream-error'); await this.state.storage.delete(RETRY_KEY); }
      const retryAfter = await this.state.storage.get(RETRY_KEY);
      if (typeof retryAfter === 'number' && Date.now() < retryAfter) {
        return Response.json({ deferred: true });
      }
      const secret = this.env.FEEDBACK_CONVERSATION_INGEST_SECRET?.trim();
      if (!secret) return Response.json({ error: 'Missing ingest configuration' }, { status: 503 });
      const environment = ingestEnvironment(this.env);
      if (!environment) return Response.json({ error: 'Invalid ingest environment' }, { status: 503 });
      const fingerprint = await credentialFingerprint(secret);
      const stopped = await this.state.storage.get('ingest-auth-error');
      if (stopped?.credentialFingerprint === fingerprint) return Response.json({ error: 'Ingest authentication failed; rotate the repaired credential to resume' }, { status: 503 });
      if (stopped) await this.state.storage.delete('ingest-auth-error');
      const afterId = await this.state.storage.get(CURSOR_KEY);
      const continuation = await this.state.storage.get('discord-scan');
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
          body: JSON.stringify({ ...(afterId ? { afterId } : {}), ...(continuation ? { continuation } : {}) }),
          signal: AbortSignal.timeout(20_000),
          redirect: 'manual',
        });
        if (!response.ok) {
          const failure = await response.json().catch(() => null);
          if (failure?.dependency?.source === 'discord') {
            if (failure.dependency.kind === 'authentication') await this.state.storage.put('ingest-upstream-error', { code: 'discord_authentication', at: Date.now(), repairRevision: this.env.INGEST_REPAIR_REVISION ?? '0' });
            if (failure.dependency.kind === 'rate_limit' && Number.isFinite(failure.dependency.retryAfterMs)) await this.state.storage.put(RETRY_KEY, Date.now() + Math.max(RETRY_DELAY_MS, failure.dependency.retryAfterMs));
          }
          if (response.status === 401 || response.status === 403) {
            await this.state.storage.put('ingest-auth-error', { status: response.status, at: Date.now(), credentialFingerprint: fingerprint });
          }
          if (response.status === 429) await this.state.storage.put(RETRY_KEY, Date.now() + Math.max(RETRY_DELAY_MS, retryAfterMs(response.headers.get('Retry-After'))));
          throw new Error('Import rejected');
        }
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
        }
        const next = result.continuation;
        if (next && (!['beforeId','highWaterId','floorId'].every(key => typeof next[key] === 'string' && /^\d{1,25}$/.test(next[key]))
          || next.environment !== environment || typeof next.channelId !== 'string'
          || BigInt(next.floorId) >= BigInt(next.beforeId) || BigInt(next.beforeId) > BigInt(next.highWaterId)
          || (afterId && next.floorId !== afterId) || result.lastSeenId !== afterId
          || (continuation && (next.highWaterId !== continuation.highWaterId || next.floorId !== continuation.floorId || next.channelId !== continuation.channelId || BigInt(next.beforeId) >= BigInt(continuation.beforeId))))) throw new Error('Invalid scan continuation');
        if (!next && continuation && result.lastSeenId !== continuation.highWaterId) throw new Error('Incomplete scan checkpoint');
        await this.state.storage.transaction(async txn => {
          if (next) await txn.put('discord-scan', next);
          else if (continuation) await txn.delete('discord-scan');
          if (result.lastSeenId !== undefined && result.lastSeenId !== afterId) await txn.put(CURSOR_KEY, result.lastSeenId);
        });
        // Only counts are returned/logged, never credentials or message bodies.
        return Response.json({ ingested: result.ingested, rejected: result.rejected.length });
      } catch {
        const existingDelay = await this.state.storage.get(RETRY_KEY) ?? 0;
        await this.state.storage.put(RETRY_KEY, Math.max(existingDelay, Date.now() + RETRY_DELAY_MS));
        return Response.json({ error: 'Discord import failed; checkpoint retained' }, { status: 502 });
      }
    });
  }
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (request.method === 'POST' && path === '/ingest/retry') {
      const secret = env.FEEDBACK_CONVERSATION_INGEST_SECRET?.trim();
      if (!secret || request.headers.get('authorization') !== 'Bearer ' + secret) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      const environment = ingestEnvironment(env);
      if (!environment) return new Response(null, { status: 503 });
      return env.INGEST_COORDINATOR.get(env.INGEST_COORDINATOR.idFromName(environment)).fetch('https://coordinator/reset-auth', { method: 'POST' });
    }
    if (!path.startsWith('/gateway/') || !env?.DISCORD_GATEWAY) return new Response(null, { status: 404 });
    const id = env.DISCORD_GATEWAY.idFromName('discord-feedback-gateway');
    const internalUrl = new URL(request.url);
    internalUrl.pathname = path.slice('/gateway'.length);
    return env.DISCORD_GATEWAY.get(id).fetch(new Request(internalUrl, request));
  },
  async scheduled(_event, env) {
    const environment = ingestEnvironment(env);
    if (!environment) throw new Error('Invalid ingest environment');
    if (environment === 'production' && env.DISCORD_GATEWAY) {
      const gatewayId = env.DISCORD_GATEWAY.idFromName('discord-feedback-gateway');
      const gateway = env.DISCORD_GATEWAY.get(gatewayId);
      const controlSecret = env.DISCORD_GATEWAY_CONTROL_SECRET?.trim();
      if (env.DISCORD_GATEWAY_ENABLED === 'true' && controlSecret) {
        const start = await gateway.fetch('https://gateway/start', {
          method: 'POST', headers: { Authorization: `Bearer ${controlSecret}` },
        });
        if (start.ok) {
          const activeEnvironments = (env.GATEWAY_DELIVERY_ENVIRONMENTS || 'development')
            .split(',').map(value => value.trim());
          if (activeEnvironments.includes('production')) return;
          // Keep production REST recovery active while only the development API is under test.
        }
      } else if (controlSecret) {
        await gateway.fetch('https://gateway/stop', {
          method: 'POST', headers: { Authorization: `Bearer ${controlSecret}` },
        });
      }
    }
    const id = env.INGEST_COORDINATOR.idFromName(environment);
    const response = await env.INGEST_COORDINATOR.get(id).fetch('https://coordinator/tick', { method: 'POST' });
    if (!response.ok) throw new Error('Discord server import failed');
  },
};
import { DiscordGateway, credentialFingerprint, retryAfterMs } from './gateway.js';

export { DiscordGateway };
