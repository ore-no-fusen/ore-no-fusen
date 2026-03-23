/**
 * Hono エントリ Bearer 認証 テストスキャフォールド (RED状態)
 *
 * Wave 2 で app/api/v1/[[...route]]/route.ts を実装して GREEN にする。
 * API-01（Bearer認証）のテスト契約を定義。
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// app/api/v1/[[...route]]/route.ts は Wave 2 で実装される（現時点では存在しない）
// Hono app インスタンスを直接インポートして app.request() でテスト
import { app } from './route';

describe('Hono API v1 - Bearer 認証 (API-01)', () => {
  const TEST_SECRET = 'test-secret-for-vitest';

  beforeAll(() => {
    process.env.API_SECRET = TEST_SECRET;
  });

  afterAll(() => {
    delete process.env.API_SECRET;
  });

  // API-01a: Authorization ヘッダーなし → 401
  it('Authorization ヘッダーなしで POST /api/v1/subscribe が 401 を返す', async () => {
    const res = await app.request('/api/v1/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ endpoint: 'https://example.com', keys: {} }),
    });

    expect(res.status).toBe(401);
  });

  // API-01b: 誤った Bearer トークン → 401
  it('誤った Bearer トークンで POST /api/v1/subscribe が 401 を返す', async () => {
    const res = await app.request('/api/v1/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer wrong-secret',
      },
      body: JSON.stringify({ endpoint: 'https://example.com', keys: {} }),
    });

    expect(res.status).toBe(401);
  });

  // API-01b: 正しい Bearer トークン → 4xx 以外（subscribe 未実装でも 500 は許容）
  it('正しい Bearer トークンで POST /api/v1/subscribe が 401 以外を返す', async () => {
    const res = await app.request('/api/v1/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TEST_SECRET}`,
      },
      body: JSON.stringify({
        endpoint: 'https://example.com/push/endpoint',
        keys: { p256dh: 'key1', auth: 'key2' },
      }),
    });

    // 認証は通過する（200 or 500 など 401 以外）
    expect(res.status).not.toBe(401);
  });
});
