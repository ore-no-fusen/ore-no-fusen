import { describe, expect, it } from 'vitest';
import { buildClipboardImageMarkdown } from './RichTextEditor';

describe('RichTextEditor clipboard image paste', () => {
    it('places the next input position on a new line after the image', () => {
        const markdown = buildClipboardImageMarkdown('assets/pasted.png');

        expect(markdown).toBe('![image](assets/pasted.png)\n');
        expect(markdown.at(-1)).toBe('\n');
    });
});
