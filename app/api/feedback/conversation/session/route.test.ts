import { expect, it } from 'vitest';
import { OPTIONS, POST } from './route';

it('reports that legacy image upload is unavailable and retains CORS for old clients', async () => {
  const response = await POST(new Request('http://localhost/session', { method: 'POST' }));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'Image upload unavailable' });
  expect(response.headers.get('access-control-allow-origin')).toBe('*');
  expect((await OPTIONS()).status).toBe(204);
});
