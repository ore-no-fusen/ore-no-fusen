import { describe, expect, it } from 'vitest';
import { physicalCrystalWindowPosition, physicalCrystalWindowSize } from './crystalWindowSize';

describe('physicalCrystalWindowSize', () => {
    it('保存された論理サイズをDPI倍率に合わせて物理サイズへ変換する', () => {
        expect(physicalCrystalWindowSize(587, 701, 1.25)).toEqual({ width: 734, height: 876 });
    });

    it('保存サイズが無い結晶だけ標準サイズ460x560を使う', () => {
        expect(physicalCrystalWindowSize(undefined, undefined, 1.5)).toEqual({ width: 690, height: 840 });
    });

    it('負座標を含む保存位置もDPI倍率に合わせて復元する', () => {
        expect(physicalCrystalWindowPosition(-745, 783, 1.25)).toEqual({ x: -931, y: 979 });
        expect(physicalCrystalWindowPosition(undefined, undefined, 1.25)).toBeUndefined();
    });
});
