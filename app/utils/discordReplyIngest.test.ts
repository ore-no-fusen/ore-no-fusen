import { afterEach, expect, it, vi } from 'vitest';
import { DISCORD_AUTO_INGEST_STORAGE_KEY, DISCORD_INGEST_SECRET_STORAGE_KEY, ingestNewDiscordReplies } from './discordReplyIngest';

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

it('作者PCで有効化した場合だけDiscord返信を取り込み、次回は新しい投稿だけを要求する', async () => {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ ingested: 1, lastSeenId: '123456789012345678' }), { status: 200 }));
  expect(await ingestNewDiscordReplies(localStorage, fetchMock)).toBe(0);
  expect(fetchMock).not.toHaveBeenCalled();

  localStorage.setItem(DISCORD_INGEST_SECRET_STORAGE_KEY, 'local-secret');
  localStorage.setItem(DISCORD_AUTO_INGEST_STORAGE_KEY, 'true');
  expect(await ingestNewDiscordReplies(localStorage, fetchMock)).toBe(1);
  expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({});
  expect(await ingestNewDiscordReplies(localStorage, fetchMock)).toBe(1);
  expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toEqual({ afterId: '123456789012345678' });
});

it('取り込みに失敗した場合はカーソルを進めない', async () => {
  localStorage.setItem(DISCORD_INGEST_SECRET_STORAGE_KEY, 'local-secret');
  localStorage.setItem(DISCORD_AUTO_INGEST_STORAGE_KEY, 'true');
  const fetchMock = vi.fn(async () => new Response('', { status: 503 }));

  await expect(ingestNewDiscordReplies(localStorage, fetchMock)).rejects.toThrow('503');
  const nextFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ ingested: 0 }), { status: 200 }));
  await ingestNewDiscordReplies(localStorage, nextFetch);
  expect(JSON.parse(nextFetch.mock.calls[0][1]?.body as string)).toEqual({});
});
