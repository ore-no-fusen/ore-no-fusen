// Strictly read-only Drive fixture viewer for the sync feasibility test.
// Google OAuth token exchange is the only POST; every Drive API request is GET.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  activeShareGeneration,
  deduplicate,
  evaluate,
  hasExactOperationIds,
  validateFixtureMetadata,
} from './causal-contract.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../../../');
const envPath = path.join(repoRoot, '.env.local');
const fixturePath = path.join(here, 'fixture.local.json');
const settings = {};
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const separator = line.indexOf('=');
  if (separator > 0 && !line.startsWith('#')) {
    settings[line.slice(0, separator).trim()] = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
  }
}
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const ids = { folderId: fixture.folderId, noteId: fixture.noteId, imageId: fixture.imageId };
if (!/^[a-zA-Z0-9-]{1,80}$/.test(fixture.generation)) throw new Error('Invalid saved fixture marker');
if (!ids.folderId || !ids.noteId || !ids.imageId) throw new Error('Saved fixture IDs are incomplete');
if (!settings.NEXT_PUBLIC_GDRIVE_CLIENT_ID || !settings.GOOGLE_CLIENT_SECRET_PWA) {
  throw new Error('Web OAuth settings are unavailable');
}

const origin = 'http://localhost:3002';
const localKey = crypto.randomBytes(24).toString('hex');
let pendingAuth = null;
let accessToken = null;
let cachedImage = null;
let driveRequestCount = 0;
const MAX_DRIVE_GETS = 30;
const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function headers(res, contentType = 'text/html; charset=utf-8') {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
}

