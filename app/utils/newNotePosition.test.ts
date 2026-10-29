import { beforeEach, describe, expect, it, vi } from 'vitest';
import { centeredNoteBounds, currentScreenNoteBounds } from './newNotePosition';

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
