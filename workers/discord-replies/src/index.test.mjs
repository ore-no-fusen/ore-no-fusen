import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { DiscordIngestCoordinator } from './index.js';

function fixture(initial = {}) {
  const entries = new Map(Object.entries(initial));
  const puts = [];
  let queue = Promise.resolve();
  const state = {
    storage: {
      async get(key) { return entries.get(key); },
      async put(key, value) { puts.push(key); entries.set(key, value); },
    },
    blockConcurrencyWhile(callback) {
      const next = queue.then(callback);
      queue = next.catch(() => {});
      return next;
    },
  };
  return { entries, puts, coordinator: new DiscordIngestCoordinator(state, { FEEDBACK_CONVERSATION_INGEST_SECRET: 'test-secret' }) };
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
  assert.equal(worker.fetch().status, 404);
  assert.equal((await fixture().coordinator.fetch(new Request('https://coordinator/tick'))).status, 404);
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
