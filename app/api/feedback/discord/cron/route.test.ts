import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

describe('Discord ingest cron route', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects requests without CRON_SECRET authorization', async () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');

    const response = await GET(new Request('https://example.test/api/feedback/discord/cron'));

    expect(response.status).toBe(401);
  });

  it('retires the stateless cron without starting a second import', async () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    vi.stubEnv('FEEDBACK_CONVERSATION_ENABLED', 'false');

    const response = await GET(new Request('https://example.test/api/feedback/discord/cron', {
      headers: { Authorization: 'Bearer cron-secret' },
    }));

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({ error: 'Retired: use the durable Discord coordinator' });
  });
});
