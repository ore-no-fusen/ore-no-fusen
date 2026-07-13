import { describe, expect, it } from 'vitest';
import {
    buildClipboardImageMarkdown,
    forwardImageClickToEditor,
    IMAGE_WIDGET_CLICK_EVENT,
} from './RichTextEditor';

describe('RichTextEditor clipboard image paste', () => {
    it('places the next input position on a new line after the image', () => {
        const markdown = buildClipboardImageMarkdown('assets/pasted.png');

        expect(markdown).toBe('![image](assets/pasted.png)\n');
        expect(markdown.at(-1)).toBe('\n');
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
