import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { DiscordGateway, DiscordIngestCoordinator } from './index.js';

function fixture(initial = {}, env = {}) {
  const entries = new Map(Object.entries(initial));
  const puts = [];
  let queue = Promise.resolve();
  const state = {
    storage: {
      async get(key) { return entries.get(key); },
      async put(key, value) { puts.push(key); entries.set(key, value); },
      async delete(key) { entries.delete(key); },
      async transaction(callback) { return callback(this); },
    },
    blockConcurrencyWhile(callback) {
      const next = queue.then(callback);
      queue = next.catch(() => {});
      return next;
    },
  };
  return { entries, puts, coordinator: new DiscordIngestCoordinator(state, { FEEDBACK_CONVERSATION_INGEST_SECRET: 'test-secret', INGEST_ENVIRONMENT: 'production', ...env }) };
}
const tick = () => new Request('https://coordinator/tick', { method: 'POST' });

test('server imports production replies without an author PC and resumes its checkpoint', async (t) => {
  const fixtureData = fixture();
  const bodies = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://ore-no-fusen.vercel.app/api/feedback/discord/ingest');
    assert.equal(init.headers.Authorization, 'Bearer test-secret');
    assert.equal(init.redirect, 'manual');
    bodies.push(JSON.parse(init.body));
    return Response.json({ ingested: 1, rejected: [], lastSeenId: '123456789012345678' });
  });
  assert.equal((await fixtureData.coordinator.fetch(tick())).status, 200);
  assert.equal((await fixtureData.coordinator.fetch(tick())).status, 200);
  assert.deepEqual(bodies, [{}, { afterId: '123456789012345678' }]);
  assert.deepEqual(fixtureData.puts, ['discord-cursor']);
});

test('failure retains checkpoint, waits five minutes and does not disclose credentials', async (t) => {
  const fixtureData = fixture({ 'discord-cursor': '123456789012345678' });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response('test-secret', { status: 401 }); });
  const response = await fixtureData.coordinator.fetch(tick());
  assert.equal(response.status, 502);
  assert.equal((await response.text()).includes('test-secret'), false);
  assert.equal(fixtureData.entries.get('discord-cursor'), '123456789012345678');
  assert.deepEqual(await (await fixtureData.coordinator.fetch(tick())).json(), { deferred: true });
  assert.equal(calls, 1);
  fixtureData.entries.set('retry-after', Date.now() - 1);
  await fixtureData.coordinator.fetch(tick());
  assert.equal(calls, 2);
});

test('concurrent triggers serialize and the second uses the saved checkpoint', async (t) => {
  const fixtureData = fixture();
  let active = 0;
  const bodies = [];
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    assert.equal(++active, 1);
    bodies.push(JSON.parse(init.body));
    await new Promise(resolve => setTimeout(resolve, 5));
    active--;
    return Response.json({ ingested: 0, rejected: [], lastSeenId: '123456789012345678' });
  });
  await Promise.all([fixtureData.coordinator.fetch(tick()), fixtureData.coordinator.fetch(tick())]);
  assert.deepEqual(bodies, [{}, { afterId: '123456789012345678' }]);
});

test('malformed or regressing checkpoint never advances the saved state', async (t) => {
  for (const lastSeenId of ['invalid', '123456789012345677']) {
    const fixtureData = fixture({ 'discord-cursor': '123456789012345678' });
    t.mock.method(globalThis, 'fetch', async () => Response.json({ ingested: 0, rejected: [], lastSeenId }));
    assert.equal((await fixtureData.coordinator.fetch(tick())).status, 502);
    assert.equal(fixtureData.entries.get('discord-cursor'), '123456789012345678');
    t.mock.restoreAll();
  }
});

test('public HTTP requests cannot trigger import', async () => {
  assert.equal((await worker.fetch(new Request('https://worker.example/public'))).status, 404);
  assert.equal((await fixture().coordinator.fetch(new Request('https://coordinator/tick'))).status, 404);
});

