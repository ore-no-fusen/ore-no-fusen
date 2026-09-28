import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { store, resolve } = vi.hoisted(() => ({
  store: { hasDiscordMessage: vi.fn(), appendMessage: vi.fn() },
  resolve: vi.fn(),
}));
vi.mock('../../lib/store', () => ({ createFeedbackConversationStore: () => store }));
vi.mock('./resolve', () => ({ resolveDiscordConversationIdForMessage: resolve }));

import { runDiscordIngest } from './run';

beforeEach(() => {
  vi.stubEnv('DISCORD_BOT_TOKEN', 'bot-secret');
  vi.stubEnv('DISCORD_FEEDBACK_CHANNEL_ID', 'channel-1');
  vi.stubEnv('ALLOWED_DISCORD_USER_IDS', 'developer-1');
  store.hasDiscordMessage.mockResolvedValue(false);
  store.appendMessage.mockResolvedValue(true);
  resolve.mockResolvedValue({ conversationId: 'conversation-1', referencedMessageId: 'old-message' });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('前回以降のDiscord返信だけを取り込み、次回のカーソルを返す', async () => {
  const newer = { id: '123456789012345679', channel_id: 'channel-1', author: { id: 'developer-1', bot: false }, content: '新しい返事', timestamp: '2026-09-28T06:13:00Z', message_reference: { message_id: 'old-message' } };
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([newer]), { status: 200 })));

  const result = await runDiscordIngest('123456789012345678');

  expect(fetch).toHaveBeenCalledWith(expect.stringContaining('after=123456789012345678'), expect.anything());
  expect(store.appendMessage).toHaveBeenCalledWith(expect.objectContaining({
    conversationId: 'conversation-1', body: '新しい返事', createdAt: '2026-09-28T06:13:00Z',
  }));
  expect(result).toMatchObject({ ingested: 1, lastSeenId: newer.id });
});

it('新しい投稿がなければFirestoreを読まず、カーソルを維持する', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200 })));

  const result = await runDiscordIngest('123456789012345678');

  expect(store.hasDiscordMessage).not.toHaveBeenCalled();
  expect(resolve).not.toHaveBeenCalled();
  expect(result).toMatchObject({ ingested: 0, lastSeenId: '123456789012345678' });
});

it('Discordの取得失敗時はカーソルを進めない', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429 })));

  expect(await runDiscordIngest('123456789012345678')).toEqual({ error: 'Discord API error: 429', status: 502 });
  expect(store.appendMessage).not.toHaveBeenCalled();
});

it('100件を超える新着があっても古いページまで読み、返信を落とさない', async () => {
  const message = (number: number) => ({ id: String(number).padStart(18, '0'), channel_id: 'channel-1', author: { id: 'developer-1', bot: false }, content: `返事${number}`, message_reference: { message_id: 'old-message' } });
  const first = Array.from({ length: 100 }, (_, index) => message(200 - index));
  const second = [message(100), message(99)];
  const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('before=') ? second : first), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);

  const result = await runDiscordIngest(String(99).padStart(18, '0'));

  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(store.appendMessage).toHaveBeenCalledTimes(101);
  expect(result).toMatchObject({ ingested: 101, lastSeenId: String(200).padStart(18, '0') });
});
