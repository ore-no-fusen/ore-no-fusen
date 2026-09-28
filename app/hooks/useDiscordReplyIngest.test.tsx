import { act, cleanup, render } from '@testing-library/react';
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';

const { ingest, ready } = vi.hoisted(() => ({ ingest: vi.fn(), ready: vi.fn() }));
vi.mock('@/app/utils/discordReplyIngest', () => ({
  ingestNewDiscordReplies: ingest,
  isDiscordAutoIngestReady: ready,
}));

import { useDiscordReplyIngest } from './useDiscordReplyIngest';

function MainWindow() {
  useDiscordReplyIngest(true);
  return null;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

it('作者PCで有効にしたときだけ約1分ごとに取り込み、失敗時は5分待つ', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-28T00:00:00Z'));
  ready.mockReturnValue(false);
  ingest.mockResolvedValue(0);
  render(<MainWindow />);
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(ingest).not.toHaveBeenCalled();

  ready.mockReturnValue(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(ingest).toHaveBeenCalledTimes(1);
  ingest.mockRejectedValueOnce(new Error('offline'));
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(ingest).toHaveBeenCalledTimes(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(4 * 60_000); });
  expect(ingest).toHaveBeenCalledTimes(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(ingest).toHaveBeenCalledTimes(3);
});
