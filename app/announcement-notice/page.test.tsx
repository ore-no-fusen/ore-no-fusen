import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import React from 'react';

const { emit, close } = vi.hoisted(() => ({ emit: vi.fn(), close: vi.fn() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams({ title: 'テスト投稿', count: '1' }) }));
vi.mock('@tauri-apps/api/event', () => ({ emit }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ close }) }));

import AnnouncementNoticePage from './page';

it('新着を知らせ、ボタンから会話画面を開く', async () => {
  emit.mockResolvedValue(undefined);
  close.mockResolvedValue(undefined);
  render(<AnnouncementNoticePage />);
  expect(screen.getByText('✉️ 開発者からのお便りが届きました')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'テスト投稿' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'お便りを読む・返信する' }));
  await waitFor(() => expect(emit).toHaveBeenCalledWith('fusen:open_settings', { tab: 'conversation' }));
  await waitFor(() => expect(close).toHaveBeenCalled());
});
