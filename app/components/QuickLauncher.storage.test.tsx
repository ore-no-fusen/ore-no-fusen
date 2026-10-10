import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const mocks = vi.hoisted(() => ({
    listeners:new Map<string, () => void>(), open:vi.fn(), store:vi.fn(), tag:vi.fn(), snapshot:vi.fn(), list:vi.fn(), hide:vi.fn(),
}));
vi.mock('../api/launcher', () => ({
    getLauncherState:async () => ({last_tab:'shortcut', selected_tags:{}}),
    quickOpenNotes:mocks.list, storageSnapshot:mocks.snapshot,
    openQuickNote:mocks.open, storeQuickNote:mocks.store, storeTag:mocks.tag,
    setLauncherLastTab:vi.fn().mockResolvedValue(undefined), setLauncherTagFilter:vi.fn().mockResolvedValue(undefined), removeFromShelf:vi.fn(), renameQuickNote:vi.fn(), reorderQuickNote:vi.fn(),
}));
vi.mock('@tauri-apps/api/event', () => ({ listen:async (name:string, callback:() => void) => { mocks.listeners.set(name, callback); return () => mocks.listeners.delete(name); } }));
vi.mock('@tauri-apps/api/window', () => ({getCurrentWindow: () => ({ hide:mocks.hide, isFocused:async () => true, setFocus:vi.fn(), listen:async () => () => {} })}));
vi.mock('@/lib/settings-store', () => ({useSettings: () => ({settings:{language:'ja'}})}));
import QuickLauncher from './QuickLauncher';
const favorite={path:'D:/vault/favorite.md',title:'お気に入り本文',tags:['shortcut','仕事'], launches:0,is_recipe:false};
const plain={path:'D:/vault/plain.md',title:'普通の本文',tags:['仕事'], launches:0,is_recipe:false};
afterEach(cleanup);
beforeEach(() => { mocks.listeners.clear();
    vi.clearAllMocks();
    mocks.list.mockResolvedValue([favorite]);
    mocks.snapshot.mockResolvedValue({paths:[],items:[],tags:['仕事','生活']});
    mocks.store.mockResolvedValue(undefined); mocks.open.mockResolvedValue(undefined);
    mocks.tag.mockResolvedValue({stored:2,failed:[]});
});
describe('launcher storage buttons', () => {
    it('stores the selected favorite without opening its row or hiding the launcher', async () => {
        render(<QuickLauncher/>);
        fireEvent.click(await screen.findByRole('button',{name:'お気に入り本文を格納'}));
        await waitFor(() => expect(mocks.store).toHaveBeenCalledWith(favorite.path));
        expect(mocks.open).not.toHaveBeenCalled();
        expect(mocks.hide).not.toHaveBeenCalled();
    });
    it('takes out a non-favorite from stored notes without adding favorite registration', async () => {
        mocks.snapshot.mockResolvedValue({paths:[plain.path],items:[plain],tags:['仕事']});
        render(<QuickLauncher/>);
        fireEvent.click(await screen.findByRole('button',{name:'格納した付箋 (1)'}));
        fireEvent.click(await screen.findByRole('button',{name:'普通の本文を取り出す'}));
        await waitFor(() => expect(mocks.open).toHaveBeenCalledWith(plain.path));
        expect(mocks.store).not.toHaveBeenCalled();
    });
    it('stores the entire selected tag even when the favorite list is empty', async () => {
        mocks.list.mockResolvedValue([]);
        render(<QuickLauncher/>);
        fireEvent.click(await screen.findByRole('button',{name:'仕事'}));
        fireEvent.click(await screen.findByRole('button',{name:'このタグをまとめて格納'}));
        await waitFor(() => expect(mocks.tag).toHaveBeenCalledWith('仕事'));
    });
    it('reports a save failure and leaves the favorite accessible', async () => {
        mocks.store.mockRejectedValue(new Error('保存失敗'));
        render(<QuickLauncher/>);
        fireEvent.click(await screen.findByRole('button',{name:'お気に入り本文を格納'}));
        expect(await screen.findByText('Error: 保存失敗')).toBeTruthy();
        expect(mocks.open).not.toHaveBeenCalled();
        expect(screen.getByRole('button',{name:'お気に入り本文を格納'})).toBeTruthy();
    });
    it('does not reload for each storage event during its own transaction', async () => {
        render(<QuickLauncher/>);
        const button=await screen.findByRole('button',{name:'お気に入り本文を格納'});
        await waitFor(() => expect(mocks.listeners.has('fusen:storage_changed')).toBe(true));
        const before=mocks.snapshot.mock.calls.length;
        mocks.store.mockImplementation(async () => {
            mocks.listeners.get('fusen:storage_changed')?.();
            mocks.listeners.get('fusen:launcher_shelf_changed')?.();
        });
        fireEvent.click(button);
        await waitFor(() => expect(mocks.store).toHaveBeenCalledOnce());
        await waitFor(() => expect(mocks.snapshot.mock.calls.length).toBe(before+1));
    });
    it('enables taking out immediately after commit while reconciliation is still pending', async () => {
        render(<QuickLauncher/>);
        const button=await screen.findByRole('button',{name:'お気に入り本文を格納'});
        mocks.snapshot.mockReturnValue(new Promise(() => {}));
        fireEvent.click(button);
        await waitFor(() => expect((screen.getByRole('button',{name:'お気に入り本文を取り出す'}) as HTMLButtonElement).disabled).toBe(false));
    });

});
