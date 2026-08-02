import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

afterEach(() => {
  vi.restoreAllMocks();
});

function request(body: object): NextRequest {
  return new NextRequest('https://example.test/api/siri-send', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Siri send request security', () => {
  it('rejects requests larger than 16KB before calling Google', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const response = await POST(request({
      text: 'x'.repeat(17 * 1024),
      refresh_token: 'refresh',
    }));

    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects text longer than the note limit', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const response = await POST(request({
      text: 'x'.repeat(4001),
      refresh_token: 'refresh',
    }));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('adds a timeout signal to Google requests', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('denied', { status: 401 }),
    );

    const response = await POST(request({
      text: 'note',
      refresh_token: 'refresh',
    }));

    expect(response.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/token',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
