import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { buildImagePreviewDecorations } from './RichTextEditor';

function countDecorations(value: string) {
    const state = EditorState.create({ doc: value });
    const decorations = buildImagePreviewDecorations(
        state.doc,
        [{ from: 0, to: state.doc.length }],
        'C:\\Notes\\sample.md'
    );

    let count = 0;
    decorations.between(0, state.doc.length, () => {
        count += 1;
    });
    return count;
}

describe('RichTextEditor image preview decorations', () => {
    it('decorates a normal image markdown on one line', () => {
        expect(countDecorations('![image](assets/a.png)')).toBe(1);
    });

    it('decorates a scaled image markdown on one line', () => {
        expect(countDecorations('![image|0.5](assets/a.png)')).toBe(1);
    });

    it('does not decorate incomplete image markdown', () => {
        expect(countDecorations('![image](assets/a.png')).toBe(0);
    });

    it('does not decorate image markdown that crosses a line break', () => {
        expect(countDecorations('![image](assets/\na.png)')).toBe(0);
    });
});