function gatewayFixture(env = {}) {
  const entries = new Map();
  const storage = {
    async get(key) { return entries.get(key); },
    async put(key, value) { entries.set(key, value); },
    async delete(key) { return entries.delete(key); },
    async deleteAlarm() {},
    async setAlarm() {},
    async list({ prefix, startAfter, limit = 100 }) { return new Map([...entries].filter(([key]) => key.startsWith(prefix) && (!startAfter || key > startAfter)).sort(([a],[b])=>a.localeCompare(b)).slice(0,limit)); },
    async transaction(callback) { return callback(storage); },
  };
  const state = { storage };
  const gateway = new DiscordGateway(state, {
    DISCORD_GATEWAY_ENABLED: 'true',
    DISCORD_FEEDBACK_CHANNEL_ID: '423456789012345678',
    DISCORD_FEEDBACK_GUILD_ID: '523456789012345678',
    DISCORD_ALLOWED_USER_IDS: '623456789012345678',
    GATEWAY_DELIVERY_ENVIRONMENTS: 'development',
    FEEDBACK_INGEST_SECRET_PRODUCTION: 'prod-secret',
    FEEDBACK_INGEST_SECRET_DEVELOPMENT: 'dev-secret',
    ...env,
  });
  return { entries, gateway };
}

test('Gateway inbox stores only reply identifiers and checkpoints sequence atomically', async () => {
  const { entries, gateway } = gatewayFixture();
  await gateway.persistMessageEvent({
    id: '123456789012345678', channel_id: '423456789012345678', guild_id: '523456789012345678',
    author: { id: '623456789012345678', bot: false }, content: 'must not persist',
    message_reference: { message_id: '223456789012345678' },
  }, 42);
  assert.equal(entries.get('gateway-sequence'), 42);
  const item = entries.get('inbox:123456789012345678');
  assert.equal(item.referencedMessageId, '223456789012345678');
  assert.equal(JSON.stringify(item).includes('must not persist'), false);
  assert.deepEqual(item.deliveries, { production: 'held', development: 'held' });
});

test('Gateway retains held environment results and deletes an event only after both environments confirm', async (t) => {
  const { entries, gateway } = gatewayFixture();
  entries.set('inbox:123456789012345678', {
    messageId: '123456789012345678', channelId: '423456789012345678', guildId: '523456789012345678',
    deliveries: { production: 'held', development: 'held' },
  });
  const requests = [];
  let phase = 'development';
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body) });
    const environment = url.includes('-git-develop-') ? 'development' : 'production';
    return Response.json({ environment, outcome: phase === 'development' ? 'saved' : 'duplicate' });
  });
  await gateway.deliverPending();
  assert.equal(entries.get('inbox:123456789012345678').deliveries.development, 'confirmed');
  assert.equal(entries.get('inbox:123456789012345678').deliveries.production, 'held');
  assert.equal(requests.length, 1);
  assert.equal(JSON.stringify(requests[0].body).includes('content'), false);

  phase = 'all';
  gateway.env.GATEWAY_DELIVERY_ENVIRONMENTS = 'production,development';
  await gateway.deliverPending();
  assert.equal(entries.has('inbox:123456789012345678'), false);
});

test('redirect is rejected without following it or advancing checkpoint', async (t) => {
  const fixtureData = fixture({ 'discord-cursor': '123456789012345678' });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    calls++;
    assert.equal(init.redirect, 'manual');
    return new Response(null, { status: 302, headers: { Location: 'https://untrusted.example' } });
  });
  assert.equal((await fixtureData.coordinator.fetch(tick())).status, 502);
  assert.equal(calls, 1);
  assert.equal(fixtureData.entries.get('discord-cursor'), '123456789012345678');
});

test('missing server credential makes no network request', async (t) => {
  const fixtureData = fixture();
  fixtureData.coordinator.env = {};
  const mock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected request'); });
  assert.equal((await fixtureData.coordinator.fetch(tick())).status, 503);
  assert.equal(mock.mock.callCount(), 0);
});

