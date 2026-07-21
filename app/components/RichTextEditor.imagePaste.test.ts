import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
    addPendingImage,
    buildClipboardImageMarkdown,
    findPendingImagePosition,
    forwardImageClickToEditor,
    IMAGE_WIDGET_CLICK_EVENT,
    pendingImageField,
    removePendingImage,
} from './RichTextEditor';

describe('RichTextEditor clipboard image paste', () => {
    it('places the next input position on a new line after the image', () => {
        const markdown = buildClipboardImageMarkdown('assets/pasted.png');

        expect(markdown).toBe('![image](assets/pasted.png)\n');
        expect(markdown.at(-1)).toBe('\n');
    });

    it('shows a pending image immediately without adding it to the document', () => {
        const parent = document.createElement('div');
        document.body.appendChild(parent);
        const view = new EditorView({
            parent,
            state: EditorState.create({ doc: 'memo', extensions: [pendingImageField] }),
        });

        view.dispatch({
            effects: addPendingImage.of({
                image: { id: 'pending-1', objectUrl: 'blob:pending-1' },
                pos: 2,
            }),
        });

        expect(view.state.doc.toString()).toBe('memo');
        expect(parent.querySelector('[data-pending-image-id="pending-1"] img')?.getAttribute('src'))
            .toBe('blob:pending-1');
        expect(findPendingImagePosition(view, 'pending-1')).toBe(2);

        view.dispatch({ changes: { from: 0, insert: 'x' } });
        expect(findPendingImagePosition(view, 'pending-1')).toBe(3);

        view.dispatch({ effects: removePendingImage.of('pending-1') });
        expect(findPendingImagePosition(view, 'pending-1')).toBeNull();
        view.destroy();
        parent.remove();
    });

    it('exits editing only when the image itself is clicked', () => {
        const widget = document.createElement('span');
        widget.className = 'cm-image-widget';
        const image = document.createElement('img');
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'resize-handle';
        widget.append(image, resizeHandle);

        const editorDom = document.createElement('div');
        let notifications = 0;
        editorDom.addEventListener(IMAGE_WIDGET_CLICK_EVENT, () => notifications++);

        expect(forwardImageClickToEditor(image, editorDom)).toBe(true);
        expect(notifications).toBe(1);
        expect(forwardImageClickToEditor(resizeHandle, editorDom)).toBe(false);
        expect(forwardImageClickToEditor(document.createElement('img'), editorDom)).toBe(false);
        expect(notifications).toBe(1);
    });
});
