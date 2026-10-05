import { describe, expect, it } from 'vitest';
import { cropToOriginal, selectedImageCrop } from './imageCrop';

describe('image cropping', () => {
    it('逆向きのドラッグでも画像内の範囲を選ぶ', () => {
        expect(selectedImageCrop({ x: 120, y: 90 }, { x: -10, y: 20 }, 100, 80)).toEqual({ x: 0, y: 20, width: 100, height: 60 });
    });
    it('クリックや細すぎる範囲を切り取りとして保存しない', () => {
        expect(selectedImageCrop({ x: 10, y: 10 }, { x: 11, y: 40 }, 100, 80)).toBeNull();
    });
    it('表示縮尺と端の丸めを元画像のピクセルに変換する', () => {
        expect(cropToOriginal({ x: 25, y: 10, width: 75, height: 70 }, { w: 100, h: 80 }, { w: 1000, h: 800 })).toEqual({ x: 250, y: 100, width: 750, height: 700 });
    });
});