test('development uses only its fixed API and independently resumes its checkpoint', async (t) => {
  const production = fixture({ 'discord-cursor': '223456789012345678' });
  const development = fixture({}, { INGEST_ENVIRONMENT: 'development' });
  const bodies = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://ore-no-fusen-git-develop-uch54s-projects.vercel.app/api/feedback/discord/ingest');
    if (init.method === 'GET') {
      assert.equal(init.headers, undefined);
      return Response.json({ environment: 'development', developmentReplyMapping: 'notification-only' }, { status: 405 });
    }
    bodies.push(JSON.parse(init.body));
    return Response.json({ environment: 'development', ingested: 1, rejected: [], lastSeenId: '123456789012345678' });
  });
  assert.equal((await development.coordinator.fetch(tick())).status, 200);
  assert.equal((await development.coordinator.fetch(tick())).status, 200);
  assert.deepEqual(bodies, [{}, { afterId: '123456789012345678' }]);
  assert.equal(production.entries.get('discord-cursor'), '223456789012345678');
});

test('development refuses a response without confirmed data isolation', async (t) => {
  const development = fixture({}, { INGEST_ENVIRONMENT: 'development' });
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    requests.push(init.method);
    return Response.json({ environment: 'production' }, { status: 405 });
  });
  assert.equal((await development.coordinator.fetch(tick())).status, 502);
  assert.deepEqual(requests, ['GET']);
  assert.equal(development.entries.has('discord-cursor'), false);
});

test('development rejects an unexpected import environment without advancing its checkpoint', async (t) => {
  const development = fixture({}, { INGEST_ENVIRONMENT: 'development' });
  t.mock.method(globalThis, 'fetch', async (_url, init) => init.method === 'GET'
    ? Response.json({ environment: 'development', developmentReplyMapping: 'notification-only' }, { status: 405 })
    : Response.json({ environment: 'production', ingested: 0, rejected: [], lastSeenId: '123456789012345678' }));
  assert.equal((await development.coordinator.fetch(tick())).status, 502);
  assert.equal(development.entries.has('discord-cursor'), false);
});

test('development does not POST to an API without notification mapping isolation', async (t) => {
  const development = fixture({}, { INGEST_ENVIRONMENT: 'development' });
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    requests.push(init.method);
    return Response.json({ environment: 'development' }, { status: 405 });
  });
  assert.equal((await development.coordinator.fetch(tick())).status, 502);
  assert.deepEqual(requests, ['GET']);
  assert.equal(development.entries.has('discord-cursor'), false);
});

test('unknown environment makes no request and development scheduler uses its own coordinator', async (t) => {
  const invalid = fixture({}, { INGEST_ENVIRONMENT: 'https://untrusted.example' });
  const mock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected request'); });
  assert.equal((await invalid.coordinator.fetch(tick())).status, 503);
  assert.equal(mock.mock.callCount(), 0);
  assert.equal((await fixture({}, { INGEST_ENVIRONMENT: undefined }).coordinator.fetch(tick())).status, 503);
  assert.equal(mock.mock.callCount(), 0);
  await worker.scheduled({}, {
    INGEST_ENVIRONMENT: 'development',
    INGEST_COORDINATOR: {
      idFromName(name) { assert.equal(name, 'development'); return name; },
      get(id) { assert.equal(id, 'development'); return { async fetch() { return Response.json({ ingested: 0 }); } }; },
    },
  });
});

