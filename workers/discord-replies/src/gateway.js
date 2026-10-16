const GATEWAY_URL = 'https://discord.com/api/v10/gateway/bot';
const API_URLS = {
  production: 'https://ore-no-fusen.vercel.app/api/feedback/discord/ingest',
  development: 'https://ore-no-fusen-git-develop-uch54s-projects.vercel.app/api/feedback/discord/ingest',
};
const ACTIVE_ENVS_KEY = 'gateway-active-environments';
const SESSION_KEY = 'gateway-session';
const SEQUENCE_KEY = 'gateway-sequence';
const CONNECT_BACKOFF_KEY = 'gateway-connect-backoff';
const MAX_BACKOFF_MS = 5 * 60_000;

function environmentList(raw) {
  const values = (raw || 'development').split(',').map(value => value.trim());
  if (!values.length || values.some(value => !Object.hasOwn(API_URLS, value))) return null;
  return [...new Set(values)];
}

function matchingSecret(env, environment) {
  return environment === 'production'
    ? env.FEEDBACK_INGEST_SECRET_PRODUCTION?.trim()
    : env.FEEDBACK_INGEST_SECRET_DEVELOPMENT?.trim();
}

export class DiscordGateway {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.socket = null;
    this.heartbeatTimer = null;
    this.heartbeatAcked = true;
    this.generation = 0;
    this.reconnectDelay = 1_000;
    this.stopping = false;
    this.eventQueue = Promise.resolve();
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    const controlSecret = this.env.DISCORD_GATEWAY_CONTROL_SECRET?.trim();
    if (!controlSecret || request.headers.get('authorization') !== `Bearer ${controlSecret}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (request.method === 'GET' && path === '/status') {
      const active = environmentList(this.env.GATEWAY_DELIVERY_ENVIRONMENTS);
      return Response.json({
        enabled: this.env.DISCORD_GATEWAY_ENABLED === 'true',
        connected: Boolean(this.socket),
        activeEnvironments: active,
        sequence: await this.state.storage.get(SEQUENCE_KEY) ?? null,
      });
    }
    if (request.method !== 'POST' || !['/start', '/stop'].includes(path)) return new Response(null, { status: 404 });
    if (path === '/stop') {
      this.stopping = true;
      this.generation += 1;
      this.clearHeartbeat();
      this.socket?.close(1000, 'Gateway stopped by operator');
      this.socket = null;
      await this.state.storage.delete('gateway-error');
      await this.state.storage.delete(CONNECT_BACKOFF_KEY);
      await this.state.storage.deleteAlarm();
      return Response.json({ stopped: true, inboxRetained: true });
    }
    if (this.env.DISCORD_GATEWAY_ENABLED !== 'true') {
      return Response.json({ error: 'Gateway is disabled by configuration' }, { status: 409 });
    }
    const environments = environmentList(this.env.GATEWAY_DELIVERY_ENVIRONMENTS);
    if (!environments || environments.some(environment => !matchingSecret(this.env, environment))
      || !this.env.DISCORD_FEEDBACK_CHANNEL_ID?.trim() || !this.env.DISCORD_FEEDBACK_GUILD_ID?.trim()
      || !(this.env.DISCORD_ALLOWED_USER_IDS || '').split(',').some(value => /^\d{15,25}$/.test(value.trim()))) {
      return Response.json({ error: 'Gateway delivery configuration is incomplete' }, { status: 503 });
    }
    if (await this.state.storage.get('gateway-error')) {
      return Response.json({ error: 'Gateway is stopped after a permanent configuration error' }, { status: 503 });
    }
    this.stopping = false;
    await this.connect();
    return Response.json({ starting: true, activeEnvironments: environments }, { status: 202 });
  }

  async alarm() {
    await this.deliverPending();
    if (!this.stopping && !this.socket && this.env.DISCORD_GATEWAY_ENABLED === 'true') await this.connect();
    else if (await this.state.storage.getAlarm() === null) await this.state.storage.setAlarm(Date.now() + 30_000);
  }

  async connect() {
    if (this.socket || this.stopping || await this.state.storage.get('gateway-error')) return;
    const token = this.env.DISCORD_BOT_TOKEN?.trim();
    if (!token) return this.scheduleReconnect('missing_bot_token', true);
    const active = environmentList(this.env.GATEWAY_DELIVERY_ENVIRONMENTS);
    if (!active || active.some(environment => !matchingSecret(this.env, environment))) {
      return this.scheduleReconnect('missing_delivery_configuration', true);
    }

    const session = await this.state.storage.get(SESSION_KEY);
    let gatewayUrl = session?.resumeGatewayUrl;
    if (!gatewayUrl) {
      let response;
      try {
        response = await fetch(GATEWAY_URL, {
          headers: { Authorization: `Bot ${token}` },
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        return this.scheduleReconnect('gateway_discovery_network_error', false);
      }
      if (!response.ok) return this.scheduleReconnect(`gateway_discovery_${response.status}`, response.status === 401 || response.status === 403);
      gatewayUrl = (await response.json()).url;
    }
    const url = new URL(gatewayUrl);
    url.searchParams.set('v', '10');
    url.searchParams.set('encoding', 'json');
    const generation = ++this.generation;
    let socket;
    try {
      socket = new WebSocket(url.toString());
    } catch {
      this.socket = null;
      await this.scheduleReconnect('gateway_socket_open_failed', false);
      return;
    }
    this.socket = socket;
    socket.addEventListener('message', event => {
      this.eventQueue = this.eventQueue
        .then(() => generation === this.generation ? this.onGatewayData(event.data, generation) : undefined)
        .catch(() => this.disconnect(generation));
    });
    socket.addEventListener('close', event => this.onSocketClose(event, generation));
    socket.addEventListener('error', () => this.disconnect(generation));
    this.reconnectDelay = 1_000;
  }

  async onGatewayData(raw, generation) {
    const packet = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    if (packet.op === 10) {
      const interval = Number(packet.d?.heartbeat_interval);
      if (!Number.isFinite(interval) || interval < 1_000) throw new Error('Invalid Gateway heartbeat interval');
      const jitter = Math.floor(Math.random() * interval);
      this.clearHeartbeat();
      this.heartbeatTimer = setTimeout(() => this.heartbeat(interval, generation), jitter);
      const session = await this.state.storage.get(SESSION_KEY);
      if (session?.sessionId && Number.isInteger(await this.state.storage.get(SEQUENCE_KEY))) {
        this.send({ op: 6, d: { token: this.env.DISCORD_BOT_TOKEN, session_id: session.sessionId,
          seq: await this.state.storage.get(SEQUENCE_KEY) } });
      } else {
        this.send({ op: 2, d: { token: this.env.DISCORD_BOT_TOKEN, intents: 512,
          properties: { os: 'windows', browser: 'ore-no-fusen-feedback', device: 'ore-no-fusen-feedback' } } });
      }
      return;
    }
    if (packet.op === 11) {
      this.heartbeatAcked = true;
      return;
    }
    if (packet.op === 7) return this.disconnect(generation);
    if (packet.op === 9) {
      if (!packet.d) await this.state.storage.delete(SESSION_KEY);
      await this.state.storage.delete(SEQUENCE_KEY);
      return this.disconnect(generation, 1_000 + Math.floor(Math.random() * 4_000));
    }
    if (packet.op !== 0) return;

    if (packet.t === 'READY') {
      const resumeGatewayUrl = packet.d?.resume_gateway_url;
      const sessionId = packet.d?.session_id;
      if (typeof resumeGatewayUrl !== 'string' || typeof sessionId !== 'string') throw new Error('Invalid READY packet');
      await this.state.storage.put(SESSION_KEY, { resumeGatewayUrl, sessionId });
    }
    const sequence = packet.s;
    if (!Number.isInteger(sequence) || sequence < 0) throw new Error('Invalid Gateway sequence');
    if (packet.t === 'MESSAGE_CREATE') await this.persistMessageEvent(packet.d, sequence);
    else await this.state.storage.put(SEQUENCE_KEY, sequence);
    if (packet.t === 'MESSAGE_CREATE') await this.deliverPending();
  }

  async persistMessageEvent(message, sequence) {
    if (!message || message.channel_id !== this.env.DISCORD_FEEDBACK_CHANNEL_ID
      || message.guild_id !== this.env.DISCORD_FEEDBACK_GUILD_ID
      || !/^\d{15,25}$/.test(message.id ?? '')
      || !/^\d{15,25}$/.test(message.channel_id ?? '')
      || !/^\d{15,25}$/.test(message.guild_id ?? '')
      || !/^\d{15,25}$/.test(message.message_reference?.message_id ?? '')) {
      await this.state.storage.put(SEQUENCE_KEY, sequence);
      return;
    }
    const allowed = (this.env.DISCORD_ALLOWED_USER_IDS || '').split(',').map(value => value.trim()).filter(Boolean);
    if (message.author?.bot || !allowed.includes(message.author?.id ?? '')) {
      await this.state.storage.put(SEQUENCE_KEY, sequence);
      return;
    }
    const key = `inbox:${message.id}`;
    await this.state.storage.transaction(async txn => {
      const existing = await txn.get(key);
      if (!existing) {
        await txn.put(key, {
          messageId: message.id,
          channelId: message.channel_id,
          guildId: message.guild_id,
          authorId: message.author.id,
          referencedMessageId: message.message_reference.message_id,
          sequence,
          receivedAt: Date.now(),
          deliveries: { production: 'held', development: 'held' },
        });
      }
      await txn.put(SEQUENCE_KEY, sequence);
    });
  }

  async deliverPending() {
    const active = environmentList(this.env.GATEWAY_DELIVERY_ENVIRONMENTS);
    if (!active) return;
    const entries = await this.state.storage.list({ prefix: 'inbox:', limit: 100 });
    for (const [key, event] of entries) {
      for (const environment of active) {
        if (event.deliveries?.[environment] === 'confirmed') continue;
        if (typeof event.retryAt?.[environment] === 'number' && Date.now() < event.retryAt[environment]) continue;
        const secret = matchingSecret(this.env, environment);
        if (!secret) continue;
        try {
          const response = await fetch(API_URLS[environment], {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
            body: JSON.stringify({ mode: 'gateway-event', messageId: event.messageId,
              channelId: event.channelId, guildId: event.guildId }),
            redirect: 'manual',
            signal: AbortSignal.timeout(10_000),
          });
          if (!response.ok) {
            this.deferDelivery(event, environment);
            await this.state.storage.put(key, event);
            continue;
          }
          const result = await response.json();
          if (!['saved', 'duplicate', 'ignored'].includes(result.outcome)
            || result.environment !== environment) {
            this.deferDelivery(event, environment);
            await this.state.storage.put(key, event);
            continue;
          }
          event.deliveries[environment] = 'confirmed';
          if (event.retryAt) delete event.retryAt[environment];
          await this.state.storage.put(key, event);
        } catch {
          this.deferDelivery(event, environment);
          await this.state.storage.put(key, event);
        }
      }
      if (['production', 'development'].every(environment => event.deliveries?.[environment] === 'confirmed')) {
        await this.state.storage.delete(key);
      }
    }
    await this.state.storage.setAlarm(Date.now() + 30_000);
  }

  deferDelivery(event, environment) {
    event.attempts ??= {};
    event.retryAt ??= {};
    const attempts = (event.attempts[environment] ?? 0) + 1;
    event.attempts[environment] = attempts;
    event.retryAt[environment] = Date.now() + Math.min(30_000 * 2 ** Math.min(attempts - 1, 10), 5 * 60_000);
  }

  heartbeat(interval, generation) {
    if (generation !== this.generation || !this.socket) return;
    if (!this.heartbeatAcked) return this.disconnect(generation);
    this.heartbeatAcked = false;
    const sequence = this.state.storage.get(SEQUENCE_KEY);
    Promise.resolve(sequence).then(value => this.send({ op: 1, d: value ?? null }));
    this.heartbeatTimer = setTimeout(() => this.heartbeat(interval, generation), interval);
  }

  send(packet) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(packet));
  }

  async disconnect(generation, delay) {
    if (generation !== this.generation) return;
    this.generation += 1;
    this.clearHeartbeat();
    const socket = this.socket;
    this.socket = null;
    try { socket?.close(); } catch { /* already closed */ }
    if (this.stopping) return;
    await this.scheduleReconnect('gateway_disconnected', false, delay);
  }

  async onSocketClose(event, generation) {
    const fatalCodes = new Set([4004, 4010, 4011, 4012, 4013, 4014]);
    if (fatalCodes.has(event.code)) {
      this.generation += 1;
      this.clearHeartbeat();
      this.socket = null;
      if ([4007, 4009].includes(event.code)) {
        await this.state.storage.delete(SESSION_KEY);
        await this.state.storage.delete(SEQUENCE_KEY);
      }
      await this.state.storage.put('gateway-error', { reason: `fatal_gateway_close_${event.code}`, at: Date.now() });
      return;
    }
    if ([4007, 4009].includes(event.code)) {
      await this.state.storage.delete(SESSION_KEY);
      await this.state.storage.delete(SEQUENCE_KEY);
    }
    const delay = event.code === 4008 ? MAX_BACKOFF_MS : undefined;
    await this.disconnect(generation, delay);
  }

  async scheduleReconnect(reason, permanent, delay) {
    if (permanent) {
      await this.state.storage.put('gateway-error', { reason, at: Date.now() });
      return;
    }
    const wait = delay ?? this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_BACKOFF_MS);
    await this.state.storage.put(CONNECT_BACKOFF_KEY, { reason, until: Date.now() + wait });
    await this.state.storage.setAlarm(Date.now() + wait);
  }

  clearHeartbeat() {
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }
}
