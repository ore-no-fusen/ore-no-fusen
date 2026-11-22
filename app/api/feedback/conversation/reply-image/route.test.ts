// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({ listMessages: vi.fn(), readFeedbackImage: vi.fn() }));
vi.mock('../../lib/store', () => ({ createFeedbackConversationStore: () => mocks }));
vi.mock('../../lib/blob-storage', () => ({ readFeedbackImage: mocks.readFeedbackImage }));

it('only reads an image attached to the recipient’s visible developer reply', async () => {
  const fileId = 'r_' + 'a'.repeat(32);
  mocks.listMessages.mockImplementation(async (id: string, token: string) =>
    id === 'recipient' && token === 'correct' ? [{ authorType: 'developer', replyImageIds: [fileId] }] : []);
  mocks.readFeedbackImage.mockResolvedValue({ file: new Blob(['image'], { type: 'image/png' }) });
  const request = (conversationId: string, secretToken: string) => new Request('http://localhost', {
    method: 'POST', body: JSON.stringify({ fileId, conversationId, secretToken }),
  });
  expect((await POST(request('recipient', 'wrong'))).status).toBe(404);
  expect((await POST(request('other-conversation', 'correct'))).status).toBe(404);
  expect(mocks.readFeedbackImage).not.toHaveBeenCalled();
  const response = await POST(request('recipient', 'correct'));
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(await response.text()).toBe('image');
});
