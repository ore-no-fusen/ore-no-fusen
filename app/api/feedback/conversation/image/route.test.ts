// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createMemoryFeedbackConversationStore } from '../../lib/store';
import { POST, DELETE } from './route';

const mocks = vi.hoisted(() => ({
  store: null as ReturnType<typeof createMemoryFeedbackConversationStore> | null,
  put: vi.fn(),
  del: vi.fn(),
}));

vi.mock('../../lib/store', async (original) => ({
  ...await original<typeof import('../../lib/store')>(),
  createFeedbackConversationStore: () => mocks.store,
}));
vi.mock('@vercel/blob', () => ({ put: mocks.put, del: mocks.del }));

beforeEach(() => {
  mocks.store = createMemoryFeedbackConversationStore();
  vi.resetAllMocks();
  vi.stubEnv('FEEDBACK_BLOB_READ_WRITE_TOKEN', 'test-only');
});
afterEach(() => vi.unstubAllEnvs());

function request(method: string, secretToken = 'owner-secret', fileId?: string, validImage = true) {
  const form = new FormData();
  form.set('conversationId', 'conversation-a');
  form.set('secretToken', secretToken);
  if (fileId) form.set('fileId', fileId);
  else {
    const bytes = validImage ? Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]) : 'not an image';
    form.set('image', new Blob([bytes], { type: 'image/png' }), 'test.png');
  }
  return new Request('http://localhost/api/feedback/conversation/image', { method, body: form });
}

it('stores an image privately for 30 days and allows only its owner to delete it', async () => {
  const response = await POST(request('POST'));
  expect(response.status).toBe(201);
  const { fileId } = await response.json();
  const [path, , options] = mocks.put.mock.calls[0];
  expect(path).toMatch(new RegExp('/' + fileId + '$'));
  expect(options).toMatchObject({ access: 'private', ttlDays: 30, allowOverwrite: false });
  expect((await DELETE(request('DELETE', 'wrong-secret', fileId))).status).toBe(404);
  expect(mocks.del).not.toHaveBeenCalled();
  expect((await DELETE(request('DELETE', 'owner-secret', fileId))).status).toBe(204);
  expect(mocks.del).toHaveBeenCalledWith(path, { token: 'test-only' });
});

it('rejects non-image bytes without writing to Blob', async () => {
  expect((await POST(request('POST', 'owner-secret', undefined, false))).status).toBe(400);
  expect(mocks.put).not.toHaveBeenCalled();
});

it('reports a storage failure without returning an image ID', async () => {
  mocks.put.mockRejectedValueOnce(new Error('storage unavailable'));
  const response = await POST(request('POST'));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'Image storage unavailable' });
});
