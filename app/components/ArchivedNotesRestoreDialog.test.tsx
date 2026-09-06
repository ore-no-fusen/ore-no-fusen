import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ArchivedNotesRestoreDialog from './ArchivedNotesRestoreDialog';

const invoke = vi.fn();
let archiveChangedHandler: (() => void) | undefined;
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  convertFileSrc: (path: string) => `asset://${path}`,
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: (_event: string, handler: () => void) => {
    archiveChangedHandler = handler;
    return Promise.resolve(() => {});
  },
}));

const notes = Array.from({ length: 6 }, (_, index) => ({
  path: `C:\\notes\\Archive\\note-${index}.md`,
  preview: `本文 ${index}\n続き ${index}\n三行目 ${index}`,
  backgroundColor: index === 5 ? '#ffeeaa' : null,
  previewImagePath: index === 5 ? 'C:\\notes\\Archive\\assets\\photo.png' : null,
  locationKind: index < 3 ? 'archive' : 'tag',
  locationName: index < 3 ? 'Archive' : '仕事',
  archivedAt: `2026-09-0${index + 1}T00:00:00Z`,
}));

describe('ArchivedNotesRestoreDialog', () => {
  afterEach(cleanup);
  beforeEach(() => {
    archiveChangedHandler = undefined;
    invoke.mockReset();
    invoke.mockImplementation((command: string) => command === 'fusen_list_archived_notes' ? Promise.resolve(notes) : Promise.resolve({ body: '全文' }));
  });

  it('shows five recent cards and location counts', async () => {
    render(<ArchivedNotesRestoreDialog language="ja" onClose={() => {}} onRestored={() => {}} />);
    await screen.findByText(/^本文 5/);
    expect(screen.queryByText(/^本文 0/)).toBeNull();
    expect(screen.getByRole('button', { name: /Archive/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /仕事/ })).toBeTruthy();
    expect(screen.getAllByText('3枚')).toHaveLength(2);
    expect(document.querySelector('img')?.getAttribute('src')).toContain('photo.png');
  });

  it('keeps card selection when opening a location', async () => {
    render(<ArchivedNotesRestoreDialog language="ja" onClose={() => {}} onRestored={() => {}} />);
    const preview = await screen.findByText(/^本文 5/);
    fireEvent.click(preview.closest('[role="checkbox"]')!);
    fireEvent.click(screen.getByRole('button', { name: /Archive/ }));
    await waitFor(() => expect((screen.getByText('1枚を取り出す') as HTMLButtonElement).disabled).toBe(false));
  });

  it('shows an error and re-enables restore when the restore command fails', async () => {
    invoke.mockImplementation((command: string) => {
      if (command === 'fusen_list_archived_notes') return Promise.resolve(notes);
      if (command === 'fusen_restore_archived_notes') return Promise.reject(new Error('復元できません'));
      return Promise.resolve({ body: '全文' });
    });
    render(<ArchivedNotesRestoreDialog language="ja" onClose={() => {}} onRestored={() => {}} />);
    const preview = await screen.findByText(/^本文 5/);
    fireEvent.click(preview.closest('[role="checkbox"]')!);
    fireEvent.click(screen.getByText('1枚を取り出す'));
    await screen.findByText(/復元できません/);
    expect((screen.getByText('1枚を取り出す') as HTMLButtonElement).disabled).toBe(false);
  });

  it('refreshes the open list when another note is archived', async () => {
    const added = { ...notes[0], path: 'C:\\notes\\Archive\\new.md', preview: 'たった今しまった付箋', archivedAt: '2026-09-07T00:00:00Z' };
    let listed = notes;
    invoke.mockImplementation((command: string) => command === 'fusen_list_archived_notes' ? Promise.resolve(listed) : Promise.resolve({ body: '全文' }));
    render(<ArchivedNotesRestoreDialog language="ja" onClose={() => {}} onRestored={() => {}} />);
    await screen.findByText(/^本文 5/);
    listed = [...notes, added];
    await act(async () => { archiveChangedHandler?.(); });
    await screen.findByText('たった今しまった付箋');
  });
});
