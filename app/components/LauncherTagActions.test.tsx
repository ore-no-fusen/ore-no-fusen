import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const api = vi.hoisted(() => ({ catalog: vi.fn(), create: vi.fn(), rename: vi.fn(), remove: vi.fn(), stop: vi.fn(), register: vi.fn(), store: vi.fn() }));
vi.mock('../api/tags', () => ({ getUserTagCatalog: api.catalog, createUserTag: api.create, renameUserTag: api.rename, deleteUserTag: api.remove, stopUserTagChange: api.stop }));
vi.mock('../api/launcher', () => ({ registerTag: api.register, storeTag: api.store }));
import LauncherTagActions from './LauncherTagActions';
afterEach(cleanup);
beforeEach(() => { vi.resetAllMocks(); api.catalog.mockResolvedValue({ tags: ['test'], counts: { test: 3 }, pending: null }); });
function setup(menu: boolean) {
    const changed = vi.fn().mockResolvedValue(undefined);
    const error = vi.fn();
    render(<LauncherTagActions english={false} disabled={false} menu={menu ? { tag: 'test', x: 0, y: 0 } : null}
        closeMenu={vi.fn()} onBusy={vi.fn()} onChanged={changed} onError={error} />);
    return { changed, error };
}
describe('launcher tag management', () => {
    it('creates an unused tag and refreshes without assigning it to any note', async () => {
        api.create.mockResolvedValue(undefined);
        const { changed } = setup(false);
        fireEvent.click(screen.getByRole('button', { name: 'タグを追加' }));
        fireEvent.change(await screen.findByRole('textbox'), { target: { value: '旅行' } });
        fireEvent.click(screen.getByRole('button', { name: '保存' }));
        await waitFor(() => expect(api.create).toHaveBeenCalledWith('旅行'));
        expect(api.register).not.toHaveBeenCalled();
        await waitFor(() => expect(changed).toHaveBeenCalledWith(undefined, '旅行'));
    });
    it('requires explicit delete after displaying affected count', async () => {
        api.remove.mockResolvedValue({ changed: 3, failed: [] });
        const { changed } = setup(true);
        fireEvent.click(screen.getByRole('menuitem', { name: 'タグを削除（すべての付箋から外す）' }));
        expect(await screen.findByText(/3件の付箋から外します/)).toBeTruthy();
        expect(api.remove).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: '削除' }));
        await waitFor(() => expect(changed).toHaveBeenCalledWith('test', undefined));
    });
    it('keeps the current filter on partial rename and offers recovery', async () => {
        api.rename.mockResolvedValue({ changed: 2, failed: ['移動した付箋'] });
        const { changed } = setup(true);
        fireEvent.click(screen.getByRole('menuitem', { name: 'タグ名を変更' }));
        fireEvent.change(await screen.findByRole('textbox'), { target: { value: '調査' } });
        api.catalog.mockResolvedValue({ tags: ['test', '調査'], counts: { test: 1 }, pending: { old: 'test', new: '調査', targets: [], completed: [] } });
        fireEvent.click(screen.getByRole('button', { name: '保存' }));
        await screen.findByRole('alert');
        expect(changed).toHaveBeenCalledWith();
        expect(screen.getByRole('button', { name: '再試行' })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /再試行を終了/ }));
        await waitFor(() => expect(api.stop).toHaveBeenCalledTimes(1));
    });
    it('registers a tag without calling storage or tag deletion', async () => {
        api.register.mockResolvedValue({ stored: 3, failed: [] });
        const { changed } = setup(true);
        fireEvent.click(screen.getByRole('menuitem', { name: 'このタグをまとめて登録' }));
        await waitFor(() => expect(changed).toHaveBeenCalledWith());
        expect(api.register).toHaveBeenCalledWith('test');
        expect(api.store).not.toHaveBeenCalled();
        expect(api.remove).not.toHaveBeenCalled();
    });
    it('stores the right-clicked tag through the same menu and reports partial failures', async () => {
        api.store.mockResolvedValue({ stored: 2, failed: ['保存できない付箋'] });
        const { changed, error } = setup(true);
        expect(screen.getByRole('menuitem', { name: 'このタグをまとめて登録' })).toBeTruthy();
        fireEvent.click(screen.getByRole('menuitem', { name: 'このタグをまとめて格納' }));
        await waitFor(() => expect(changed).toHaveBeenCalledWith());
        expect(api.store).toHaveBeenCalledWith('test');
        expect(api.register).not.toHaveBeenCalled();
        expect(error).toHaveBeenLastCalledWith('保存できない付箋');
    });
});
