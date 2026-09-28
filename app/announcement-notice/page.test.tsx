import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import React from 'react';

const { emit, destroy, params } = vi.hoisted(() => ({ emit: vi.fn(), destroy: vi.fn(), params: { value: 'title=テスト投稿&count=1' } }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(params.value) }));
vi.mock('@tauri-apps/api/event', () => ({ emit }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ destroy }) }));

import AnnouncementNoticePage from './page';

it('新着を知らせ、ボタンから会話画面を開く', async () => {
  params.value = 'title=テスト投稿&count=1';
  emit.mockResolvedValue(undefined);
  destroy.mockResolvedValue(undefined);
  render(<AnnouncementNoticePage />);
  expect(screen.getByText('✉️ 開発者からのお便りが届きました')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'テスト投稿' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'お便りを読む・返信する' }));
  await waitFor(() => expect(emit).toHaveBeenCalledWith('fusen:open_settings', { tab: 'conversation' }));
  await waitFor(() => expect(destroy).toHaveBeenCalled());
});

it('開発者の返信通知から会話画面を開く', async () => {
  params.value = 'kind=reply&count=2';
  emit.mockResolvedValue(undefined);
  destroy.mockResolvedValue(undefined);
  render(<AnnouncementNoticePage />);
  expect(screen.getByText('✉️ 開発者から返信が届きました')).toBeTruthy();
  expect(screen.getByText('未読の返信が2件あります。')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '返信を読む' }));
  await waitFor(() => expect(emit).toHaveBeenCalledWith('fusen:open_settings', { tab: 'conversation' }));
});
