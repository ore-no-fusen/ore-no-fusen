import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FeedbackImageStorageError,
  createPrivateImageFile,
  deletePrivateImageFile,
  readPrivateImageFile,
} from './appwrite-storage';

const ENV = {
  APPWRITE_ENDPOINT: 'https://sgp.cloud.appwrite.io/v1',
  APPWRITE_PROJECT_ID: 'ore-no-fusen-image-dev',
  APPWRITE_BUCKET_ID: 'feedback-images-dev',
  APPWRITE_API_KEY: 'server-secret',
};

function setEnv(): void {
  for (const [key, value] of Object.entries(ENV)) vi.stubEnv(key, value);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('private Appwrite image storage', () => {
  it('fails closed when any server configuration is unavailable', async () => {
    await expect(readPrivateImageFile('image-a')).rejects.toMatchObject({ status: 503 });
  });

  it('sends the API key only in server headers and disables caching', async () => {
    setEnv();
    const fetchMock = vi.fn().mockResolvedValue(new Response(Uint8Array.from([1, 2, 3])));
    vi.stubGlobal('fetch', fetchMock);

    await expect(readPrivateImageFile('image-a')).resolves.toEqual(Uint8Array.from([1, 2, 3]));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://sgp.cloud.appwrite.io/v1/storage/buckets/feedback-images-dev/files/image-a/download');
    expect(url).not.toContain(ENV.APPWRITE_API_KEY);
    expect(init.cache).toBe('no-store');
    expect(init.headers).toMatchObject({
      'X-Appwrite-Project': ENV.APPWRITE_PROJECT_ID,
      'X-Appwrite-Key': ENV.APPWRITE_API_KEY,
    });
  });

  it('creates and deletes only validated server file ids', async () => {
    setEnv();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await createPrivateImageFile('image-a', Uint8Array.from([4, 5]));
    await deletePrivateImageFile('image-a');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(readPrivateImageFile('../other-user')).rejects.toBeInstanceOf(FeedbackImageStorageError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('maps upstream outages to a temporary unavailable response without exposing details', async () => {
    setEnv();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private upstream detail', { status: 500 })));
    await expect(readPrivateImageFile('image-a')).rejects.toMatchObject({
      message: 'Image storage request failed',
      status: 503,
    });
  });
});
