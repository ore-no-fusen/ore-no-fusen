// app/viewer/lib/auth.ts
import { createId } from '../utils';
// OAuth / PKCE / Web Push 用ユーティリティ

// ---------------------------------------------------------------------------
// PKCE
// ---------------------------------------------------------------------------

/**
 * 責務: PKCE 認証用の verifier と SHA-256 challenge を生成する
 * 入力: なし
 * 出力: Promise<{ verifier: string; challenge: string }>
 * 副作用: なし
 */
export async function generatePKCE() {
  const verifier =
    createId().replace(/-/g, '') +
    createId().replace(/-/g, '');
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier)
  );
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return { verifier, challenge };
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

/**
 * 責務: Google OAuth 認可ページへリダイレクトする
 * 入力: challenge: string（PKCE code_challenge）
 * 出力: なし（window.location.href を書き換えてページ遷移）
 * 副作用: window.location.href を変更する
 */
export function startOAuth(challenge: string) {
  const params = new URLSearchParams({
    client_id: process.env.NEXT_PUBLIC_GDRIVE_CLIENT_ID!,
    redirect_uri: window.location.origin + '/viewer',
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/drive.file',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent',
  });
  window.location.href =
    'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
}

// ---------------------------------------------------------------------------
// Web Push
// ---------------------------------------------------------------------------

/**
 * 責務: VAPID 公開鍵の URL-safe Base64 文字列を Uint8Array に変換する
 * 入力: base64String: string（URL-safe Base64）
 * 出力: Uint8Array
 * 副作用: なし
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}
