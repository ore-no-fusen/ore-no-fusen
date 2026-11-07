import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const api = vi.hoisted(() => ({ emit: vi.fn().mockResolvedValue(undefined), invoke: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@tauri-apps/api/event', () => ({ emit: api.emit }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: api.invoke }));
import LauncherAppActions from './LauncherAppActions';
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('launcher application actions', () => {
    it.each([
        ['新規メモ', 'fusen:create_note_from_tray', undefined],
        ['全文検索', 'fusen:open_search', undefined],
        ['保管した付箋を戻す', 'fusen:open_archive_restore', undefined],
        ['一時的に全部隠す', 'fusen:set_all_notes_visible', false],
        ['一時非表示を戻す', 'fusen:set_all_notes_visible', true],
    ] as const)('dispatches %s through its existing route', async (label, event, payload) => {
        const busy = vi.fn();
        render(<LauncherAppActions english={false} disabled={false} onBusy={busy} onError={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /操作/ }));
        fireEvent.click(screen.getByRole('menuitem', { name: label as string }));
        await waitFor(() => expect(busy).toHaveBeenLastCalledWith(false));
        if (payload === undefined) expect(api.emit).toHaveBeenCalledWith(event);
        else expect(api.emit).toHaveBeenCalledWith(event, payload);
        expect(api.invoke).not.toHaveBeenCalled();
    });
    it('reports arrangement failure without claiming completion', async () => {
        api.invoke.mockRejectedValueOnce('整列失敗');
        const error = vi.fn();
        render(<LauncherAppActions english={false} disabled={false} onBusy={vi.fn()} onError={error} />);
        fireEvent.click(screen.getByRole('button', { name: /操作/ }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'タグで整列' }));
        await waitFor(() => expect(error).toHaveBeenCalledWith('整列失敗'));
        expect(api.invoke).toHaveBeenCalledWith('fusen_arrange_by_tag');
    });
});
