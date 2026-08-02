import { describe, expect, it } from 'vitest';
import {
  readLimitedJson,
  RequestValidationError,
  requireString,
} from './requestSecurity';

describe('OAuth request security', () => {
  it('accepts a small JSON object', async () => {
    const request = new Request('https://example.test', {
      method: 'POST',
      body: JSON.stringify({ code: 'valid' }),
    });

    await expect(readLimitedJson(request)).resolves.toEqual({ code: 'valid' });
  });

  it('rejects an oversized request body', async () => {
    const request = new Request('https://example.test', {
      method: 'POST',
      body: JSON.stringify({ code: 'x'.repeat(17 * 1024) }),
    });

    await expect(readLimitedJson(request)).rejects.toMatchObject({
      status: 413,
    } satisfies Partial<RequestValidationError>);
  });

  it('rejects missing and oversized string fields', () => {
    expect(() => requireString({}, 'code', 10)).toThrow('invalid code');
    expect(() => requireString({ code: 'x'.repeat(11) }, 'code', 10)).toThrow('invalid code');
  });
});
