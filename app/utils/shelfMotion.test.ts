import { afterEach, describe, expect, it, vi } from 'vitest';
import { playShelfMotion, storeFavoriteInOrder } from './shelfMotion';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('favorite storage workflow', () => {
    it('saves and persists before motion and closing', async () => {
        const actions: string[] = [];
        expect(await storeFavoriteInOrder(async () => { actions.push('save'); return true; },
            async () => { actions.push('store'); }, async () => { actions.push('motion'); },
            async () => { actions.push('close'); })).toBe(true);
        expect(actions).toEqual(['save', 'store', 'motion', 'close']);
    });
    it('keeps the note visible when the save is rejected', async () => {
        const store = vi.fn(), motion = vi.fn(), close = vi.fn();
        expect(await storeFavoriteInOrder(async () => false, store, motion, close)).toBe(false);
        expect(store).not.toHaveBeenCalled();
        expect(motion).not.toHaveBeenCalled();
        expect(close).not.toHaveBeenCalled();
    });
    it('keeps the note visible when storage persistence fails', async () => {
        const motion = vi.fn(), close = vi.fn();
        await expect(storeFavoriteInOrder(async () => true, async () => { throw Error('disk full'); },
            motion, close)).rejects.toThrow('disk full');
        expect(motion).not.toHaveBeenCalled();
        expect(close).not.toHaveBeenCalled();
    });
    it('still closes a saved note if optional animation fails', async () => {
        const close = vi.fn();
        expect(await storeFavoriteInOrder(async () => true, async () => {},
            async () => { throw Error('animation'); }, close)).toBe(true);
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
