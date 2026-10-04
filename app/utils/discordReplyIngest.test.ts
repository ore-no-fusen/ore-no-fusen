import { afterEach, expect, it, vi } from 'vitest';
import { DISCORD_AUTO_INGEST_STORAGE_KEY, DISCORD_INGEST_SECRET_STORAGE_KEY, DISCORD_INGEST_TARGET_STORAGE_KEY, getDiscordIngestApiBaseUrl, ingestNewDiscordReplies } from './discordReplyIngest';

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('開発版の作者PCから本番へ取り込み、環境ごとにカーソルを分離する', async () => {
  vi.stubEnv('NODE_ENV', 'development');
  localStorage.setItem(DISCORD_INGEST_SECRET_STORAGE_KEY, 'author-secret');
  localStorage.setItem(DISCORD_AUTO_INGEST_STORAGE_KEY, 'true');
  localStorage.setItem(DISCORD_INGEST_TARGET_STORAGE_KEY, 'production');
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ ingested: 1, lastSeenId: '123456789012345678' }), { status: 200 }));
  await ingestNewDiscordReplies(localStorage, fetchMock);
  expect(fetchMock.mock.calls[0][0]).toBe('https://ore-no-fusen.vercel.app/api/feedback/discord/ingest');
  expect(getDiscordIngestApiBaseUrl()).toBe('https://ore-no-fusen.vercel.app/api/feedback');
  localStorage.setItem(DISCORD_INGEST_TARGET_STORAGE_KEY, 'development');
  await ingestNewDiscordReplies(localStorage, fetchMock);
  expect(fetchMock.mock.calls[1][0]).toBe('https://ore-no-fusen-git-develop-uch54s-projects.vercel.app/api/feedback/discord/ingest');
  expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toEqual({});
  localStorage.setItem(DISCORD_INGEST_TARGET_STORAGE_KEY, 'production');
  await ingestNewDiscordReplies(localStorage, fetchMock);
  expect(JSON.parse(fetchMock.mock.calls[2][1]?.body as string)).toEqual({ afterId: '123456789012345678' });
});

it('既存設定は開発版の取り込み先を維持し、secretなしでは本番を選んでも通信しない', async () => {
  vi.stubEnv('NODE_ENV', 'development');
  expect(getDiscordIngestApiBaseUrl()).toBe('https://ore-no-fusen-git-develop-uch54s-projects.vercel.app/api/feedback');
  localStorage.setItem(DISCORD_INGEST_TARGET_STORAGE_KEY, 'production');
  const fetchMock = vi.fn();
  expect(await ingestNewDiscordReplies(localStorage, fetchMock)).toBe(0);
  expect(fetchMock).not.toHaveBeenCalled();
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
