import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const backend = vi.hoisted(() => ({
    listeners: new Map<string, () => void>(),
    notes: [] as Array<{ path: string; title: string; tags: string[]; launches: number; is_recipe: boolean }>,
    order: [] as string[],
    stored: new Set<string>(),
    failed: [] as string[],
    open: vi.fn(),
    storeTag: vi.fn(),
    snapshot: vi.fn(),
    reorder: vi.fn(),
    remove: vi.fn(),
}));

vi.mock('../api/launcher', () => ({
    getLauncherState: async () => ({ last_tab: 'shortcut', selected_tags: {} }),
    quickOpenNotes: async (tab: string) => tab === 'shortcut'
        ? backend.order.map(path => backend.notes.find(note => note.path === path)!)
        : [],
    storageSnapshot: backend.snapshot,
    openQuickNote: backend.open,
    storeQuickNote: async (path: string) => { backend.stored.add(path); },
    storeTag: backend.storeTag,
    reorderQuickNote: backend.reorder,
    removeFromShelf: backend.remove,
    setLauncherLastTab: vi.fn().mockResolvedValue(undefined),
    setLauncherTagFilter: vi.fn().mockResolvedValue(undefined),
    renameQuickNote: vi.fn(),
    syncQuickLauncherToWeb: vi.fn(),
}));
vi.mock('@tauri-apps/api/event', () => ({
    listen: async (name: string, callback: () => void) => {
        backend.listeners.set(name, callback);
        return () => backend.listeners.delete(name);
    },
}));
vi.mock('@tauri-apps/api/window', () => ({
    getCurrentWindow: () => ({ hide: vi.fn(), isAlwaysOnTop: async () => true }),
}));
vi.mock('@/lib/settings-store', () => ({ useSettings: () => ({ settings: { language: 'ja' } }) }));

import QuickLauncher from './QuickLauncher';

const noteA = { path: 'D:/test/a.md', title: '登録A', tags: ['shortcut', '仕事'], launches: 0, is_recipe: false };
const noteB = { path: 'D:/test/b.md', title: '登録B', tags: ['shortcut', '仕事'], launches: 0, is_recipe: false };
const plain = { path: 'D:/test/plain.md', title: '未登録C', tags: ['仕事'], launches: 0, is_recipe: false };

afterEach(cleanup);
beforeEach(() => {
    vi.clearAllMocks();
    backend.listeners.clear();
    backend.notes = [noteA, noteB, plain].map(note => ({ ...note, tags: [...note.tags] }));
    backend.order = [noteA.path, noteB.path];
    backend.stored = new Set();
    backend.failed = [];
    backend.snapshot.mockImplementation(async () => ({
        paths: [...backend.stored],
        items: backend.notes.filter(note => backend.stored.has(note.path)),
        tags: ['仕事'],
    }));
    backend.storeTag.mockImplementation(async () => {
        for (const note of backend.notes) {
            if (!backend.failed.includes(note.path)) {
                if (!note.tags.includes('shortcut')) note.tags.push('shortcut');
                if (!backend.order.includes(note.path)) backend.order.push(note.path);
                backend.stored.add(note.path);
            }
        }
        return { stored: backend.stored.size, failed: backend.failed.map(() => '保存できませんでした') };
    });
    backend.open.mockImplementation(async (path: string) => {
        backend.stored.delete(path);
        backend.listeners.get('fusen:storage_changed')?.();
    });
    backend.reorder.mockImplementation(async (_tab: string, path: string, direction: string) => {
        const index = backend.order.indexOf(path);
        const other = direction === 'up' ? index - 1 : index + 1;
        if (index >= 0 && other >= 0 && other < backend.order.length) {
            [backend.order[index], backend.order[other]] = [backend.order[other], backend.order[index]];
        }
    });
});

async function bulkStore() {
    fireEvent.click(await screen.findByRole('button', { name: '仕事' }));
    expect(screen.queryByRole('button', { name: 'このタグの付箋をランチャーに登録して画面から隠す' })).toBeNull();
    fireEvent.contextMenu(screen.getByRole('button', { name: '仕事' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'このタグの付箋をランチャーに登録して画面から隠す' }));
    await screen.findByRole('button', { name: '登録Aを画面に表示' });
}

