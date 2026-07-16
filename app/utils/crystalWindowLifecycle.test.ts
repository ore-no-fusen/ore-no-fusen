import { describe, expect, it, vi } from 'vitest';
import { hideReturnedCrystalWindow } from './crystalWindowLifecycle';

describe('結晶ウィンドウの作り置き', () => {
    it('返す操作では非表示にするだけで破棄しない', async () => {
        const window = {
            hide: vi.fn().mockResolvedValue(undefined),
            destroy: vi.fn().mockResolvedValue(undefined),
        };

        await hideReturnedCrystalWindow(window);

        expect(window.hide).toHaveBeenCalledOnce();
        expect(window.destroy).not.toHaveBeenCalled();
    });
});
