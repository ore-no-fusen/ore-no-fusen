import { describe, expect, it } from 'vitest';
import { POST as submitFeedback } from './route';
import { POST as submitMessage } from './conversation/messages/route';
import { POST as pollConversation } from './conversation/poll/route';
import { POST as acknowledgeMessages } from './conversation/ack/route';

function oversizedRequest(path: string, size = 33 * 1024): Request {
  return new Request(`https://example.test${path}`, {
    method: 'POST',
    body: JSON.stringify({ content: 'x'.repeat(size) }),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('feedback API request size limits', () => {
  it('rejects oversized feedback submissions', async () => {
    expect((await submitFeedback(oversizedRequest('/api/feedback'))).status).toBe(413);
  });

  it('rejects oversized conversation messages', async () => {
    expect((await submitMessage(oversizedRequest('/api/feedback/conversation/messages'))).status).toBe(413);
  });

  it('uses a smaller limit for polling', async () => {
    expect((await pollConversation(
      oversizedRequest('/api/feedback/conversation/poll', 5 * 1024),
    )).status).toBe(413);
  });

  it('uses a bounded limit for acknowledgements', async () => {
    expect((await acknowledgeMessages(
      oversizedRequest('/api/feedback/conversation/ack', 17 * 1024),
    )).status).toBe(413);
  });
});
