import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publishAnnouncement, serveDashboard, survivalStats } from './member-stats.mjs';

test('生存メーターは日付が不明な会員や未来の日付を活動人数に含めない', () => {
  const members = [
    { lastSeenAt: '2026-09-24' },
    { lastSeenAt: '2026-09-18' },
    { lastSeenAt: '2026-09-17' },
    { lastSeenAt: '2026-09-25' },
    {},
  ];
  assert.deepEqual(survivalStats(members, new Date('2026-09-24T12:00:00Z')), { today: 1, week: 2, unknown: 2 });
});

test('お便りはAPIの読み取り形式で新規作成される', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url, init };
    return { ok: true };
  };
  try {
    const id = await publishAnnouncement('test-token', ' お知らせ ', '# 本文');
    const write = JSON.parse(request.init.body).writes[0];
    const value = JSON.parse(write.update.fields.payload.stringValue);
    assert.match(request.url, /\/documents:commit$/);
    assert.match(write.update.name, new RegExp(`/announcements/${id}$`));
    assert.deepEqual(write.currentDocument, { exists: false });
    assert.equal(value.title, 'お知らせ');
    assert.equal(value.body, '# 本文');
    assert.equal(value.segment, 'all');
    assert.equal(value.active, true);
    assert.ok(new Date(value.expiresAt) > new Date(value.createdAt));
  } finally { globalThis.fetch = originalFetch; }
});

test('投稿はローカル画面のCSRFトークンを要求する', async () => {
  const originalFetch = globalThis.fetch;
  let writes = 0;
  globalThis.fetch = async () => { writes++; return { ok: true }; };
  const { server, url } = await serveDashboard('<input value="__CSRF_TOKEN__">', 'test-token', false);
  try {
    const html = await (await originalFetch(url)).text();
    const token = html.match(/value="([a-f0-9]{64})"/)[1];
    const body = JSON.stringify({ title: '件名', body: '本文' });
    const rejected = await originalFetch(`${url}announcements`, { method: 'POST', headers: { Origin: url.slice(0, -1), 'Content-Type': 'application/json' }, body });
    assert.equal(rejected.status, 403);
    assert.equal(writes, 0);
    const accepted = await originalFetch(`${url}announcements`, { method: 'POST', headers: { Origin: url.slice(0, -1), 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body });
    assert.equal(accepted.status, 201);
    assert.equal(writes, 1);
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise(resolve => server.close(resolve));
  }
});
