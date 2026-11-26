import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';
import { requireReportToken } from '../lib/report-auth';

const request = (token?: string) => new Request('https://example.test/api/members/lookup', {
  headers: token ? { Authorization: `Bearer ${token}` } : {},
});

describe('member lookup report authentication', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('accepts only the configured full bearer token', () => {
    vi.stubEnv('MEMBER_REPORT_TOKEN', 'correct-report-token-with-at-least-32-chars');
    expect(() => requireReportToken(request('correct-report-token-with-at-least-32-chars'))).not.toThrow();
    expect(() => requireReportToken(request('wrong-report-token-with-at-least-32-chars'))).toThrowError(
      expect.objectContaining({ status: 403 }),
    );
    expect(() => requireReportToken(request())).toThrowError(expect.objectContaining({ status: 403 }));
  });

  it('stays unavailable when the server secret is not configured safely', () => {
    vi.stubEnv('MEMBER_REPORT_TOKEN', 'short');
    expect(() => requireReportToken(request('short'))).toThrow('Member report access is not configured');
  });
});

describe('member API version', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('publishes the running version without credentials or caching', async () => {
    const response = await GET(new Request('https://example.test/api/members/version'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ version: '1.0.0' });
    expect(response.headers.get('X-Member-API-Version')).toBe('1.0.0');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('preserves legacy error responses while identifying their API version', async () => {
    vi.stubEnv('MEMBER_ENVIRONMENT', 'development');
    const url = 'https://example.test/api/members/heartbeat';
    const get = await GET(new Request(url));
    expect(get.status).toBe(405);
    expect(await get.json()).toEqual({ error: 'Method not allowed' });
    expect(get.headers.get('X-Member-API-Version')).toBe('1.0.0');
    const post = await POST(new Request(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ environment: 'other' }),
    }));
    expect(post.status).toBe(400);
    expect(await post.json()).toEqual({ error: 'Wrong environment' });
    expect(post.headers.get('X-Member-API-Version')).toBe('1.0.0');
  });
});
