import { afterEach, describe, expect, it, vi } from 'vitest';
import { discordFetch, DiscordDependencyError } from './http';
describe('Discord dependency failure boundary', () => {
 afterEach(() => vi.unstubAllGlobals());
 it('distinguishes Bot authorization from the caller ingest credential', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, {status:401})));
  await expect(discordFetch('https://discord.com/api/v10/test', {})).rejects.toMatchObject({kind:'authentication'});
 });
 it('retains upstream Retry-After without exposing response contents', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private', {status:429,headers:{'Retry-After':'900'}})));
  try { await discordFetch('https://discord.com/api/v10/test', {}); throw Error('expected failure'); }
  catch (error) { expect(error).toBeInstanceOf(DiscordDependencyError); expect(error).toMatchObject({kind:'rate_limit',retryAfterMs:900000}); expect(String(error)).not.toContain('private'); }
 });
 it('leaves deleted messages available to the existing ignore logic', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, {status:404})));
  expect((await discordFetch('https://discord.com/api/v10/test', {})).status).toBe(404);
 });
});