test('Gateway scans past 100 held completed entries without deleting inactive evidence',async t=>{
 const f=gatewayFixture();for(let n=1;n<=101;n++)f.entries.set('inbox:'+String(n).padStart(20,'0'),{messageId:String(n),channelId:'c',guildId:'g',deliveries:{production:'held',development:n<=100?'confirmed':'held'}});
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({outcome:'saved',environment:'development'})});
 await f.gateway.deliverPending();await f.gateway.deliverPending();assert.equal(calls,1);assert.equal(f.entries.size>=101,true);assert.equal(f.entries.get('inbox:'+String(101).padStart(20,'0')).deliveries.development,'confirmed');
});
test('Gateway gives both active environments a turn and serializes overlapping delivery',async t=>{
 const f=gatewayFixture({GATEWAY_DELIVERY_ENVIRONMENTS:'production,development'});f.entries.set('inbox:1',{messageId:'1',channelId:'c',guildId:'g',deliveries:{production:'held',development:'held'}});const targets=[];
 t.mock.method(globalThis,'fetch',async url=>{targets.push(url);if(url.includes('-git-develop-'))return Response.json({outcome:'saved',environment:'development'});throw Error('offline');});
 await Promise.all([f.gateway.deliverPending(),f.gateway.deliverPending()]);assert.equal(targets.length,2);assert.equal(f.entries.get('inbox:1').deliveries.development,'confirmed');assert.equal(f.entries.get('inbox:1').deliveries.production,'held');
});
test('continuation and completed high-water checkpoint are committed together',async t=>{
 const f=fixture({'discord-cursor':'123456789012345678'});const scan={beforeId:'123456789012345680',highWaterId:'123456789012345690',floorId:'123456789012345678',environment:'production',channelId:'channel'};let calls=0;
 t.mock.method(globalThis,'fetch',async(_url,init)=>{calls++;const body=JSON.parse(init.body);if(calls===1)return Response.json({ingested:2,rejected:[],lastSeenId:'123456789012345678',continuation:scan});assert.deepEqual(body.continuation,scan);return Response.json({ingested:1,rejected:[],lastSeenId:scan.highWaterId});});
 await f.coordinator.fetch(tick());assert.equal(f.entries.get('discord-cursor'),scan.floorId);assert.deepEqual(f.entries.get('discord-scan'),scan);await f.coordinator.fetch(tick());assert.equal(f.entries.get('discord-cursor'),scan.highWaterId);assert.equal(f.entries.has('discord-scan'),false);
});

test('Gateway stops repeated authentication failures, resumes after secret rotation, and keeps inbox', async t => {
 const f=gatewayFixture();f.entries.set('inbox:1',{messageId:'1',channelId:'c',guildId:'g',deliveries:{production:'held',development:'held'}});let calls=0;
 t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response(null,{status:401})});
 await f.gateway.deliverPending();await f.gateway.deliverPending();assert.equal(calls,1);assert.equal(f.entries.get('delivery-error:development').permanent,true);assert.equal(f.entries.get('inbox:1').deliveries.development,'held');
 f.gateway.env.FEEDBACK_INGEST_SECRET_DEVELOPMENT='rotated';await f.gateway.deliverPending();assert.equal(calls,2);
});
test('Gateway honors Retry-After without blocking another environment', async t=>{
 const f=gatewayFixture({GATEWAY_DELIVERY_ENVIRONMENTS:'production,development'});f.entries.set('inbox:1',{messageId:'1',channelId:'c',guildId:'g',deliveries:{production:'held',development:'held'}});const before=Date.now();
 t.mock.method(globalThis,'fetch',async url=>url.includes('-git-develop-')?Response.json({outcome:'saved',environment:'development'}):new Response(null,{status:429,headers:{'Retry-After':'600'}}));
 await f.gateway.deliverPending();const event=f.entries.get('inbox:1');assert.equal(event.deliveries.development,'confirmed');assert.ok(event.retryAt.production>=before+600000);
});
test('explicit authenticated delivery retry clears the permanent stop only', async()=>{
 const f=gatewayFixture({DISCORD_GATEWAY_CONTROL_SECRET:'control'});f.entries.set('delivery-error:development',{permanent:true});
 assert.equal((await f.gateway.fetch(new Request('https://gateway/retry-delivery',{method:'POST'}))).status,401);assert.equal(f.entries.has('delivery-error:development'),true);
 assert.equal((await f.gateway.fetch(new Request('https://gateway/retry-delivery',{method:'POST',headers:{authorization:'Bearer control'}}))).status,200);assert.equal(f.entries.has('delivery-error:development'),false);
});

test('Gateway rate limit pauses the whole destination, including different inbox IDs',async t=>{
 const f=gatewayFixture();for(const id of ['1','2'])f.entries.set('inbox:'+id,{messageId:id,channelId:'c',guildId:'g',deliveries:{production:'held',development:'held'}});let calls=0;
 t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response(null,{status:429,headers:{'Retry-After':'600'}})});
 await f.gateway.deliverPending();await f.gateway.deliverPending();assert.equal(calls,1);assert.ok(f.entries.get('delivery-error:development').retryUntil>Date.now()+590000);
});
