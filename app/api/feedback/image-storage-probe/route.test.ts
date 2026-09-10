import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';
import {
  createPrivateImageFile,
  deletePrivateImageFile,
  FeedbackImageStorageError,
  readPrivateImageFile,
} from '../lib/appwrite-storage';

vi.mock('../lib/appwrite-storage', () => ({
  FeedbackImageStorageError: class FeedbackImageStorageError extends Error {
    constructor(message: string, readonly status: number, readonly upstreamType?: string) {
      super(message);
    }
  },
  createPrivateImageFile: vi.fn(), readPrivateImageFile: vi.fn(), deletePrivateImageFile: vi.fn(),
}));

afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

vi.mocked(createPrivateImageFile).mockResolvedValue(undefined);
vi.mocked(deletePrivateImageFile).mockResolvedValue(undefined);

function request(token?: string): Request {
  return new Request('https://preview.example/api/feedback/image-storage-probe', {
    method: 'POST', headers: token ? { 'x-image-storage-probe-token': token } : {},
  });
}

describe('image storage connection probe', () => {
  it.each([
    ['GET', () => GET()],
    ['disabled', () => POST(request('correct'))],
    ['missing token', () => { vi.stubEnv('IMAGE_STORAGE_PROBE_ENABLED', 'true'); vi.stubEnv('IMAGE_STORAGE_PROBE_TOKEN', 'correct'); return POST(request()); }],
    ['wrong token', () => { vi.stubEnv('IMAGE_STORAGE_PROBE_ENABLED', 'true'); vi.stubEnv('IMAGE_STORAGE_PROBE_TOKEN', 'correct'); return POST(request('wrong')); }],
  ])('returns the same 404 without touching storage for %s', async (_label, call) => {
    expect((await call()).status).toBe(404);
    expect(createPrivateImageFile).not.toHaveBeenCalled();
    expect(readPrivateImageFile).not.toHaveBeenCalled();
    expect(deletePrivateImageFile).not.toHaveBeenCalled();
  });

  it('logs only a fixed rejection reason and never the supplied token', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.stubEnv('IMAGE_STORAGE_PROBE_ENABLED', 'true'); vi.stubEnv('IMAGE_STORAGE_PROBE_TOKEN', 'correct');
    await POST(request('not-the-secret'));
    expect(info).toHaveBeenCalledWith('image-storage-probe rejected', {
      reason: 'token_mismatch', tokenLengths: { expected: 7, supplied: 14 },
    });
    expect(info.mock.calls.flat().join(' ')).not.toContain('not-the-secret');
  });

  it('creates, verifies, and deletes fixed test bytes with the correct token', async () => {
    vi.stubEnv('IMAGE_STORAGE_PROBE_ENABLED', 'true'); vi.stubEnv('IMAGE_STORAGE_PROBE_TOKEN', 'correct');
    vi.mocked(readPrivateImageFile).mockResolvedValue(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]));
    const response = await POST(request('correct'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, bytes: 4 });
    expect(createPrivateImageFile).toHaveBeenCalledTimes(1);
    expect(deletePrivateImageFile).toHaveBeenCalledTimes(1);
  });

  it('still deletes the probe file when verification fails', async () => {
    vi.stubEnv('IMAGE_STORAGE_PROBE_ENABLED', 'true'); vi.stubEnv('IMAGE_STORAGE_PROBE_TOKEN', 'correct');
    vi.mocked(readPrivateImageFile).mockResolvedValue(Uint8Array.from([0]));
    expect((await POST(request('correct'))).status).toBe(502);
    expect(deletePrivateImageFile).toHaveBeenCalledTimes(1);
  });

  it('does not report success when deleting the probe file fails', async () => {
    vi.stubEnv('IMAGE_STORAGE_PROBE_ENABLED', 'true'); vi.stubEnv('IMAGE_STORAGE_PROBE_TOKEN', 'correct');
    vi.mocked(readPrivateImageFile).mockResolvedValue(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]));
    vi.mocked(deletePrivateImageFile).mockRejectedValue(new Error('delete failed'));
    await expect(POST(request('correct'))).rejects.toThrow('delete failed');
    expect(deletePrivateImageFile).toHaveBeenCalledTimes(2);
  });

  it('logs only the safe Appwrite error type and failure stage', async () => {
    vi.stubEnv('IMAGE_STORAGE_PROBE_ENABLED', 'true'); vi.stubEnv('IMAGE_STORAGE_PROBE_TOKEN', 'correct');
    const error = new FeedbackImageStorageError('Image storage request failed', 401, 'general_unauthorized_scope');
    vi.mocked(createPrivateImageFile).mockRejectedValue(error);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(POST(request('correct'))).rejects.toBe(error);
    expect(consoleError).toHaveBeenCalledWith('image-storage-probe storage failure', {
      stage: 'create', status: 401, upstreamType: 'general_unauthorized_scope',
    });
  });
});
