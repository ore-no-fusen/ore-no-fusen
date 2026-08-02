import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SearchOverlay from './SearchOverlay';

const mocks = vi.hoisted(() => {
    const webviewWindowConstructor = vi.fn();
    Object.assign(webviewWindowConstructor, {
        getByLabel: vi.fn().mockResolvedValue(null),
    });
    return {
        invoke: vi.fn(),
        existingWindow: {
            label: 'pool-window-existing',
            show: vi.fn().mockResolvedValue(undefined),
            unminimize: vi.fn().mockResolvedValue(undefined),
            setFocus: vi.fn().mockResolvedValue(undefined),
            emit: vi.fn().mockResolvedValue(undefined),
        },
        webviewWindowConstructor,
    };
});

vi.mock('@tauri-apps/api/core', () => ({
    invoke: mocks.invoke,
}));

vi.mock('@tauri-apps/api/webviewWindow', () => ({
    WebviewWindow: mocks.webviewWindowConstructor,
    getAllWebviewWindows: vi.fn().mockResolvedValue([]),
}));

describe('SearchOverlay', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.invoke.mockResolvedValue([
            { path: 'D:\\notes\\existing.md', line: 3, content: '検索語を含む本文' },
        ]);
    });

    it('プール由来で開いている同じ付箋には新しい窓を作らず、既存窓を前面化する', async () => {
        const resolveOpenWindow = vi.fn().mockResolvedValue(mocks.existingWindow);

        render(
            <SearchOverlay
                onClose={vi.fn()}
                getWindowLabel={() => 'note-derived-label'}
                resolveOpenWindow={resolveOpenWindow}
            />,
        );

        fireEvent.change(screen.getByPlaceholderText('全付箋を検索...'), {
            target: { value: '検索語' },
        });
        fireEvent.click(screen.getByRole('button', { name: '検索' }));

        await waitFor(() => {
            expect(resolveOpenWindow).toHaveBeenCalledWith('D:\\notes\\existing.md');
        });
        expect(mocks.existingWindow.show).toHaveBeenCalledTimes(1);
        expect(mocks.existingWindow.unminimize).toHaveBeenCalledTimes(1);
        expect(mocks.existingWindow.setFocus).toHaveBeenCalledTimes(1);
        expect(mocks.existingWindow.emit).toHaveBeenCalledWith('fusen:scroll_to_line', {
            line: 3,
            query: '検索語',
            path: 'D:\\notes\\existing.md',
        });
        expect(mocks.webviewWindowConstructor).not.toHaveBeenCalled();
    });
});
