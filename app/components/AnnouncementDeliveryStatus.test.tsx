import { cleanup, render, screen, act } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import React from 'react';
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn(), handler: undefined as undefined | ((event: any) => void) }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }));
import AnnouncementDeliveryStatus from './AnnouncementDeliveryStatus';
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('shows the successful check and a later failure without hiding the successful time', async () => {
  mocks.invoke.mockResolvedValue({ lastCheckedAt: '2026-10-13T00:00:00Z', failed: false, intervalMinutes: 180 });
  mocks.listen.mockImplementation(async (_name, handler) => { mocks.handler = handler; return () => {}; });
  render(<AnnouncementDeliveryStatus isEnglish={false} />);
  expect(await screen.findByText(/約3時間ごと/)).toBeTruthy();
  const before = screen.getByText(/最後に確認できた日時/).textContent;
  act(() => mocks.handler?.({ payload: { lastCheckedAt: '2026-10-13T00:00:00Z', failed: true, intervalMinutes: 180 } }));
  expect(screen.getByText(/約15分後/)).toBeTruthy();
  expect(screen.getByText(/最後に確認できた日時/).textContent).toBe(before);
});
it('does not display desktop status when the desktop API is unavailable', async () => {
  mocks.listen.mockRejectedValue(new Error('browser'));
  const view = render(<AnnouncementDeliveryStatus isEnglish={false} />);
  await act(async () => {});
  expect(view.container.textContent).toBe('');
});
