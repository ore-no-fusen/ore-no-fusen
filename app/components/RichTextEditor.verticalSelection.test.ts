import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { getLogicalLineSelectionFallback, verticalSelectionKeymap } from './RichTextEditor';

describe('RichTextEditor vertical selection keymap', () => {
    it('does not block selection handling when CodeMirror needs a fallback', () => {
        expect(verticalSelectionKeymap.map(binding => binding.key)).toEqual(['ArrowDown', 'ArrowUp']);
        expect(verticalSelectionKeymap.every(binding => binding.preventDefault !== true)).toBe(true);
    });

    it('advances from a middle column through shorter and following lines', () => {
        const state = EditorState.create({ doc: '123456789\nx\nabcdefghij' });

        const shortLineEnd = getLogicalLineSelectionFallback(state, 5, true);
        expect(shortLineEnd).toBe(state.doc.line(2).to);
        expect(getLogicalLineSelectionFallback(state, shortLineEnd!, true)).toBe(state.doc.line(3).from + 1);
    });

    it('advances upward and stops only at the document boundary', () => {
        const state = EditorState.create({ doc: 'abc\ndefgh\nijk' });

        expect(getLogicalLineSelectionFallback(state, state.doc.line(2).from + 4, false)).toBe(state.doc.line(1).to);
        expect(getLogicalLineSelectionFallback(state, 0, false)).toBeNull();
        expect(getLogicalLineSelectionFallback(state, state.doc.length, true)).toBeNull();
    });
});
