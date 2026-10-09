import { describe, expect, it } from 'vitest';
import { croppedNoteSize } from './fitCroppedNote';
describe('cropped note sizing', () => {
    const original = { width: 577, height: 900 };
    const screen = { width: 1280, height: 720 };
    it('shrinks the cropped image and removes unused height', () => {
        expect(croppedNoteSize(251, 324, original, screen)).toEqual({ width: 267, height: 340 });
    });
    it('respects image display scale and accompanying text height', () => {
        expect(croppedNoteSize(251 * 1.5, 600, original, screen)).toEqual({ width: 393, height: 616 });
    });
    it('keeps tiny images usable and long content within the work area', () => {
        expect(croppedNoteSize(20, 20, original, screen)).toEqual({ width: 160, height: 100 });
        expect(croppedNoteSize(1000, 2000, original, screen)).toEqual({ width: 577, height: 720 });
    });
    it('does not enlarge an already small user window', () => {
        expect(croppedNoteSize(251, 324, { width: 200, height: 180 }, screen)).toEqual({ width: 200, height: 180 });
    });
});
