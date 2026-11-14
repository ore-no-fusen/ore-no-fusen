import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const qr = vi.hoisted(() => vi.fn());
const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('qrcode', () => ({ default: { toDataURL: qr } }));
import SharedWebQr, { SHARED_WEB_PUBLIC_URL, SHARED_WEB_TEST_URL } from './SharedWebQr';

beforeEach(() => qr.mockReset().mockResolvedValue('data:image/png;base64,test'));
afterEach(() => { cleanup(); vi.unstubAllEnvs(); delete (window as any).__TAURI_INTERNALS__; invoke.mockReset(); });

it.each([['production', SHARED_WEB_PUBLIC_URL], ['development', SHARED_WEB_TEST_URL]])('uses the correct QR destination in %s and keeps PC/sync separate', async (environment, url) => {
  vi.stubEnv('NODE_ENV', environment);
  const onSync = vi.fn(), onOpen = vi.fn();
  render(<SharedWebQr isEnglish={false} webSyncBusy={false} onSync={onSync} onOpen={onOpen}/>);
  await waitFor(() => expect((screen.getByRole('button', { name: 'このPCでWebを開く' }) as HTMLButtonElement).disabled).toBe(false));
  expect(qr).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'このPCでWebを開く' }));
  expect(onOpen).toHaveBeenCalledTimes(1);
  expect(onOpen).toHaveBeenCalledWith(url);
  fireEvent.click(screen.getByRole('button', { name: '↻ 同期' }));
  expect(onSync).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'スマホでWebを開く（QR）' }));
  await screen.findByRole('img');
  expect(qr).toHaveBeenCalledWith(url, expect.objectContaining({ width: 240 }));
  expect(screen.getByText(url)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'スマホでWebを開く（QR）' }));
  expect(screen.queryByRole('img')).toBeNull();
});

it('keeps the URL available after QR failure and disables sync while busy', async () => {
  qr.mockRejectedValueOnce(new Error('QR failed'));
  render(<SharedWebQr isEnglish webSyncBusy onSync={vi.fn()} onOpen={vi.fn()}/>);
  await waitFor(() => expect((screen.getByRole('button', { name: 'Open Web on phone (QR)' }) as HTMLButtonElement).disabled).toBe(false));
  expect((screen.getByRole('button', { name: 'Syncing…' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Open Web on phone (QR)' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Could not generate QR'));
  expect(screen.getByText(SHARED_WEB_PUBLIC_URL)).toBeTruthy();
});

it.each([['development', SHARED_WEB_TEST_URL], ['production', SHARED_WEB_PUBLIC_URL]])('uses package environment %s even in a production build for both PC and QR', async (environment, url) => {
  vi.stubEnv('NODE_ENV', 'production');
  (window as any).__TAURI_INTERNALS__ = {};
  invoke.mockResolvedValue({ environment });
  const onOpen = vi.fn();
  render(<SharedWebQr isEnglish={false} webSyncBusy={false} onSync={vi.fn()} onOpen={onOpen}/>);
  const pc = screen.getByRole('button', { name: 'このPCでWebを開く' });
  await waitFor(() => expect((pc as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(pc);
  expect(onOpen).toHaveBeenCalledWith(url);
  expect(invoke).toHaveBeenCalledWith('member_get');
  fireEvent.click(screen.getByRole('button', { name: 'スマホでWebを開く（QR）' }));
  await screen.findByRole('img');
  expect(qr).toHaveBeenCalledWith(url, expect.anything());
});

it.each(['disabled', 'unavailable'])('never opens production when package environment is %s', async environment => {
  (window as any).__TAURI_INTERNALS__ = {};
  if (environment === 'unavailable') invoke.mockRejectedValue(new Error('unavailable'));
  else invoke.mockResolvedValue({ environment });
  const onOpen = vi.fn();
  render(<SharedWebQr isEnglish={false} webSyncBusy={false} onSync={vi.fn()} onOpen={onOpen}/>);
  await screen.findByRole('alert');
  const pc = screen.getByRole('button', { name: 'このPCでWebを開く' });
  expect((pc as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(pc);
  expect(onOpen).not.toHaveBeenCalled();
  expect(qr).not.toHaveBeenCalled();
});
