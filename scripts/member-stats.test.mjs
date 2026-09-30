import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from '@playwright/test';
import { featureUsageStats, fetchFirestoreAnnouncements, fetchFirestoreMembers, generateHtml, isoWeek, parseOptions, publishAnnouncement, stopAnnouncement, serveDashboard, survivalStats } from './member-stats.mjs';

test('開発環境を明示したときだけ切り替え、不正な指定は拒否する', () => {
  assert.deepEqual(parseOptions([]), { environment: 'production', open: false });
  assert.deepEqual(parseOptions(['--environment', 'development', '--open']), { environment: 'development', open: true });
  assert.throws(() => parseOptions(['--environment', 'staging']), /環境/);
  assert.throws(() => parseOptions(['--environment']), /オプション/);
  assert.throws(() => parseOptions(['--environment', 'production', '--environment', 'development']), /重複/);
});

test('開発環境では開発会員だけを読み取る', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl;
  globalThis.fetch = async url => {
    requestedUrl = String(url);
    return { ok: true, json: async () => ({ documents: [{ fields: { payload: { stringValue: JSON.stringify({ generalNumber: 10123 }) } } }] }) };
  };
  try {
    assert.deepEqual(await fetchFirestoreMembers('token', 'development'), [{ generalNumber: 10123 }]);
    assert.match(requestedUrl, /\/member_environments\/development\/members\?/);
    assert.doesNotMatch(requestedUrl, /\/production\//);
  } finally { globalThis.fetch = originalFetch; }
});

test('送信履歴は開発環境の全ページを読み、期限切れも含めて新しい順に返す', async () => {
  const originalFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async url => {
    urls.push(String(url));
    return { ok: true, json: async () => urls.length === 1 ? {
      documents: [{ name: 'projects/test/documents/announcements/old', fields: { payload: { stringValue: JSON.stringify({ title: '古いお便り', body: '本文', segment: 'all', createdAt: '2026-08-01T00:00:00Z', expiresAt: '2026-08-31T00:00:00Z' }) } } }],
      nextPageToken: 'next page',
    } : {
      documents: [{ name: 'projects/test/documents/announcements/new', fields: { payload: { stringValue: JSON.stringify({ title: '新しいお便り', body: '本文2', segment: 'member:10001', createdAt: '2026-09-27T00:00:00Z', expiresAt: '2026-10-27T00:00:00Z' }) } } }],
    } };
  };
  try {
    const letters = await fetchFirestoreAnnouncements('token', 'development');
    assert.deepEqual(letters.map(letter => letter.id), ['new', 'old']);
    assert.equal(letters[1].body, '本文');
    assert.match(urls[0], /member_environments\/development\/announcements/);
    assert.match(urls[1], /pageToken=next%20page/);
  } finally { globalThis.fetch = originalFetch; }
});

test('配信停止は対象のお便りだけを更新時刻付きで無効にし、本文と宛先を残す', async () => {
  const originalFetch = globalThis.fetch;
  const id = '11111111-1111-4111-8111-111111111111';
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith(`/announcements/${id}`)) return { ok: true, json: async () => ({
      updateTime: '2026-09-27T00:00:00Z',
      fields: { payload: { stringValue: JSON.stringify({ title: '確認用', body: '本文', segment: 'member:10001', active: true }) } },
    }) };
    return { ok: true };
  };
  try {
    await assert.rejects(stopAnnouncement('token', '../members/10001', 'development'), /IDが不正/);
    assert.equal(calls.length, 0);
    await stopAnnouncement('token', id, 'development');
    assert.match(calls[0].url, /member_environments\/development\/announcements\/11111111/);
    const write = JSON.parse(calls[1].init.body).writes[0];
    assert.equal(write.currentDocument.updateTime, '2026-09-27T00:00:00Z');
    assert.deepEqual(JSON.parse(write.update.fields.payload.stringValue), { title: '確認用', body: '本文', segment: 'member:10001', active: false });
  } finally { globalThis.fetch = originalFetch; }
});

