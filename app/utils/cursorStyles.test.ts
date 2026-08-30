import { describe, expect, it } from 'vitest';
import { NOTE_DRAG_CURSOR, NOTE_POINT_CURSOR } from './cursorStyles';

describe('NOTE_DRAG_CURSOR', () => {
    it('指先をホットスポットにした独自カーソルを指定する', () => {
        expect(NOTE_DRAG_CURSOR).toBe("url('/cursors/note-drag.svg?v=2') 11 1, grab");
    });

    it('折りたたみ操作には小さな独自指さしカーソルを指定する', () => {
        expect(NOTE_POINT_CURSOR).toBe("url('/cursors/note-point.svg?v=1') 6 0, pointer");
    });
});