function page(title, body) {
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{font:16px/1.7 system-ui,sans-serif;max-width:820px;margin:36px auto;padding:0 18px;background:#f4f5f9;color:#222}main{padding:24px;background:white;border-radius:14px}img{display:block;max-width:100%;height:auto;margin-top:20px}a,button{font:inherit}li{margin:.5em 0}.muted{color:#555}</style><main>${body}</main></html>`;
}

function sendHtml(res, status, title, body) {
  headers(res);
  res.writeHead(status);
  res.end(page(title, body));
}

function sendError(res, status, message) {
  sendHtml(res, status, '読み取り試験を続行できません', `<h1>読み取り試験を続行できません</h1><p>${escapeHtml(message)}</p><p>Drive上のデータは変更していません。</p>`);
}

async function driveGet(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'www.googleapis.com') {
    throw new Error('許可されていないDrive接続先です');
  }
  const isFileMetadataOrContent = /^\/drive\/v3\/files\/[^/]+$/.test(parsed.pathname);
  const isOperationList = parsed.pathname === '/drive/v3/files';
  if (!isFileMetadataOrContent && !isOperationList) {
    throw new Error('Driveの読み取り専用ファイル経路以外は許可されていません');
  }
  if (isOperationList) {
    const expectedQuery = `appProperties has { key='fusenSpike' and value='${fixture.generation}' } and trashed = false`;
    const allowedParameters = new Set(['q', 'fields', 'pageSize', 'pageToken']);
    const pageToken = parsed.searchParams.get('pageToken');
    if (parsed.searchParams.get('q') !== expectedQuery
        || parsed.searchParams.get('fields') !== 'nextPageToken,files(id,name,appProperties,parents)'
        || parsed.searchParams.get('pageSize') !== '3'
        || [...parsed.searchParams.keys()].some(key => !allowedParameters.has(key))
        || (pageToken !== null && (pageToken.length === 0 || pageToken.length > 2048))) {
      throw new Error('許可されていない検証データ一覧要求です');
    }
  }
  if (!accessToken) throw new Error('先にGoogleへ接続してください');
  if (++driveRequestCount > MAX_DRIVE_GETS) throw new Error('Drive取得回数の上限に達しました');
  const response = await fetch(parsed, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Driveの読み取りに失敗しました (HTTP ${response.status})`);
  return response;
}

function driveMetadataUrl(id) {
  const fields = 'id,name,mimeType,trashed,parents,appProperties';
  return `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=${encodeURIComponent(fields)}`;
}

async function loadSavedFixture() {
  // Fetch and validate metadata for all three exact IDs before fetching file contents.
  const [folder, note, image] = await Promise.all([
    driveGet(driveMetadataUrl(ids.folderId)).then(response => response.json()),
    driveGet(driveMetadataUrl(ids.noteId)).then(response => response.json()),
    driveGet(driveMetadataUrl(ids.imageId)).then(response => response.json()),
  ]);
  validateFixtureMetadata({ generation: fixture.generation, folder, note, image, ids });

  const [noteResponse, imageResponse] = await Promise.all([
    driveGet(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(ids.noteId)}?alt=media`),
    driveGet(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(ids.imageId)}?alt=media`),
  ]);
  const [noteData, imageBytes] = await Promise.all([noteResponse.json(), imageResponse.arrayBuffer()]);
  if (noteData?.generation !== fixture.generation || noteData?.imageId !== ids.imageId
      || typeof noteData.title !== 'string' || !Array.isArray(noteData.items)
      || noteData.items.some(item => !item || typeof item.text !== 'string' || typeof item.checked !== 'boolean')) {
    throw new Error('検証メモの内容が保存済み試験データと一致しません');
  }
  const pagination = await readSavedOperations(folder.id);
  return { noteData, imageBytes: Buffer.from(imageBytes), imageType: image.mimeType, pagination };
}

async function readSavedOperations(folderId) {
  const expectedIds = new Set(['A', 'B', 'C', 'R', 'late-E', 'ACK-A', 'REVOKE', 'delayed-old']);
  const query = `appProperties has { key='fusenSpike' and value='${fixture.generation}' } and trashed = false`;
  const files = [];
  const seenPageTokens = new Set();
  let pageToken;
  let pageCount = 0;
  do {
    const params = new URLSearchParams({
      q: query,
      fields: 'nextPageToken,files(id,name,appProperties,parents)',
      pageSize: '3',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const page = await (await driveGet(`https://www.googleapis.com/drive/v3/files?${params}`)).json();
    if (!Array.isArray(page.files)) throw new Error('Driveの検証記録一覧が不正です');
    files.push(...page.files);
    pageCount++;
    if (pageCount > 10) throw new Error('ページ送り試験の安全上限に達しました');
    if (page.nextPageToken) {
      if (typeof page.nextPageToken !== 'string' || seenPageTokens.has(page.nextPageToken)) {
        throw new Error('Driveのページ送り情報が不正です');
      }
      seenPageTokens.add(page.nextPageToken);
      pageToken = page.nextPageToken;
    } else {
      pageToken = undefined;
    }
  } while (pageToken);

  // The generation marker is shared by the spike runs. Verify each candidate's
  // immediate parent metadata before reading its body; accept only the saved
  // fixture folder or a dedicated child folder under it.
  const possible = files.filter(file => expectedIds.has(file.appProperties?.operationId)
    && file.parents?.length === 1);
  const parentIds = [...new Set(possible.map(file => file.parents[0]))]
    .filter(parentId => parentId !== folderId);
  if (parentIds.length > 8) throw new Error('検証記録の親フォルダーが安全上限を超えています');
  const parentMetadata = await Promise.all(parentIds.map(parentId =>
    driveGet(driveMetadataUrl(parentId)).then(response => response.json())));
  const allowedParentIds = new Set([folderId]);
  for (const parent of parentMetadata) {
    if (parent.mimeType === 'application/vnd.google-apps.folder' && parent.trashed !== true
        && parent.parents?.length === 1 && parent.parents[0] === folderId) {
      allowedParentIds.add(parent.id);
    }
  }
  const candidates = possible.filter(file => allowedParentIds.has(file.parents[0]));
  for (const file of candidates) {
    const properties = file.appProperties;
    if (file.parents?.length !== 1 || file.parents[0] !== folderId
        || properties.fusenSpike !== fixture.generation
        || (properties.noteId !== undefined && properties.noteId !== ids.noteId)
        || (properties.shareGeneration !== undefined && properties.shareGeneration !== fixture.generation)) {
      throw new Error(`検証記録 ${properties.operationId} の保存先・付箋・世代が一致しません`);
    }
  }
  const rawRecords = await Promise.all(candidates.map(async file => {
    if (typeof file.id !== 'string' || !file.id) throw new Error('Driveの検証記録IDがありません');
    const response = await driveGet(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`);
    return response.json();
  }));
  const expectedAccount = `synthetic-account:${fixture.generation}`;
  if (rawRecords.some(item => !item || !expectedIds.has(item.operationId)
      || item.accountSubject !== expectedAccount || item.noteId !== ids.noteId
      || item.shareGeneration !== fixture.generation)) {
    const mismatch = rawRecords.find(item => !item || !expectedIds.has(item.operationId)
      || item.accountSubject !== expectedAccount || item.noteId !== ids.noteId
      || item.shareGeneration !== fixture.generation);
    throw new Error(`検証記録 ${mismatch?.operationId || '不明'} の本文にある付箋・アカウント・世代が一致しません`);
  }
  const records = deduplicate(rawRecords);
  const accountSubject = expectedAccount;
  const options = { accountSubject, noteId: ids.noteId, shareGeneration: fixture.generation };
  const noteRecords = records.filter(item => !['ACK-A', 'REVOKE', 'delayed-old'].includes(item.operationId));
  const forward = evaluate(noteRecords, options);
  const reverse = evaluate([...noteRecords].reverse(), options);
  const activeGeneration = activeShareGeneration(rawRecords, fixture.generation, {
    accountSubject, noteId: ids.noteId,
  });
  const afterRevoke = evaluate(
    records.filter(item => item.operationId === 'delayed-old'),
    { ...options, shareGeneration: activeGeneration },
  );
  const hashVersions = rawRecords.reduce((counts, operation) => {
    const version = !operation.payloadHash ? 'no-stored-hash'
      : operation.payloadHashVersion === 2 ? 'v2' : 'legacy-hash';
    counts[version] = (counts[version] || 0) + 1;
    return counts;
  }, {});
  const rejectionKey = result => result.rejected.map(item => `${item.operationId}:${item.reason}`).sort().join('|');
  const checks = {
    multiplePages: pageCount > 1,
    allExpectedIdsFound: hasExactOperationIds(records, expectedIds),
    expectedHeads: forward.heads.join(',') === 'R',
    lateBranchQuarantined: forward.rejected.some(item => item.operationId === 'late-E'
      && item.reason === 'late-child-of-resolved-branch'),
    reverseOrderStable: reverse.heads.join(',') === forward.heads.join(',')
      && rejectionKey(reverse) === rejectionKey(forward),
    generationDerivedFromRevocation: activeGeneration === `${fixture.generation}-next`,
    oldGenerationHeld: afterRevoke.heads.length === 0
      && afterRevoke.rejected.some(item => item.operationId === 'delayed-old'),
    completeRemainsFalse: forward.complete === false,
  };
  return {
    safe: Object.values(checks).every(Boolean),
    checks,
    recordsFound: records.length,
    rawRecordsRead: rawRecords.length,
    duplicatesRemoved: rawRecords.length - records.length,
    hashVersions,
    pages: pageCount,
    activeGeneration,
    heads: forward.heads,
    held: forward.rejected,
  };
}

function readPage(data) {
  const rows = data.noteData.items.map(item => `<li>${item.checked ? '☑' : '□'} ${escapeHtml(item.text)}</li>`).join('');
  cachedImage = data.imageBytes;
  const labels = {
    multiplePages: '複数ページを最後まで取得',
    allExpectedIdsFound: '必要な8種類の記録を確認',
    expectedHeads: '競合解決後の先端が一致',
    lateBranchQuarantined: '解決後に届いた古い枝を隔離',
    reverseOrderStable: '取得順を逆にしても判定が一致',
    generationDerivedFromRevocation: '共有解除後の世代を判定',
    oldGenerationHeld: '解除前の遅延記録を保留',
    completeRemainsFalse: '未解決時に同期完了と誤表示しない',
  };
  const checks = Object.entries(data.pagination.checks)
    .map(([key, value]) => `<li>${value ? '合格' : '未合格'}：${escapeHtml(labels[key])}</li>`).join('');
  const pagination = data.pagination;
  const versions = `v2 ${pagination.hashVersions.v2 || 0}件・旧hash ${pagination.hashVersions['legacy-hash'] || 0}件・hashなし ${pagination.hashVersions['no-stored-hash'] || 0}件`;
  const v2Notice = pagination.safe && pagination.recordsFound === 8
      && pagination.rawRecordsRead >= 8
      && (pagination.hashVersions.v2 || 0) === pagination.rawRecordsRead
    ? '8操作すべてが現行v2ハッシュ形式です。'
    : '旧形式を含むため、この結果だけでは現行v2ハッシュ契約の合格とは判定しません。';
  const paginationResult = `<h2>同期記録のページ送り試験</h2><p><strong>${pagination.safe ? 'ページ送り・収束診断は合格' : '未合格項目あり'}</strong>：${pagination.recordsFound}/8件、${pagination.pages}ページ。Drive取得要求は合計${driveRequestCount}回（Google利用枠の単位数ではありません）。</p><ul>${checks}</ul><p>ハッシュ形式: ${escapeHtml(versions)}。${escapeHtml(v2Notice)}</p><p>先端記録: ${escapeHtml(pagination.heads.join(', ') || 'なし')}。解除後の世代: ${escapeHtml(pagination.activeGeneration)}</p><p class="muted">この試験は保存済み架空記録のページ送りと収束診断です。Web/Windows実装、再送、容量停止などを含む全体計画Bの完了を意味しません。</p>`;
  return page('Drive保存済み付箋の読み取り試験', `<h1>Drive保存済み付箋の読み取り試験</h1><p class="muted">保存済みの架空メモ・画像・同期記録を取得しました。この画面にDriveへの書き込み・更新・削除操作はありません。</p><h2>${escapeHtml(data.noteData.title)}</h2><ul>${rows}</ul><h2>検証画像</h2><img alt="Driveに保存済みの検証画像" src="/image?key=${localKey}">${paginationResult}<p><a href="/?key=${localKey}">戻る</a></p>`);
}

const server = http.createServer(async (req, res) => {
  headers(res);
  try {
    if (req.headers.host !== 'localhost:3002') return sendError(res, 403, 'この試験ページの接続先ではありません');
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return sendError(res, 405, 'この試験ページは読み取り専用です');
    }
    const url = new URL(req.url, origin);

    if (url.pathname === '/viewer' && url.searchParams.has('code')) {
      const state = url.searchParams.get('state');
      if (!pendingAuth || pendingAuth.expiresAt < Date.now() || state !== pendingAuth.state) {
        pendingAuth = null;
        return sendError(res, 400, 'Google認証の確認情報が一致しないか、有効時間を過ぎました');
      }
      const auth = pendingAuth;
      pendingAuth = null;
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: url.searchParams.get('code'),
          client_id: settings.NEXT_PUBLIC_GDRIVE_CLIENT_ID,
          client_secret: settings.GOOGLE_CLIENT_SECRET_PWA,
          redirect_uri: `${origin}/viewer`,
          code_verifier: auth.verifier,
          grant_type: 'authorization_code',
        }),
        signal: AbortSignal.timeout(15000),
      });
      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok || typeof tokenData.access_token !== 'string') {
        return sendError(res, 502, 'Google認証トークンを受け取れませんでした');
      }
      accessToken = tokenData.access_token;
      headers(res);
      res.writeHead(303, { Location: `/read?key=${localKey}` });
      return res.end();
    }

    const suppliedKey = url.searchParams.get('key');
    if ((suppliedKey !== null && suppliedKey !== localKey)
        || (url.pathname !== '/' && suppliedKey !== localKey)) {
      return sendError(res, 404, 'ページが見つかりません');
    }
    if (url.pathname === '/') {
      if (!accessToken) {
        return sendHtml(res, 200, 'Drive保存済み付箋の読み取り試験', `<h1>Drive保存済み付箋の読み取り試験</h1><p>既存の専用検証フォルダーに保存した架空メモと画像を取得します。Driveへの書き込み・更新・削除は行いません。</p><p><a href="/login?key=${localKey}">Googleへ接続して読み取り試験を始める</a></p>`);
      }
      return sendHtml(res, 200, 'Drive保存済み付箋の読み取り試験', `<h1>Drive保存済み付箋の読み取り試験</h1><p>保存済みの架空データだけを読み取ります。Driveへの書き込み・更新・削除は行いません。</p><form action="/read" method="get"><input type="hidden" name="key" value="${localKey}"><button type="submit">保存済みデータを読み取る</button></form>`);
    }
    if (url.pathname === '/login') {
      pendingAuth = {
        state: crypto.randomBytes(32).toString('hex'),
        verifier: crypto.randomBytes(32).toString('base64url'),
        expiresAt: Date.now() + OAUTH_STATE_TTL_MS,
      };
      const parameters = new URLSearchParams({
        client_id: settings.NEXT_PUBLIC_GDRIVE_CLIENT_ID,
        redirect_uri: `${origin}/viewer`,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/drive.file',
        state: pendingAuth.state,
        code_challenge: crypto.createHash('sha256').update(pendingAuth.verifier).digest('base64url'),
        code_challenge_method: 'S256',
        login_hint: 'huchiki7@gmail.com',
      });
      headers(res);
      res.writeHead(303, { Location: `https://accounts.google.com/o/oauth2/v2/auth?${parameters}` });
      return res.end();
    }
    if (url.pathname === '/read') {
      const data = await loadSavedFixture();
      headers(res);
      res.writeHead(200);
      return res.end(readPage(data));
    }
    if (url.pathname === '/image') {
      if (!cachedImage) return sendError(res, 404, '先に保存済みデータを読み取ってください');
      headers(res, 'image/png');
      res.writeHead(200);
      return res.end(cachedImage);
    }
    return sendError(res, 404, 'ページが見つかりません');
  } catch (error) {
    return sendError(res, 502, error instanceof Error ? error.message : '読み取り試験に失敗しました');
  }
});

server.listen(3002, 'localhost', () => {
  console.log(`Read-only Drive fixture test: ${origin}/`);
});

process.on('SIGINT', () => {
  accessToken = null;
  cachedImage = null;
  pendingAuth = null;
  server.close(() => process.exit(0));
});
