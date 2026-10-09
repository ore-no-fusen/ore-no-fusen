import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
    size: vi.fn(), position: vi.fn(), factor: vi.fn(), monitor: vi.fn(),
    setSize: vi.fn(), setPosition: vi.fn(), outerSize: vi.fn(),
}));
vi.mock('@tauri-apps/api/window', () => ({
    currentMonitor: mocks.monitor,
    getCurrentWindow: () => ({ innerSize: mocks.size, outerPosition: mocks.position,
        scaleFactor: mocks.factor, setSize: mocks.setSize, setPosition: mocks.setPosition, outerSize: mocks.outerSize }),
}));
import { beginTemporaryWindowGeometry, temporaryGeometryActive } from './temporaryWindowGeometry';
beforeEach(() => {
    vi.clearAllMocks();
    mocks.size.mockResolvedValue({ width: 600, height: 450 });
    mocks.position.mockResolvedValue({ x: -1200, y: 100 });
    mocks.factor.mockResolvedValue(1.5);
    mocks.monitor.mockResolvedValue({ scaleFactor: 1.5, workArea: {
        position: { x: -1500, y: 0 }, size: { width: 1500, height: 800 },
    } });
    mocks.outerSize.mockResolvedValue({ width: 1140, height: 800 });
    mocks.setSize.mockResolvedValue(undefined);
    mocks.setPosition.mockResolvedValue(undefined);
});
describe('temporary annotation geometry', () => {
    it.each(['save', 'cancel'])('%s restores the user size and negative-monitor position', async () => {
        const close = beginTemporaryWindowGeometry(760, 620);
        expect(temporaryGeometryActive()).toBe(true);
        await vi.waitFor(() => expect(mocks.setPosition).toHaveBeenCalledTimes(1));
        expect(mocks.setSize).toHaveBeenNthCalledWith(1, expect.objectContaining({ width: 760, height: 800 / 1.5 }));
        await close();
        expect(mocks.setSize).toHaveBeenLastCalledWith(expect.objectContaining({ width: 400, height: 300 }));
        expect(mocks.setPosition).toHaveBeenLastCalledWith(expect.objectContaining({ x: -1200, y: 100 }));
        expect(temporaryGeometryActive()).toBe(false);
    });
    it('closing during enlargement waits for it before restoring, and never centers later', async () => {
        let finish!: () => void;
        mocks.setSize.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
        const close = beginTemporaryWindowGeometry(760, 620);
        await vi.waitFor(() => expect(mocks.setSize).toHaveBeenCalledTimes(1));
        const done = close();
        expect(temporaryGeometryActive()).toBe(true);
        finish();
        await done;
        expect(mocks.setPosition).toHaveBeenCalledTimes(2);
        expect(mocks.setPosition.mock.calls.every(([p]) => p.x === -1200 && p.y === 100)).toBe(true);
    });
    it('failed enlargement restores the original window', async () => {
        mocks.setSize.mockRejectedValueOnce(new Error('resize failed'));
        const close = beginTemporaryWindowGeometry(760, 620);
        await expect(close()).resolves.toBeUndefined();
        // Immediate close makes no changes; also cover failure after snapshot.
        const closeFailed = beginTemporaryWindowGeometry(760, 620);
        await vi.waitFor(() => expect(mocks.setSize).toHaveBeenCalledTimes(2));
        await expect(closeFailed()).rejects.toThrow('resize failed');
        expect(mocks.setSize).toHaveBeenLastCalledWith(expect.objectContaining({ width: 400, height: 300 }));
    });
});
