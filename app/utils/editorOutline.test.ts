import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { editorOutlineExtension, outlineHiddenRanges, refreshEditorOutline } from './editorOutline';

describe('editing folded outlines', () => {
    const body = '親\n  子\n    ![x](a.png)\n次';
    const make = (collapsed: number[]) => EditorState.create({ doc: body, extensions: editorOutlineExtension(collapsed, vi.fn()) });

    it('keeps the image and child inside the same hidden range', () => {
        const state = make([0]);
        const [range] = outlineHiddenRanges(state, [0]);
        expect(state.sliceDoc(range.from, range.to)).toBe('\n  子\n    ![x](a.png)');
        expect(state.doc.toString()).toBe(body);
    });

    it('rejects edits that would delete hidden text but permits edits outside it', () => {
        const state = make([0]);
        expect(state.update({ changes: { from: 0, to: state.doc.length, insert: '' } }).state.doc.toString()).toBe(body);
        expect(state.update({ changes: { from: 0, insert: '新' } }).state.doc.toString()).toBe('新' + body);
        const opened = state.update({ effects: refreshEditorOutline.of([]) }).state;
        expect(opened.update({ changes: { from: 2, to: 3, insert: '' } }).state.doc.toString()).not.toBe(body);
    });
});
