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

  it('runs ingest for authorized cron requests', async () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    vi.stubEnv('FEEDBACK_CONVERSATION_ENABLED', 'false');

    const response = await GET(new Request('https://example.test/api/feedback/discord/cron', {
      headers: { Authorization: 'Bearer cron-secret' },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ingested: 0, rejected: [] });
  });
});
