import { EditorSelection, EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { indentSelectedLines, outdentSelectedLines } from './editorIndent';

function applyChanges(state: EditorState, changes: ReturnType<typeof indentSelectedLines>): EditorState {
    return state.update({ changes }).state;
}

describe('multi-line indentation', () => {
    it('adds two spaces to every selected line without deleting its text', () => {
        const state = EditorState.create({
            doc: '親\n子1\n子2\n次',
            selection: EditorSelection.range(2, 7),
        });

        expect(applyChanges(state, indentSelectedLines(state)).doc.toString()).toBe('親\n  子1\n  子2\n次');
    });

    it('does not indent the next line when the selection ends at its line start', () => {
        const state = EditorState.create({
            doc: '子1\n子2\n次',
            selection: EditorSelection.range(0, 6),
        });

        expect(applyChanges(state, indentSelectedLines(state)).doc.toString()).toBe('  子1\n  子2\n次');
    });

    it('removes up to two leading spaces from every selected line', () => {
        const state = EditorState.create({
            doc: '  子1\n    子2\n次',
            selection: EditorSelection.range(0, 11),
        });

        expect(applyChanges(state, outdentSelectedLines(state)).doc.toString()).toBe('子1\n  子2\n次');
    });
});
