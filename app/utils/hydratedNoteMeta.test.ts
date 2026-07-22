import { describe, expect, it } from 'vitest';
import { extractHydratedNoteMeta } from './hydratedNoteMeta';

describe('見えない付箋のメタデータ復元', () => {
    it('結晶判定と表示に必要な属性をまとめて復元する', () => {
        const meta = extractHydratedNoteMeta(`---
tags: [OreNoFusen, qa]
backgroundColor: "#cfd8dc"
fontSize: 18
opacity: 0.9
alwaysOnTop: true
folded: false
window: { x: 10, y: 20, width: 640, height: 520 }
---
body`);
        expect(meta).toMatchObject({
            tags: ['OreNoFusen', 'qa'],
            background_color: '#cfd8dc',
            font_size: 18,
            opacity: 0.9,
            always_on_top: true,
            folded: false,
            x: 10,
            y: 20,
            width: 640,
            height: 520,
        });
    });
});
