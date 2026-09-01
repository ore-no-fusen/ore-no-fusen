import type { ChangeSpec, EditorState } from '@codemirror/state';

function selectedLineNumbers(state: EditorState): number[] {
    const { from, to } = state.selection.main;
    const first = state.doc.lineAt(from).number;
    const endPosition = to > from && state.doc.lineAt(to).from === to ? to - 1 : to;
    const last = state.doc.lineAt(Math.max(from, endPosition)).number;
    return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

export function indentSelectedLines(state: EditorState): ChangeSpec[] {
    return selectedLineNumbers(state).map(number => ({
        from: state.doc.line(number).from,
        insert: '  ',
    }));
}

export function outdentSelectedLines(state: EditorState): ChangeSpec[] {
    return selectedLineNumbers(state).flatMap(number => {
        const line = state.doc.line(number);
        const leadingSpaces = line.text.match(/^ */)?.[0].length ?? 0;
        const removeCount = Math.min(2, leadingSpaces);
        return removeCount > 0 ? [{ from: line.from, to: line.from + removeCount }] : [];
    });
}
