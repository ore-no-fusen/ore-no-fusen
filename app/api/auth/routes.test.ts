import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST as exchangeCode } from './token/route';
import { POST as refreshToken } from './refresh/route';

afterEach(() => {
  vi.restoreAllMocks();
});

function jsonRequest(path: string, body: object): NextRequest {
  return new NextRequest(`https://example.test${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('OAuth API request limits', () => {
  it('rejects oversized token exchange requests before calling Google', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const response = await exchangeCode(jsonRequest('/api/auth/token', {
      code: 'x'.repeat(17 * 1024),
      code_verifier: 'verifier',
      redirect_uri: 'https://example.test/callback',
    }));

    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('adds a timeout signal to token exchange requests', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'access' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await exchangeCode(jsonRequest('/api/auth/token', {
      code: 'code',
      code_verifier: 'verifier',
      redirect_uri: 'https://example.test/callback',
    }));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/token',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('rejects invalid refresh token requests before calling Google', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const response = await refreshToken(jsonRequest('/api/auth/refresh', {
      refresh_token: '',
    }));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
