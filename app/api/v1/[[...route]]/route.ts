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

import { handle } from 'hono/vercel';
import { app } from './_app';

// ---------------------------------------------------------------------------
// Next.js ルートハンドラ
// ---------------------------------------------------------------------------

export const GET = handle(app);
export const POST = handle(app);