describe('individual and bulk storage keep the launcher usable', () => {
    it('stores the right-clicked tag without changing the selected filter', async () => {
        render(<QuickLauncher />);
        fireEvent.contextMenu(await screen.findByRole('button', { name: '仕事' }));
        expect(screen.getByRole('menuitem', { name: 'このタグの付箋をランチャーに登録' })).toBeTruthy();
        fireEvent.click(screen.getByRole('menuitem', { name: 'このタグの付箋をランチャーに登録して画面から隠す' }));
        await screen.findByRole('button', { name: '登録Aを画面に表示' });
        expect(backend.storeTag).toHaveBeenCalledWith('仕事');
        expect(screen.getByRole('button', { name: 'すべて' }).className).toContain('bg-sky-500');
    });
    it('newly registered notes remain after opening and can be reordered', async () => {
        render(<QuickLauncher />);
        await bulkStore();
        fireEvent.click(screen.getByRole('button', { name: '未登録Cを画面に表示' }));
        await screen.findByRole('button', { name: '未登録Cを画面から隠す' });
        fireEvent.click(screen.getByText('未登録C'));
        await waitFor(() => expect(backend.open).toHaveBeenCalledTimes(2));
        const row = screen.getByText('未登録C').closest('[role="button"]')!;
        fireEvent.click(row.querySelector('button[title="上へ"]')!);
        await waitFor(() => expect(backend.order).toEqual([noteA.path, plain.path, noteB.path]));
        expect(backend.notes.find(note => note.path === plain.path)?.tags).toContain('shortcut');
        expect(backend.remove).not.toHaveBeenCalled();
    });
    it('individual storage keeps the registered list selected', async () => {
        render(<QuickLauncher />);
        fireEvent.click(await screen.findByRole('button', { name: '登録Aを画面から隠す' }));
        await screen.findByRole('button', { name: '登録Aを画面に表示' });
        expect(screen.queryByText('未登録C')).toBeNull();
        expect(screen.getByText('登録B')).toBeTruthy();
    });

    it('bulk storage keeps the same registered list selected', async () => {
        render(<QuickLauncher />);
        await bulkStore();
        expect(screen.getByRole('button', { name: '未登録Cを画面に表示' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'ランチャー登録済み' }).className).toContain('text-sky-300');
    });

    it.each(['row', 'take-out button'])('opening after bulk storage through %s leaves registration visible', async method => {
        render(<QuickLauncher />);
        await bulkStore();
        fireEvent.click(method === 'row'
            ? screen.getByText('登録A')
            : screen.getByRole('button', { name: '登録Aを画面に表示' }));
        await waitFor(() => expect(backend.stored.has(noteA.path)).toBe(false));
        await screen.findByRole('button', { name: '登録Aを画面から隠す' });
        expect(screen.getByText('登録B')).toBeTruthy();
        expect(backend.order).toContain(noteA.path);
        expect(backend.remove).not.toHaveBeenCalled();
    });

    it('registered order still changes visibly after bulk storage', async () => {
        render(<QuickLauncher />);
        await bulkStore();
        const row = screen.getByText('登録B').closest('[role="button"]')!;
        fireEvent.click(row.querySelector('button[title="上へ"]')!);
        await waitFor(() => expect(screen.getAllByText(/^登録[AB]$/).map(el => el.textContent)).toEqual(['登録B', '登録A']));
    });

    it('partial bulk failure keeps the selected list and the failed note accessible', async () => {
        backend.failed = [noteB.path];
        render(<QuickLauncher />);
        await bulkStore();
        await screen.findByText('保存できませんでした');
        expect(screen.getByRole('button', { name: '登録Bを画面から隠す' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '未登録Cを画面に表示' })).toBeTruthy();
    });

    it('bulk storage preserves an explicitly selected stored-notes view too', async () => {
        backend.stored.add(noteA.path);
        render(<QuickLauncher />);
        fireEvent.click(await screen.findByRole('button', { name: 'ランチャーで隠した付箋 (1)' }));
        await bulkStore();
        expect(screen.getByText('未登録C')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'ランチャーで隠した付箋 (3)' }).className).toContain('text-sky-300');
    });
});
