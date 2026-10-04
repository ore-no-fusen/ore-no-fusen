import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWindowManager } from './useWindowManager';

const { listen, innerSize, scaleFactor, geometry } = vi.hoisted(() => ({
    listen: vi.fn(),
    innerSize: vi.fn(),
    scaleFactor: vi.fn(),
    geometry: vi.fn(),
}));

vi.mock('@tauri-apps/api/window', () => ({
    getCurrentWindow: () => ({ listen, innerSize, scaleFactor }),
}));
vi.mock('@/app/api/window', () => ({ getWindowGeometry: geometry }));

beforeEach(() => {
    listen.mockReset();
    innerSize.mockResolvedValue({ width: 400, height: 300 });
    scaleFactor.mockResolvedValue(1);
    geometry.mockReset().mockResolvedValue({ x: 10, y: 20, width: 400, height: 300 });
    listen.mockResolvedValue(() => {});
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe('useWindowManager のウィンドウイベント', () => {
    it('moveは停止後に最終geometryを1回渡し、resizeは直ちに渡す', async () => {
        const onGeometryChange = vi.fn();
        const { unmount } = renderHook(() => useWindowManager({ onGeometryChange }));
        await waitFor(() => expect(listen).toHaveBeenCalledTimes(2));
        const handlers = Object.fromEntries(listen.mock.calls.map(([name, callback]) => [name, callback]));
        expect(Object.keys(handlers).sort()).toEqual(['tauri://move', 'tauri://resize']);

        vi.useFakeTimers();
        act(() => { handlers['tauri://move'](); handlers['tauri://move'](); });
        expect(geometry).not.toHaveBeenCalled();
        await act(async () => { await vi.advanceTimersByTimeAsync(150); });
        expect(onGeometryChange).toHaveBeenCalledTimes(1);
        await act(async () => { await handlers['tauri://resize'](); });
        expect(onGeometryChange).toHaveBeenCalledTimes(2);
        expect(onGeometryChange).toHaveBeenLastCalledWith({ x: 10, y: 20, width: 400, height: 300 });
        unmount();
    });

    it('折りたたみ中の手動resizeでは展開を通知し、geometry保存を要求しない', async () => {
        const onGeometryChange = vi.fn();
        const onAutoExpand = vi.fn();
        const { result } = renderHook(() => useWindowManager({ onGeometryChange, onAutoExpand, getMinimizedHeight: () => 40 }));
        await waitFor(() => expect(listen).toHaveBeenCalledTimes(2));
        const resize = listen.mock.calls.find(([name]) => name === 'tauri://resize')![1];
        act(() => result.current.setIsMinimized(true));
        await act(async () => { await resize(); });
        expect(onAutoExpand).toHaveBeenCalledTimes(1);
        expect(onGeometryChange).not.toHaveBeenCalled();
    });

    it('登録Promiseがアンマウント後に解決しても解除する', async () => {
        const unlisten = vi.fn();
        let resolveListen!: (value: () => void) => void;
        listen.mockImplementationOnce(() => new Promise((resolve) => { resolveListen = resolve; }));
        const { unmount } = renderHook(() => useWindowManager({ onGeometryChange: vi.fn() }));
        await waitFor(() => expect(listen).toHaveBeenCalledTimes(1));
        unmount();
        await act(async () => { resolveListen(unlisten); });
        expect(unlisten).toHaveBeenCalledTimes(1);
    });

    it('移動直後にアンマウントすると150ms待機中のgeometry取得は破棄される', async () => {
        const onGeometryChange = vi.fn();
        const { unmount } = renderHook(() => useWindowManager({ onGeometryChange }));
        await waitFor(() => expect(listen).toHaveBeenCalledTimes(2));
        const move = listen.mock.calls.find(([name]) => name === 'tauri://move')![1];
        vi.useFakeTimers();
        act(() => move());
        unmount();
        await vi.advanceTimersByTimeAsync(150);
        expect(geometry).not.toHaveBeenCalled();
        expect(onGeometryChange).not.toHaveBeenCalled();
    });
});
