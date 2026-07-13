import { describe, expect, it } from 'vitest';
import { calculateFoldedPhysicalSize } from './useWindowManager';

describe('calculateFoldedPhysicalSize', () => {
    it('横長の付箋を320論理pxまで縮める', () => {
        expect(calculateFoldedPhysicalSize(2000, 1, 40)).toEqual({
            width: 320,
            height: 40,
        });
    });

    it('DPI倍率を幅と高さへ反映する', () => {
        expect(calculateFoldedPhysicalSize(2000, 1.5, 40)).toEqual({
            width: 480,
            height: 60,
        });
    });

    it('元から細い付箋は折りたたみ時に広げない', () => {
        expect(calculateFoldedPhysicalSize(280, 1, 40)).toEqual({
            width: 280,
            height: 40,
        });
    });
});
