import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StoreFavoriteRequest, useStoreFavoriteListener } from './useStoreFavoriteListener';

const mocks = vi.hoisted(() => ({ listen: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }));
type Callback = (event: { payload: StoreFavoriteRequest }) => Promise<void>;
const request = { path: 'D:/vault/test.md', requestId: 'request-1' };

describe('launcher storage event lifetime', () => {
    beforeEach(() => { mocks.listen.mockReset(); });
    it('keeps one subscription across renders and uses the current save handler', async () => {
        let callback!: Callback;
        const unlisten = vi.fn();
        mocks.listen.mockImplementation(async (_event, fn) => { callback = fn; return unlisten; });
        const first = vi.fn(async () => {}), latest = vi.fn(async () => {});
        const hook = renderHook(({ handler }) => useStoreFavoriteListener(handler), { initialProps: { handler: first } });
        await waitFor(() => expect(mocks.listen).toHaveBeenCalledOnce());
        hook.rerender({ handler: latest });
        await act(() => callback({ payload: request }));
        expect(first).not.toHaveBeenCalled();
        expect(latest).toHaveBeenCalledOnce();
        expect(unlisten).not.toHaveBeenCalled();
        expect(mocks.listen).toHaveBeenCalledOnce();
        hook.unmount();
    });
    it('does not reject or save twice when the same request arrives during a slow save', async () => {
        let callback!: Callback, finish!: () => void;
        mocks.listen.mockImplementation(async (_event, fn) => { callback = fn; return vi.fn(); });
        const saving = new Promise<void>(resolve => { finish = resolve; });
        const handle = vi.fn(() => saving);
        const hook = renderHook(() => useStoreFavoriteListener(handle));
        await waitFor(() => expect(mocks.listen).toHaveBeenCalledOnce());
        const running = callback({ payload: request });
        await callback({ payload: request });
        expect(handle).toHaveBeenCalledOnce();
        finish();
        await running;
        await callback({ payload: request });
        expect(handle).toHaveBeenCalledOnce();
        await callback({ payload: { ...request, requestId: 'request-2' } });
        expect(handle).toHaveBeenCalledTimes(2);
        hook.unmount();
    });
    it('ignores callbacks from a disposed listener even before registration finishes', async () => {
        let callback!: Callback, register!: (dispose: () => void) => void;
        mocks.listen.mockImplementation((_event, fn) => { callback = fn; return new Promise(resolve => { register = resolve; }); });
        const handle = vi.fn(async () => {}), unlisten = vi.fn();
        const hook = renderHook(() => useStoreFavoriteListener(handle));
        await waitFor(() => expect(mocks.listen).toHaveBeenCalledOnce());
        hook.unmount();
        await callback({ payload: request });
        register(unlisten);
        await waitFor(() => expect(unlisten).toHaveBeenCalledOnce());
        expect(handle).not.toHaveBeenCalled();
    });
});
