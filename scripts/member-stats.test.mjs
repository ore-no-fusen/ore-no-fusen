import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from '@playwright/test';
import { generateHtml, publishAnnouncement, serveDashboard, survivalStats } from './member-stats.mjs';

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
    const id = await publishAnnouncement('test-token', ' お知らせ ', '# 本文', 'veteran');
    const write = JSON.parse(request.init.body).writes[0];
    const value = JSON.parse(write.update.fields.payload.stringValue);
    assert.match(request.url, /\/documents:commit$/);
    assert.match(write.update.name, new RegExp(`/announcements/${id}$`));
    assert.deepEqual(write.currentDocument, { exists: false });
    assert.equal(value.title, 'お知らせ');
    assert.equal(value.body, '# 本文');
    assert.equal(value.segment, 'veteran');
    assert.equal(value.active, true);
    assert.ok(new Date(value.expiresAt) > new Date(value.createdAt));
  } finally { globalThis.fetch = originalFetch; }
});

test('個別宛ては登録済みの会員番号だけを保存し、不正な宛先は書き込まない', async () => {
  const originalFetch = globalThis.fetch;
  const writes = [];
  globalThis.fetch = async (_url, init) => { writes.push(JSON.parse(init.body)); return { ok: true }; };
  try {
    const members = new Set([10123]);
    await assert.rejects(publishAnnouncement('token', '題', '文', 'member', '10124', members), /登録済み/);
    await assert.rejects(publishAnnouncement('token', '題', '文', 'unknown', null, members), /宛先/);
    assert.equal(writes.length, 0);
    await publishAnnouncement('token', '題', '文', 'member', '10123', members);
    const value = JSON.parse(writes[0].writes[0].update.fields.payload.stringValue);
    assert.equal(value.segment, 'member:10123');
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
    const body = JSON.stringify({ title: '件名', body: '本文', audience: 'all' });
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

test('投稿画面で会員番号を選び、登録済みの1人だけを宛先に保存する', async () => {
  const originalFetch = globalThis.fetch;
  const writes = [];
  globalThis.fetch = async (_url, init) => { writes.push(JSON.parse(init.body)); return { ok: true }; };
  const html = generateHtml([], 1, 10123, 0, 0, [], [], '2026/09/24', { today: 0, week: 0, unknown: 1 }, true);
  const { server, url } = await serveDashboard(html, 'test-token', false, new Set([10123]));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('https://cdn.tailwindcss.com/**', route => route.fulfill({ body: '' }));
    await page.route('https://cdn.jsdelivr.net/npm/chart.js', route => route.fulfill({ body: 'window.Chart = class { constructor() {} };' }));
    await page.goto(url);
    await page.locator('#audience').selectOption('member');
    assert.equal(await page.locator('#memberNumber').isVisible(), true);
    await page.locator('#memberNumber').fill('10124');
    await page.getByPlaceholder('タイトル').fill('個別のお便り');
    await page.getByPlaceholder('Markdown本文').fill('本文');
    await page.getByRole('button', { name: '投稿する' }).click();
    await page.getByRole('status').getByText('登録済みの会員番号を指定してください').waitFor();
    assert.equal(writes.length, 0);
    await page.locator('#memberNumber').fill('10123');
    await page.getByRole('button', { name: '投稿する' }).click();
    await page.getByRole('status').getByText(/投稿しました/).waitFor();
    const value = JSON.parse(writes[0].writes[0].update.fields.payload.stringValue);
    assert.equal(value.segment, 'member:10123');
    await page.locator('#audience').selectOption('veteran');
    assert.equal(await page.locator('#memberNumber').isVisible(), false);
    await page.getByPlaceholder('タイトル').fill('古参向け');
    await page.getByPlaceholder('Markdown本文').fill('本文');
    await page.getByRole('button', { name: '投稿する' }).click();
    await page.getByRole('status').getByText(/投稿しました/).waitFor();
    assert.equal(JSON.parse(writes[1].writes[0].update.fields.payload.stringValue).segment, 'veteran');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
    globalThis.fetch = originalFetch;
  }
});
