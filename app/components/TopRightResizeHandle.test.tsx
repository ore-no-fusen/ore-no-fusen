import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import TopRightResizeHandle from './TopRightResizeHandle';
const mock = vi.hoisted(() => ({ setSize: vi.fn(), setPosition: vi.fn() }));
vi.mock('@tauri-apps/api/window', () => ({
    getCurrentWindow: () => ({
        innerSize: async () => ({ width: 600, height: 450 }), scaleFactor: async () => 1.5,
        outerSize: async () => ({ width: 510, height: 390 }), outerPosition: async () => ({ x: 100, y: 900 }),
        setSize: mock.setSize, setPosition: mock.setPosition,
    }),
    currentMonitor: async () => ({ workArea: { position: { x: 0, y: 0 }, size: { width: 1920, height: 1080 } } }),
}));
beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('PointerEvent', MouseEvent);
    HTMLElement.prototype.setPointerCapture = vi.fn();
    mock.setSize.mockResolvedValue(undefined);
    mock.setPosition.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('shrinks from the visible top-right and brings the hidden bottom back into the work area', async () => {
    const saved = vi.fn().mockResolvedValue(undefined);
    render(<TopRightResizeHandle title="resize" onFinished={saved} />);
    const handle = screen.getByTestId('sticky-top-resize-handle');
    fireEvent.pointerDown(handle, { button: 0, screenX: 400, screenY: 20 });
    fireEvent.pointerMove(handle, { screenX: 340, screenY: 60 });
    fireEvent.pointerUp(handle);
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(mock.setSize).toHaveBeenLastCalledWith(expect.objectContaining({ width: 510, height: 390 }));
    expect(mock.setPosition).toHaveBeenCalledWith(expect.objectContaining({ x: 100, y: 690 }));
});
it('keeps a tiny note operable and ignores the secondary mouse button', async () => {
    render(<TopRightResizeHandle title="resize" onFinished={vi.fn().mockResolvedValue(undefined)} />);
    const handle = screen.getByTestId('sticky-top-resize-handle');
    fireEvent.pointerDown(handle, { button: 2, screenX: 400, screenY: 20 });
    fireEvent.pointerMove(handle, { screenX: 0, screenY: 900 });
    expect(mock.setSize).not.toHaveBeenCalled();
    fireEvent.pointerDown(handle, { button: 0, screenX: 400, screenY: 20 });
    fireEvent.pointerMove(handle, { screenX: 0, screenY: 900 });
    fireEvent.pointerUp(handle);
    await waitFor(() => expect(mock.setSize).toHaveBeenCalled());
    expect(mock.setSize).toHaveBeenLastCalledWith(expect.objectContaining({ width: 240, height: 150 }));
});