test('投稿後の一覧更新でタイトル・宛先・本文を表示し、HTMLは実行しない', async () => {
  const originalFetch = globalThis.fetch;
  const letters = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('documents:commit')) {
      const write = JSON.parse(init.body).writes[0];
      const value = { id: write.update.name.split('/').at(-1), ...JSON.parse(write.update.fields.payload.stringValue) };
      const existing = letters.findIndex(letter => letter.id === value.id);
      if (existing === -1) letters.push(value); else letters[existing] = value;
      return { ok: true };
    }
    const id = String(url).split('/announcements/')[1];
    if (id && !id.includes('?')) return { ok: true, json: async () => ({ updateTime: '2026-09-27T00:00:00Z', fields: { payload: { stringValue: JSON.stringify(letters.find(letter => letter.id === id)) } } }) };
    return { ok: true, json: async () => ({ documents: letters.map(letter => ({ name: `projects/test/documents/announcements/${letter.id}`, fields: { payload: { stringValue: JSON.stringify(letter) } } })) }) };
  };
  const html = generateHtml([], 1, 10001, 0, 0, [], [], '2026/09/27', { today: 0, week: 0, unknown: 1 }, true, 'development');
  const { server, url } = await serveDashboard(html, 'test-token', false, new Set([10001]), 'development');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('https://cdn.tailwindcss.com/**', route => route.fulfill({ body: '' }));
    await page.route('https://cdn.jsdelivr.net/npm/chart.js', route => route.fulfill({ body: 'window.Chart = class { constructor() {} };' }));
    await page.goto(url);
    await page.getByRole('heading', { name: '送信したお便り' }).waitFor();
    assert.equal(await page.getByRole('button', { name: '返信を送る' }).count(), 0);
    assert.equal(await page.locator('#conversationReplyForm').count(), 0);
    await page.locator('#audience').selectOption('member');
    await page.locator('#memberNumber').fill('10001');
    await page.getByPlaceholder('タイトル').fill('確認用');
    await page.getByPlaceholder('Markdown本文').fill('<img src=x onerror=alert(1)> 本文');
    await page.getByRole('button', { name: '投稿する' }).click();
    await page.locator('#announcementHistory summary').filter({ hasText: '確認用' }).waitFor();
    await page.locator('#announcementHistory summary').click();
    assert.match(await page.locator('#announcementHistory').innerText(), /会員番号 10001/);
    assert.match(await page.locator('#announcementHistory').innerText(), /<img src=x onerror=alert\(1\)> 本文/);
    assert.equal(await page.locator('#announcementHistory img').count(), 0);
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: '配信を停止' }).click();
    await page.locator('#announcementHistory').getByText('配信停止中').waitFor({ state: 'attached' });
    assert.equal(letters[0].active, false);
    assert.equal(await page.getByRole('button', { name: '配信を停止' }).count(), 0);
    await page.reload();
    await page.locator('#announcementHistory summary').filter({ hasText: '確認用' }).waitFor();
    await page.locator('#announcementHistory').getByText('配信停止中').waitFor({ state: 'attached' });
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
    globalThis.fetch = originalFetch;
  }
});

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
    assert.match(write.update.name, /\/member_environments\/production\/announcements\//);
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

test('指定した機能とiPhone送受信未使用を宛先として保存できる', async () => {
  const originalFetch = globalThis.fetch;
  const writes = [];
  globalThis.fetch = async (_url, init) => { writes.push(JSON.parse(init.body)); return { ok: true }; };
  try {
    await publishAnnouncement('token', '題', '本文', 'feature_week_unused', null, new Set(), 'development', 'iphone_send');
    await publishAnnouncement('token', '題', '本文', 'iphone_week_unused', null, new Set(), 'development');
    assert.equal(JSON.parse(writes[0].writes[0].update.fields.payload.stringValue).segment, 'feature_week_unused:iphone_send');
    assert.equal(JSON.parse(writes[1].writes[0].update.fields.payload.stringValue).segment, 'iphone_week_unused');
    await assert.rejects(publishAnnouncement('token', '題', '本文', 'feature_week_unused', null, new Set(), 'development', 'unknown'), /対象の機能/);
    assert.equal(writes.length, 2);
  } finally { globalThis.fetch = originalFetch; }
});

test('機能ごとの利用者数は会員単位で数え、割合の分母は全会員にする', () => {
  assert.equal(isoWeek(new Date('2027-01-01T00:00:00Z')), '2026-W53');
  const members = [
    { generalNumber: 10001, appVersion: '5.5.1', lastSeenAt: '2026-09-27', usageWeek: '2026-W39', usageConsent: true, usageFeatures: ['iphone_send', 'note_edited'], usageOpenMinutes: 495 },
    { usageWeek: '2026-W39', usageConsent: true, usageFeatures: ['iphone_send'] },
    { usageWeek: '2026-W38', usageConsent: true, usageFeatures: ['iphone_send'] },
    { usageWeek: '2026-W39', usageConsent: false, usageFeatures: ['iphone_send'] },
  ];
  const stats = featureUsageStats(members, '2026-W39');
  assert.equal(stats.rows.find(row => row.name === 'iphone_send').users, 2);
  assert.equal(stats.rows.find(row => row.name === 'iphone_send').percent, 50);
  assert.equal(stats.rows.find(row => row.name === 'note_edited').users, 1);
  assert.equal(stats.rows.find(row => row.name === 'note_edited').percent, 25);
  assert.equal(stats.reporting, 2);
  assert.deepEqual(stats.memberOpenTimes, [{ number: 10001, minutes: 495 }]);
  assert.deepEqual(stats.memberVersions, [{ number: 10001, version: '5.5.1', lastSeenAt: '2026-09-27' }]);
  const html = generateHtml([], 4, 10003, 0, 0, [], [], '2026/09/27', { today: 0, week: 0, unknown: 4 }, false, 'development', stats);
  assert.match(html, /今週の機能別利用者/);
  assert.match(html, /id="featureReporting">2<\/span> \/ <span id="featureCoverageTotal">4<\/span>人/);
  assert.match(html, /#10001<\/td><td class="py-2 text-right">8時間15分/);
  assert.match(html, /会員別アプリ版/);
  assert.match(html, /#10001<\/td><td class="py-2">5\.5\.1<\/td><td class="py-2">2026-09-27/);
});

test('旧版や不正な版番号は会員ダッシュボードで未報告とする', () => {
  const stats = featureUsageStats([
    { generalNumber: 10002, lastSeenAt: '2026-09-28' },
    { generalNumber: 10001, appVersion: '<script>', lastSeenAt: 'bad' },
  ]);
  assert.deepEqual(stats.memberVersions, [
    { number: 10001, version: null, lastSeenAt: null },
    { number: 10002, version: null, lastSeenAt: '2026-09-28' },
  ]);
  const html = generateHtml([], 2, 10002, 0, 0, [], [], '2026/09/28', { today: 0, week: 0, unknown: 2 }, false, 'development', stats);
  assert.match(html, /#10001<\/td><td class="py-2">未報告（旧版）<\/td><td class="py-2">未確認/);
  assert.doesNotMatch(html, /<script><\/script>/);
});

test('更新時にFirestoreから機能別の人数を読み直す', async () => {
  const originalFetch = globalThis.fetch;
  const currentWeek = featureUsageStats([]).week;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ documents: [
    { fields: { payload: { stringValue: JSON.stringify({ usageWeek: currentWeek, usageConsent: true, usageFeatures: ['iphone_send'] }) } } },
  ] }) });
  const { server, url } = await serveDashboard('<input value="__CSRF_TOKEN__">', 'test-token', false, new Set(), 'development');
  try {
    const html = await (await originalFetch(url)).text();
    const token = html.match(/value="([a-f0-9]{64})"/)[1];
    const response = await originalFetch(`${url}feature-usage`, { headers: { 'X-CSRF-Token': token } });
    assert.equal(response.status, 200);
    const stats = await response.json();
    assert.equal(stats.totalMembers, 1);
    assert.equal(stats.reporting, 1);
    assert.equal(stats.rows.find(row => row.name === 'iphone_send').users, 1);
    assert.equal((await originalFetch(`${url}feature-usage`)).status, 403);
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise(resolve => server.close(resolve));
  }
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
  const html = generateHtml([], 1, 10123, 0, 0, [], [], '2026/09/24', { today: 0, week: 0, unknown: 1 }, true, 'development');
  assert.match(html, /対象: 開発環境の会員・お便り/);
  const { server, url } = await serveDashboard(html, 'test-token', false, new Set([10123]), 'development');
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
    assert.match(writes[0].writes[0].update.name, /\/member_environments\/development\/announcements\//);
    await page.locator('#audience').selectOption('veteran');
    assert.equal(await page.locator('#memberNumber').isVisible(), false);
    await page.getByPlaceholder('タイトル').fill('古参向け');
    await page.getByPlaceholder('Markdown本文').fill('本文');
    await page.getByRole('button', { name: '投稿する' }).click();
    await page.getByRole('status').getByText(/投稿しました/).waitFor();
    assert.equal(JSON.parse(writes[1].writes[0].update.fields.payload.stringValue).segment, 'veteran');
    assert.match(writes[1].writes[0].update.name, /\/member_environments\/development\/announcements\//);
    await page.locator('#audience').selectOption('feature_week_unused');
    assert.equal(await page.locator('#featureName').isVisible(), true);
    await page.locator('#featureName').selectOption('iphone_send');
    await page.getByPlaceholder('タイトル').fill('iPhone未使用者へ');
    await page.getByPlaceholder('Markdown本文').fill('本文');
    await page.getByRole('button', { name: '投稿する' }).click();
    await page.getByRole('status').getByText(/投稿しました/).waitFor();
    assert.equal(JSON.parse(writes[2].writes[0].update.fields.payload.stringValue).segment, 'feature_week_unused:iphone_send');
    assert.equal(await page.locator('#featureName').isVisible(), false);
    await page.locator('#audience').selectOption('iphone_week_unused');
    assert.equal(await page.locator('#featureName').isVisible(), false);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
    globalThis.fetch = originalFetch;
  }
});
