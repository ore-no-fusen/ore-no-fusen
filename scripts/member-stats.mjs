import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { exec } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const propertyId = '524376317';
const firestoreRoot = () => `projects/${serviceAccount.project_id}/databases/(default)/documents/member_environments/production`;

// Load service account
const keyPath = path.resolve(rootDir, 'my', 'serviceAccountKey.json');
if (!fs.existsSync(keyPath)) {
  console.error('Error: my/serviceAccountKey.json not found.');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));

function base64Url(input) {
  return Buffer.from(input).toString('base64url');
}

function survivalStats(members, today = new Date()) {
  const currentDay = today.toISOString().slice(0, 10);
  const weekStart = new Date(today);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);
  const firstDay = weekStart.toISOString().slice(0, 10);
  const seen = members.map(m => m.lastSeenAt).filter(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= currentDay);
  return { today: seen.filter(d => d === currentDay).length, week: seen.filter(d => d >= firstDay).length, unknown: members.length - seen.length };
}

async function publishAnnouncement(token, title, body) {
  if (typeof title !== 'string' || !title.trim() || title.length > 120 || typeof body !== 'string' || !body.trim() || body.length > 10000) {
    throw new Error('タイトル（120文字以内）と本文（10000文字以内）を入力してください');
  }
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 30 * 86400000);
  const id = crypto.randomUUID();
  const name = `${firestoreRoot()}/announcements/${id}`;
  const value = { title: title.trim(), body: body.trim(), segment: 'all', active: true, createdAt: createdAt.toISOString(), expiresAt: expiresAt.toISOString() };
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${serviceAccount.project_id}/databases/(default)/documents:commit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes: [{ update: { name, fields: { payload: { stringValue: JSON.stringify(value) } } }, currentDocument: { exists: false } }] }),
  });
  if (!response.ok) throw new Error(`Firestoreへの保存に失敗しました (${response.status})`);
  return id;
}

async function serveDashboard(html, dbToken, openBrowser = true) {
  const csrfToken = crypto.randomBytes(32).toString('hex');
  let currentToken = dbToken;
  let tokenAt = Date.now();
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.method === 'GET' && request.url === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(html.replace('__CSRF_TOKEN__', csrfToken));
      return;
    }
    const origin = `http://127.0.0.1:${server.address().port}`;
    if (request.method !== 'POST' || request.url !== '/announcements' || request.headers.origin !== origin || request.headers['x-csrf-token'] !== csrfToken || request.headers['content-type'] !== 'application/json') {
      response.writeHead(403); response.end(); return;
    }
    try {
      let input = '';
      for await (const chunk of request) {
        input += chunk;
        if (input.length > 25000) throw new Error('入力が長すぎます');
      }
      const { title, body } = JSON.parse(input);
      if (Date.now() - tokenAt > 50 * 60 * 1000) {
        currentToken = await getAccessToken('https://www.googleapis.com/auth/datastore');
        tokenAt = Date.now();
      }
      const id = await publishAnnouncement(currentToken, title, body);
      response.writeHead(201, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ id }));
    } catch (error) {
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: error.message }));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  console.log(`ダッシュボード: ${url} （終了は Ctrl+C）`);
  if (openBrowser) exec(`start "" "${url}"`);
  return { server, url };
}

async function getAccessToken(scope) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: scope,
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  }));
  const unsigned = `${header}.${claim}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(serviceAccount.private_key).toString('base64url');
  const assertion = `${unsigned}.${signature}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`Auth failed: ${response.status} ${await response.text()}`);
  const data = await response.json();
  return data.access_token;
}

