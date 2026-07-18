import { describe, expect, it } from 'vitest';
import { NOTE_COLORS, NOTE_FONT_SIZES } from './noteAppearance';

describe('noteAppearance', () => {
    it('付箋で共有する5色を一元管理する', () => {
        expect(Object.values(NOTE_COLORS)).toEqual([
            '#f7e9b0', '#ffcdd2', '#80d8ff', '#fafaf0', '#cfd8dc',
        ]);
    });

    it('付箋で共有する文字サイズを一元管理する', () => {
        expect(Object.values(NOTE_FONT_SIZES)).toEqual([12, 16, 20, 28]);
    });
});

