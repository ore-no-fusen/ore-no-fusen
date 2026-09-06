import { afterEach, describe, expect, it, vi } from 'vitest';
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
