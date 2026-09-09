import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';
import { createPrivateImageFile, deletePrivateImageFile, readPrivateImageFile } from '../lib/appwrite-storage';

vi.mock('../lib/appwrite-storage', () => ({
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
});
