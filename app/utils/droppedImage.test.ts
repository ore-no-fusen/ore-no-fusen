import { describe, expect, it } from 'vitest';
import {
    appendDroppedImageMarkdown,
    insertDroppedImageMarkdown,
    isSupportedDroppedImageFileName,
} from './droppedImage';

describe('dropped image', () => {
    it('accepts supported image extensions only', () => {
        for (const name of ['a.png', 'a.jpg', 'a.jpeg', 'a.gif', 'a.webp', 'a.bmp']) {
            expect(isSupportedDroppedImageFileName(name)).toBe(true);
        }
        expect(isSupportedDroppedImageFileName('memo.txt')).toBe(false);
        expect(isSupportedDroppedImageFileName('photo.png.exe')).toBe(false);
        expect(isSupportedDroppedImageFileName('photo.heic')).toBe(false);
        expect(isSupportedDroppedImageFileName('vector.svg')).toBe(false);
    });

    it('appends dropped images after the current body', () => {
        expect(appendDroppedImageMarkdown('本文', ['assets/a.png', 'assets/b.jpg']))
            .toBe('本文\n![image](assets/a.png)\n![image](assets/b.jpg)\n');
    });

    it('inserts dropped images at the requested text position', () => {
        expect(insertDroppedImageMarkdown('前半後半', ['assets/a.png'], 2))
            .toBe('前半\n![image](assets/a.png)\n後半');
    });

    it('clamps an invalid insertion position without losing text', () => {
        expect(insertDroppedImageMarkdown('本文', ['assets/a.png'], -10))
            .toBe('![image](assets/a.png)\n本文');
        expect(insertDroppedImageMarkdown('本文', ['assets/a.png'], 100))
            .toBe('本文\n![image](assets/a.png)\n');
    });
});