async function fetchFirestoreMembers(token) {
  const root = `projects/${serviceAccount.project_id}/databases/(default)/documents`;
  const prefix = `member_environments/production/members`;

  const results = [];
  let pageToken = '';
  do {
    const url = `https://firestore.googleapis.com/v1/${root}/${prefix}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    const data = await res.json();
    for (const doc of data.documents || []) {
      results.push(JSON.parse(doc.fields.payload.stringValue));
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken);

  return results;
}

async function fetchGa4Data(token) {
  // 1. Daily active users & sessions
  const dauRes = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dateRanges: [{ startDate: '2026-09-08', endDate: 'today' }],
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'activeUsers' }, { name: 'sessions' }],
      orderBys: [{ dimension: { dimensionName: 'date' } }]
    })
  });
  const dauData = dauRes.ok ? await dauRes.json() : null;

  // 2. Events breakdown
  const eventRes = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dateRanges: [{ startDate: '2026-09-08', endDate: 'today' }],
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }]
    })
  });
  const eventData = eventRes.ok ? await eventRes.json() : null;

  // 3. Feature usage breakdown
  const featRes = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dateRanges: [{ startDate: '2026-09-08', endDate: 'today' }],
      dimensions: [{ name: 'customEvent:feature_name' }],
      metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }]
    })
  });
  const featData = featRes.ok ? await featRes.json() : null;

  return { dauData, eventData, featData };
}

function generateHtml(combinedStats, totalMembers, latestNumber, todayNew, yesterdayNew, gaEvents, gaFeatures, nowJst, survival, canPublish) {
  const datesJson = JSON.stringify(combinedStats.map(s => s.date.slice(5)));
  const memberCountsJson = JSON.stringify(combinedStats.map(s => s.memberCount));
  const memberCumulativeJson = JSON.stringify(combinedStats.map(s => s.memberCumulative));
  const dauJson = JSON.stringify(combinedStats.map(s => s.activeUsers));
  const sessionsJson = JSON.stringify(combinedStats.map(s => s.sessions));

  // Feature labels and counts
  const featureLabels = JSON.stringify(gaFeatures.map(f => f.name));
  const featureCounts = JSON.stringify(gaFeatures.map(f => f.count));

  // Event labels and counts
  const eventLabels = JSON.stringify(gaEvents.map(e => e.name));
  const eventCounts = JSON.stringify(gaEvents.map(e => e.count));

  const tableRows = [...combinedStats].reverse().map(s => `
    <tr class="border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
      <td class="py-3 px-4 text-slate-300 font-mono">${s.date} (${s.dayOfWeek})</td>
      <td class="py-3 px-4 text-right font-semibold text-indigo-400">+${s.memberCount}</td>
      <td class="py-3 px-4 text-right font-semibold text-emerald-400">${s.memberCumulative}</td>
      <td class="py-3 px-4 text-right font-semibold text-sky-400">${s.activeUsers}人</td>
      <td class="py-3 px-4 text-right font-mono text-slate-400">${s.sessions}回</td>
    </tr>
  `).join('');

  const todayDau = combinedStats[combinedStats.length - 1]?.activeUsers ?? 0;

  return `<!DOCTYPE html>
<html lang="ja" class="dark">
<head>
  <meta charset="UTF-8">
  <title>俺の付箋 - 会員＆利用状況ダッシュボード</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body { background: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif; }
    .glass { background: rgba(22, 27, 44, 0.85); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.08); }
  </style>
</head>
<body class="text-slate-100 min-h-screen p-6 md:p-10">
  <div class="max-w-6xl mx-auto space-y-8">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-400 via-sky-300 to-emerald-400 bg-clip-text text-transparent">
          俺の付箋 会員数＆利用状況ダッシュボード
        </h1>
        <p class="text-sm text-slate-400 mt-1">集計日時: ${nowJst} (JST) | GA4 プロパティ: ${propertyId}</p>
      </div>
      <button onclick="location.reload()" class="self-start sm:self-auto px-4 py-2 text-sm font-medium bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 rounded-xl transition-all shadow-lg flex items-center gap-2">
        <span>🔄</span> 最新状態に更新
      </button>
    </div>

    <!-- Metric Cards -->
    <div class="grid grid-cols-2 lg:grid-cols-5 gap-4">
      <div class="glass p-5 rounded-2xl shadow-xl">
        <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider">総登録会員数</div>
        <div class="text-3xl font-extrabold text-emerald-400 mt-2">${totalMembers} <span class="text-base font-normal text-slate-400">人</span></div>
      </div>
      <div class="glass p-5 rounded-2xl shadow-xl">
        <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider">最新会員番号</div>
        <div class="text-3xl font-extrabold text-amber-300 mt-2">#${latestNumber}</div>
      </div>
      <div class="glass p-5 rounded-2xl shadow-xl">
        <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider">本日の新規登録</div>
        <div class="text-3xl font-extrabold text-indigo-400 mt-2">+${todayNew} <span class="text-base font-normal text-slate-400">人</span></div>
      </div>
      <div class="glass p-5 rounded-2xl shadow-xl">
        <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider">昨日の新規登録</div>
        <div class="text-3xl font-extrabold text-indigo-300 mt-2">+${yesterdayNew} <span class="text-base font-normal text-slate-400">人</span></div>
      </div>
      <div class="glass p-5 rounded-2xl shadow-xl">
        <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider">本日アクティブ</div>
        <div class="text-3xl font-extrabold text-sky-400 mt-2">${todayDau} <span class="text-base font-normal text-slate-400">人</span></div>
      </div>
    </div>

    <!-- Member survival meter: lastSeenAt is a UTC date, not a timestamp. -->
    <div class="glass p-6 rounded-2xl shadow-xl space-y-3">
      <h2 class="text-lg font-bold">会員生存メーター</h2>
      <p class="text-sm text-slate-400">最終アクセス日（UTC）で集計。今日 ${survival.today}人 / 過去7日 ${survival.week}人 / 日付未確認 ${survival.unknown}人</p>
      <div class="h-4 rounded-full bg-slate-700 overflow-hidden"><div class="h-full bg-emerald-400" style="width:${totalMembers ? Math.min(100, survival.week / totalMembers * 100) : 0}%"></div></div>
      <p class="text-sm text-emerald-300">過去7日: ${totalMembers ? Math.round(survival.week / totalMembers * 100) : 0}%（${survival.week} / ${totalMembers}人）</p>
    </div>

    ${canPublish ? `<div class="glass p-6 rounded-2xl shadow-xl space-y-4">
      <h2 class="text-lg font-bold">開発者からのお便り</h2>
      <p class="text-sm text-slate-400">全会員向け・公開後30日間有効。次回の起動時チェックで配信されます。</p>
      <form id="announcementForm" class="space-y-3">
        <input name="title" required maxlength="120" placeholder="タイトル" class="w-full rounded-lg bg-slate-900 border border-slate-600 p-3">
        <textarea name="body" required maxlength="10000" rows="8" placeholder="Markdown本文" class="w-full rounded-lg bg-slate-900 border border-slate-600 p-3"></textarea>
        <button type="submit" class="rounded-lg bg-indigo-600 px-5 py-2 font-semibold">投稿する</button>
        <span id="publishStatus" role="status" class="ml-3 text-sm"></span>
      </form>
    </div>` : ''}

    <!-- Main Charts Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Member Growth Chart -->
      <div class="glass p-6 rounded-2xl shadow-xl space-y-4">
        <h2 class="text-lg font-bold text-slate-200">会員数の推移（新規 ＆ 累計）</h2>
        <div class="h-72 w-full">
          <canvas id="memberChart"></canvas>
        </div>
      </div>

      <!-- DAU & Sessions Chart -->
      <div class="glass p-6 rounded-2xl shadow-xl space-y-4">
        <h2 class="text-lg font-bold text-slate-200">日別アクティブユーザー数（DAU）と起動回数</h2>
        <div class="h-72 w-full">
          <canvas id="dauChart"></canvas>
        </div>
      </div>
    </div>

    <!-- Secondary Charts / Event Stats -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- App Actions -->
      <div class="glass p-6 rounded-2xl shadow-xl space-y-4">
        <h2 class="text-lg font-bold text-slate-200">アプリ内アクション発生数（直近30日）</h2>
        <div class="h-64 w-full">
          <canvas id="eventChart"></canvas>
        </div>
      </div>

      <!-- Feature Usage -->
      <div class="glass p-6 rounded-2xl shadow-xl space-y-4">
        <h2 class="text-lg font-bold text-slate-200">機能利用カウント（feature_used）</h2>
        <div class="h-64 w-full">
          <canvas id="featureChart"></canvas>
        </div>
      </div>
    </div>

    <!-- Detailed Table Section -->
    <div class="glass rounded-2xl shadow-xl overflow-hidden">
      <div class="p-6 border-b border-slate-800 flex justify-between items-center">
        <h2 class="text-lg font-bold text-slate-200">日別データ一覧（会員登録 ＆ 実利用推移）</h2>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-slate-900/60 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
              <th class="py-3 px-4">日付</th>
              <th class="py-3 px-4 text-right">新規登録</th>
              <th class="py-3 px-4 text-right">累計会員</th>
              <th class="py-3 px-4 text-right">実利用者 (DAU)</th>
              <th class="py-3 px-4 text-right">起動/セッション</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <script>
    const announcementForm = document.getElementById('announcementForm');
    if (announcementForm) announcementForm.addEventListener('submit', async event => {
      event.preventDefault();
      const button = announcementForm.querySelector('button');
      const status = document.getElementById('publishStatus');
      button.disabled = true;
      status.textContent = '投稿中…';
      try {
        const fields = new FormData(announcementForm);
        const response = await fetch('/announcements', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': '__CSRF_TOKEN__' }, body: JSON.stringify({ title: fields.get('title'), body: fields.get('body') }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || '投稿に失敗しました');
        status.textContent = '投稿しました。ID: ' + result.id;
        announcementForm.reset();
      } catch (error) { status.textContent = error.message; }
      finally { button.disabled = false; }
    });
    const dates = ${datesJson};

    // 1. Member Growth Chart
    new Chart(document.getElementById('memberChart').getContext('2d'), {
      type: 'bar',
      data: {
        labels: dates,
        datasets: [
          {
            label: '累計会員数',
            type: 'line',
            data: ${memberCumulativeJson},
            borderColor: '#34d399',
            backgroundColor: 'rgba(52, 211, 153, 0.1)',
            fill: true,
            tension: 0.35,
            yAxisID: 'y1',
            pointRadius: 3,
          },
          {
            label: '新規登録数',
            data: ${memberCountsJson},
            backgroundColor: '#818cf8',
            borderRadius: 5,
            yAxisID: 'y',
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
          y: { type: 'linear', position: 'left', grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#818cf8' }, title: { display: true, text: '新規', color: '#818cf8' } },
          y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, ticks: { color: '#34d399' }, title: { display: true, text: '累計', color: '#34d399' } }
        },
        plugins: { legend: { labels: { color: '#e2e8f0' } } }
      }
    });

    // 2. DAU & Sessions Chart
    new Chart(document.getElementById('dauChart').getContext('2d'), {
      type: 'line',
      data: {
        labels: dates,
        datasets: [
          {
            label: 'アクティブ利用者数',
            data: ${dauJson},
            borderColor: '#38bdf8',
            backgroundColor: 'rgba(56, 189, 248, 0.15)',
            fill: true,
            tension: 0.35,
            pointRadius: 4,
            yAxisID: 'y',
          },
          {
            label: '起動/セッション数',
            data: ${sessionsJson},
            borderColor: '#a78bfa',
            borderDash: [4, 4],
            fill: false,
            tension: 0.35,
            pointRadius: 3,
            yAxisID: 'y1',
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
          y: { type: 'linear', position: 'left', grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#38bdf8' }, title: { display: true, text: '利用者数 (人)', color: '#38bdf8' } },
          y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, ticks: { color: '#a78bfa' }, title: { display: true, text: 'セッション数 (回)', color: '#a78bfa' } }
        },
        plugins: { legend: { labels: { color: '#e2e8f0' } } }
      }
    });

    // 3. Events Chart
    new Chart(document.getElementById('eventChart').getContext('2d'), {
      type: 'bar',
      data: {
        labels: ${eventLabels},
        datasets: [{
          label: '発生回数',
          data: ${eventCounts},
          backgroundColor: '#f59e0b',
          borderRadius: 6
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        indexAxis: 'y',
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
          y: { grid: { display: false }, ticks: { color: '#cbd5e1' } }
        },
        plugins: { legend: { display: false } }
      }
    });

    // 4. Features Chart
    new Chart(document.getElementById('featureChart').getContext('2d'), {
      type: 'bar',
      data: {
        labels: ${featureLabels},
        datasets: [{
          label: '利用回数',
          data: ${featureCounts},
          backgroundColor: '#ec4899',
          borderRadius: 6
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        indexAxis: 'y',
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
          y: { grid: { display: false }, ticks: { color: '#cbd5e1' } }
        },
        plugins: { legend: { display: false } }
      }
    });
  </script>
</body>
</html>`;
}

async function main() {
  const [dbToken, gaToken] = await Promise.all([
    getAccessToken('https://www.googleapis.com/auth/datastore'),
    getAccessToken('https://www.googleapis.com/auth/analytics.readonly')
  ]);

  const [members, gaData] = await Promise.all([
    fetchFirestoreMembers(dbToken),
    fetchGa4Data(gaToken).catch(err => {
      console.warn('GA4 fetch error:', err.message);
      return { dauData: null, eventData: null, featData: null };
    })
  ]);

  members.sort((a, b) => a.generalNumber - b.generalNumber);

  const daysOfWeek = ['日', '月', '火', '水', '木', '金', '土'];
  const dailyMembers = {};
  for (const m of members) {
    const d = new Date(m.registeredAt);
    const jstDate = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d).replace(/\//g, '-');
    if (!dailyMembers[jstDate]) {
      const jstDateObj = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
      dailyMembers[jstDate] = { count: 0, dayOfWeek: daysOfWeek[jstDateObj.getDay()] };
    }
    dailyMembers[jstDate].count++;
  }

  // Parse GA4 DAU
  const gaDauMap = {};
  if (gaData.dauData?.rows) {
    for (const r of gaData.dauData.rows) {
      const rawDate = r.dimensionValues[0].value; // YYYYMMDD
      const formattedDate = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
      gaDauMap[formattedDate] = {
        activeUsers: parseInt(r.metricValues[0].value, 10),
        sessions: parseInt(r.metricValues[1].value, 10)
      };
    }
  }

  // Merge dates
  const allDatesSet = new Set([...Object.keys(dailyMembers), ...Object.keys(gaDauMap)]);
  const sortedDates = Array.from(allDatesSet).sort();

  let cumulative = 0;
  const combinedStats = sortedDates.map(date => {
    const mCount = dailyMembers[date]?.count ?? 0;
    cumulative += mCount;
    const dateObj = new Date(`${date}T00:00:00+09:00`);
    const dayOfWeek = daysOfWeek[dateObj.getDay()];
    const ga = gaDauMap[date] ?? { activeUsers: 0, sessions: 0 };
    return {
      date,
      memberCount: mCount,
      memberCumulative: cumulative,
      dayOfWeek,
      activeUsers: ga.activeUsers,
      sessions: ga.sessions
    };
  });

  const totalMembers = members.length;
  const survival = survivalStats(members);
  const latestNumber = members.length > 0 ? members[members.length - 1].generalNumber : 10000;

  const now = new Date();
  const todayStr = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now).replace(/\//g, '-');
  const yesterday = new Date(now.getTime() - 86400000);
  const yesterdayStr = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(yesterday).replace(/\//g, '-');

  const todayNew = dailyMembers[todayStr]?.count ?? 0;
  const yesterdayNew = dailyMembers[yesterdayStr]?.count ?? 0;

  const nowJst = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).format(now);

  // Friendly event names
  const friendlyEventNames = {
    'app_started': 'アプリ起動',
    'usage_snapshot': '付箋枚数スナップショット',
    'note_created': '付箋の新規作成',
    'first_note_saved': '最初の保存完了',
    'feature_used': '機能操作 (feature_used)',
    'weekly_feature_usage': '週次機能利用レポート',
    'weekly_usage_complete': '週次利用集計完了',
    'store_click': 'ストア案内クリック',
    'donation_cta_click': '寄付CTAクリック',
    'note_create_failed': '作成エラー',
  };

  const gaEvents = (gaData.eventData?.rows || [])
    .filter(r => !['page_view', 'session_start', 'first_visit', 'user_engagement', 'scroll', 'click'].includes(r.dimensionValues[0].value))
    .slice(0, 8)
    .map(r => ({
      name: friendlyEventNames[r.dimensionValues[0].value] || r.dimensionValues[0].value,
      count: parseInt(r.metricValues[0].value, 10),
      users: parseInt(r.metricValues[1].value, 10)
    }));

  const friendlyFeatureNames = {
    'tag_add': 'タグ追加',
    'alarm_set': 'アラーム設定',
    'iphone_send': 'iPhone送信',
    'iphone_receive': 'iPhone受信',
    'search_open': '検索画面オープン',
    'note_duplicate': '付箋の複製',
    'note_archive': '付箋の整理/アーカイブ',
    'note_edited': '本文編集',
    'outline_toggle': '見出し折りたたみ',
    'image_attach': '画像添付',
  };

  const gaFeatures = (gaData.featData?.rows || [])
    .filter(r => r.dimensionValues[0].value && r.dimensionValues[0].value !== '(not set)')
    .map(r => ({
      name: friendlyFeatureNames[r.dimensionValues[0].value] || r.dimensionValues[0].value,
      count: parseInt(r.metricValues[0].value, 10),
      users: parseInt(r.metricValues[1].value, 10)
    }));

  // Write HTML
  const outDir = path.resolve(rootDir, 'my');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const htmlPath = path.resolve(outDir, 'member_stats.html');
  fs.writeFileSync(htmlPath, generateHtml(combinedStats, totalMembers, latestNumber, todayNew, yesterdayNew, gaEvents, gaFeatures, nowJst, survival, false), 'utf8');

  const isOpenMode = process.argv.includes('--open');
  if (isOpenMode) {
    console.log(`Updated: ${htmlPath}`);
    await serveDashboard(generateHtml(combinedStats, totalMembers, latestNumber, todayNew, yesterdayNew, gaEvents, gaFeatures, nowJst, survival, true), dbToken);
  } else {
    console.log(`総会員数: ${totalMembers}人 (最新番号: #${latestNumber})`);
    console.log(`本日新規: +${todayNew}人 / 昨日新規: +${yesterdayNew}人`);
    console.log(`更新日時: ${nowJst} JST`);
    console.table(combinedStats.slice(-7));
    console.log(`詳細HTML: ${htmlPath}`);
  }
}

export { survivalStats, publishAnnouncement, serveDashboard };

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch(err => {
    console.error('Execution error:', err);
    process.exit(1);
  });
}
