import { afterEach, describe, expect, it, vi } from 'vitest';
import { playShelfMotion, storeFavoriteInOrder } from './shelfMotion';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('favorite storage workflow', () => {
    it('hides without waiting for a slow save, but commits only after saving', async () => {
        let completeSave!: (ok: boolean) => void;
        const saving = new Promise<boolean>(resolve => { completeSave = resolve; });
        const store = vi.fn(), close = vi.fn(), restore = vi.fn();
        const result = storeFavoriteInOrder(() => saving, store, async () => {}, close, restore);
        await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
        expect(store).not.toHaveBeenCalled();
        completeSave(true);
        expect(await result).toBe(true);
        expect(store).toHaveBeenCalledOnce();
        expect(restore).not.toHaveBeenCalled();
    });
    it('restores the live note and does not commit when saving is rejected', async () => {
        const store = vi.fn(), close = vi.fn(), restore = vi.fn();
        expect(await storeFavoriteInOrder(async () => false, store, async () => {}, close, restore)).toBe(false);
        expect(close).toHaveBeenCalledOnce();
        expect(store).not.toHaveBeenCalled();
        expect(restore).toHaveBeenCalledOnce();
    });
    it('restores the live note when saving throws', async () => {
        const store = vi.fn(), restore = vi.fn();
        await expect(storeFavoriteInOrder(async () => { throw Error('save failed'); }, store,
            async () => {}, async () => {}, restore)).rejects.toThrow('save failed');
        expect(store).not.toHaveBeenCalled();
        expect(restore).toHaveBeenCalledOnce();
    });
    it('restores the live note when storage persistence fails', async () => {
        const restore = vi.fn();
        await expect(storeFavoriteInOrder(async () => true, async () => { throw Error('disk full'); },
            async () => {}, async () => {}, restore)).rejects.toThrow('disk full');
        expect(restore).toHaveBeenCalledOnce();
    });
    it('still hides and stores if optional animation fails', async () => {
        const close = vi.fn();
        expect(await storeFavoriteInOrder(async () => true, async () => {},
            async () => { throw Error('animation'); }, close, vi.fn())).toBe(true);
        expect(close).toHaveBeenCalledOnce();
    });
});
describe('shelf motion', () => {
    it('does not wait for motion when the OS requests reduced motion', async () => {
        vi.stubGlobal('matchMedia', () => ({ matches: true }));
        const element = document.createElement('div');
        const animate = vi.fn();
        element.animate = animate;
        await playShelfMotion(element, 'return');
        expect(animate).not.toHaveBeenCalled();
    });
    it('tolerates an absent animation API', async () => {
        await expect(playShelfMotion(document.createElement('div'), 'enter')).resolves.toBeUndefined();
    });
    it('cleans up a cancelled animation', async () => {
        vi.stubGlobal('matchMedia', () => ({ matches: false }));
        const element = document.createElement('div');
        const cancel = vi.fn();
        element.animate = vi.fn().mockReturnValue({ finished: Promise.reject(Error('cancel')), cancel });
        await playShelfMotion(element, 'return');
        expect(cancel).toHaveBeenCalledOnce();
    });
});
