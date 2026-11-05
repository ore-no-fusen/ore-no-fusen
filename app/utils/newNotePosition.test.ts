import { beforeEach, describe, expect, it, vi } from 'vitest';
import { centeredNoteBounds, currentScreenNoteBounds, placeNewNotePhysically } from './newNotePosition';

const api = vi.hoisted(() => ({ cursorPosition: vi.fn(), monitorFromPoint: vi.fn(), primaryMonitor: vi.fn() }));
vi.mock('@tauri-apps/api/window', () => api);

describe('new note screen center', () => {
    it('centers within the usable area above the taskbar', () => {
        expect(centeredNoteBounds({ position: { x: 0, y: 0 }, size: { width: 1920, height: 1040 } }, 1))
            .toEqual({ x: 760, y: 370, width: 400, height: 300 });
    });
    it('uses the selected monitor coordinates and DPI, including negative origins', () => {
        expect(centeredNoteBounds({ position: { x: -2560, y: -300 }, size: { width: 2560, height: 1400 } }, 1.5))
            .toEqual({ x: -1580, y: 175, width: 600, height: 450 });
    });
    it('keeps all edges inside a smaller work area', () => {
        expect(centeredNoteBounds({ position: { x: 100, y: 80 }, size: { width: 320, height: 240 } }, 2))
            .toEqual({ x: 100, y: 80, width: 320, height: 240 });
    });
});

describe('new note display selection', () => {
    beforeEach(() => vi.resetAllMocks());
    const screen = { workArea: { position: { x: 1920, y: 0 }, size: { width: 1920, height: 1040 } }, scaleFactor: 1 };
    it('chooses the screen containing the cursor, independent of the hidden main/pool window', async () => {
        api.cursorPosition.mockResolvedValue({ x: 2000, y: 400 });
        api.monitorFromPoint.mockResolvedValue(screen);
        expect(await currentScreenNoteBounds()).toMatchObject({ x: 2680, y: 370 });
        expect(api.monitorFromPoint).toHaveBeenCalledWith(2000, 400);
        expect(api.primaryMonitor).not.toHaveBeenCalled();
    });
    it('falls back to the primary screen if cursor position lookup fails', async () => {
        api.cursorPosition.mockRejectedValue(new Error('unavailable'));
        api.primaryMonitor.mockResolvedValue(screen);
        expect(await currentScreenNoteBounds()).toMatchObject({ x: 2680, y: 370 });
    });
    it('fails rather than showing the hidden pool at its old offscreen position', async () => {
        api.cursorPosition.mockResolvedValue({ x: 0, y: 0 });
        api.monitorFromPoint.mockResolvedValue(null);
        api.primaryMonitor.mockResolvedValue(null);
        await expect(currentScreenNoteBounds()).rejects.toThrow('No display');
    });
});

it('places a newly created fallback window in physical pixels on a 200% secondary monitor', async () => {
    const window = { setSize: vi.fn().mockResolvedValue(undefined), setPosition: vi.fn().mockResolvedValue(undefined), show: vi.fn().mockResolvedValue(undefined), setFocus: vi.fn().mockResolvedValue(undefined) };
    const bounds = centeredNoteBounds({ position: { x: 1920, y: 0 }, size: { width: 1920, height: 1080 } }, 2);
    await placeNewNotePhysically(window, bounds);
    expect(window.setPosition.mock.calls[0][0]).toMatchObject({ type: 'Physical', x: 2480, y: 240 });
    expect(window.setSize.mock.calls[0][0]).toMatchObject({ type: 'Physical', width: 800, height: 600 });
    expect(window.show).toHaveBeenCalledOnce();
    expect(window.setPosition.mock.calls).toHaveLength(2);
    expect(window.setPosition.mock.invocationCallOrder[0]).toBeLessThan(window.setSize.mock.invocationCallOrder[0]);
    expect(window.setSize.mock.invocationCallOrder[0]).toBeLessThan(window.setPosition.mock.invocationCallOrder[1]);
    expect(window.setPosition.mock.invocationCallOrder[0]).toBeLessThan(window.show.mock.invocationCallOrder[0]);
});

it('does not show or focus a fallback window if physical placement fails', async () => {
    const window = { setSize: vi.fn(), setPosition: vi.fn().mockRejectedValue(new Error('display removed')), show: vi.fn(), setFocus: vi.fn() };
    await expect(placeNewNotePhysically(window, { x: 100, y: 100, width: 400, height: 300 })).rejects.toThrow('display removed');
    expect(window.show).not.toHaveBeenCalled();
    expect(window.setFocus).not.toHaveBeenCalled();
});
