/**
 * Hono エントリポイント — iPhone 連携 API v1
 *
 * エンドポイント:
 *   POST /api/v1/subscribe        — Push Subscription を Google Drive に保存
 *   POST /api/v1/notes/push       — Note を保存して Web Push を送信
 *   GET  /api/v1/notes/latest     — 最後に送信した Note を取得
 *   GET  /api/v1/auth             — Google OAuth 認証 URL へリダイレクト（Bearer 除外）
 *   GET  /api/v1/auth/callback    — OAuth callback — refresh_token を表示
 */

export const runtime = 'nodejs';

import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { handle } from 'hono/vercel';
import { google } from 'googleapis';

import { savePushSubscription, saveNote, getLatestNote } from '@/lib/gdrive';
import { sendNoteToIphone } from '@/lib/webpush';

// ---------------------------------------------------------------------------
// Helper: OAuth エラーを HTTP ステータスに変換
// ---------------------------------------------------------------------------

function isOAuthError(message: string): boolean {
  return message === 'OAUTH_REFRESH_TOKEN_EXPIRED' || message === 'OAUTH_NOT_CONFIGURED';
}

// ---------------------------------------------------------------------------
// Hono アプリ
// ---------------------------------------------------------------------------

export const app = new Hono().basePath('/api/v1');

// ---------------------------------------------------------------------------
// /auth — Bearer 認証除外（先にルート登録する）
// ---------------------------------------------------------------------------

app.get('/auth', (c) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}/api/v1/auth/callback`
      : 'http://localhost:3000/api/v1/auth/callback';

  const auth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const authUrl = auth.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive.file'],
    prompt: 'consent',
  });
  return c.redirect(authUrl);
});

app.get('/auth/callback', async (c) => {
  const code = c.req.query('code');
  if (!code) {
    return c.html('<p>Error: no code</p>', 400);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}/api/v1/auth/callback`
      : 'http://localhost:3000/api/v1/auth/callback';

  const auth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const { tokens } = await auth.getToken(code);

  return c.html(
    `<!DOCTYPE html>
<html>
<head><title>OAuth セットアップ完了</title></head>
<body>
<h2>認証成功</h2>
<p>以下の refresh_token を環境変数 <code>GOOGLE_REFRESH_TOKEN</code> に設定してください。</p>
<pre>${tokens.refresh_token ?? '(refresh_token が返されませんでした — prompt=consent で再試行してください)'}</pre>
</body>
</html>`
  );
});

// ---------------------------------------------------------------------------
// Bearer 認証ミドルウェア（/auth 以外）
// ---------------------------------------------------------------------------

app.use('/subscribe', bearerAuth({ verifyToken: (token) => token === process.env.API_SECRET }));
app.use('/notes/*', bearerAuth({ verifyToken: (token) => token === process.env.API_SECRET }));

// ---------------------------------------------------------------------------
// POST /subscribe — Push Subscription を Google Drive に保存
// ---------------------------------------------------------------------------

app.post('/subscribe', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON', code: 'INVALID_BODY' }, 400);
  }

  const { endpoint, keys } = body as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return c.json({ error: 'Missing required fields: endpoint, keys.p256dh, keys.auth', code: 'INVALID_BODY' }, 400);
  }

  try {
    await savePushSubscription({ endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } });
    return c.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (isOAuthError(message)) {
      return c.json({ error: message, code: message }, 503);
    }
    throw err;
  }
});

// ---------------------------------------------------------------------------
// POST /notes/push — Note を保存して Web Push を送信
// ---------------------------------------------------------------------------

app.post('/notes/push', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON', code: 'INVALID_BODY' }, 400);
  }

  const { title, body: noteBody, endpoint, keys } = body as {
    title?: string;
    body?: string;
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };

  if (!title || !noteBody || !endpoint || !keys?.p256dh || !keys?.auth) {
    return c.json(
      { error: 'Missing required fields: title, body, endpoint, keys.p256dh, keys.auth', code: 'INVALID_BODY' },
      400
    );
  }

  try {
    await saveNote({ title, body: noteBody });
    await sendNoteToIphone(
      { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
      { title, body: noteBody }
    );
    return c.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (isOAuthError(message)) {
      return c.json({ error: message, code: message }, 503);
    }
    if (message === 'SUBSCRIPTION_EXPIRED') {
      return c.json({ error: message, code: 'SUBSCRIPTION_EXPIRED' }, 410);
    }
    throw err;
  }
});

// ---------------------------------------------------------------------------
// GET /notes/latest — 最後に送信した Note を取得
// ---------------------------------------------------------------------------

app.get('/notes/latest', async (c) => {
  try {
    const note = await getLatestNote();
    if (!note) {
      return c.json({ error: 'No note found', code: 'NOT_FOUND' }, 404);
    }
    return c.json({ note });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (isOAuthError(message)) {
      return c.json({ error: message, code: message }, 503);
    }
    throw err;
  }
});

// ---------------------------------------------------------------------------
// Next.js ルートハンドラ
// ---------------------------------------------------------------------------

export const GET = handle(app);
export const POST = handle(app);
