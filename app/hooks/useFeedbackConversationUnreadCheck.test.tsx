import { act, cleanup, render } from '@testing-library/react';
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { markFeedbackConversationActive, saveFeedbackConversationIdentity } from '@/app/utils/feedbackConversation';

const { createWindow } = vi.hoisted(() => ({ createWindow: vi.fn() }));
vi.mock('@tauri-apps/api/webviewWindow', () => ({ WebviewWindow: class {
  static getByLabel = vi.fn(async () => null);
  constructor(label: string, options: unknown) { createWindow(label, options); }
} }));

import { useFeedbackConversationUnreadCheck } from './useFeedbackConversationUnreadCheck';

function BackgroundCheck() {
  useFeedbackConversationUnreadCheck(true);
  return null;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
  createWindow.mockReset();
});

it('会話後の常駐中は10分ごとに確認し、新しい返信だけ通知する', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-28T00:00:00Z'));
  saveFeedbackConversationIdentity({ conversationId: 'conversation-1', secretToken: 'secret-1' });
  markFeedbackConversationActive();
  let replyId = 'reply-1';
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ messages: [
    { messageId: replyId, authorType: 'developer', body: '返事', createdAt: '2026-09-28T00:00:00Z', readByUser: false },
  ] }) }));
  vi.stubGlobal('fetch', fetchMock);
  render(<BackgroundCheck />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(createWindow).toHaveBeenCalledWith('developer-reply-notice-reply-1', expect.objectContaining({ url: expect.stringContaining('kind=reply') }));
  await act(async () => { await vi.advanceTimersByTimeAsync(9 * 60_000); });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  replyId = 'reply-2';
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(createWindow).toHaveBeenCalledWith('developer-reply-notice-reply-2', expect.anything());
});
