import { describe, expect, it } from 'vitest';
import { checkboxMarkerDecorationLength, markdownMarkerDecorationLength, shortcutToCodeMirrorKey } from './RichTextEditor';

describe('checkbox marker decoration', () => {
    it('does not include the space before checkbox text', () => {
        expect(checkboxMarkerDecorationLength('- [ ] ')).toBe('- [ ]'.length);
        expect(checkboxMarkerDecorationLength('- [x]   ')).toBe('- [x]'.length);
    });

    it('does not include the space before normal list text', () => {
        expect(markdownMarkerDecorationLength('- ')).toBe('-'.length);
        expect(markdownMarkerDecorationLength('*   ')).toBe('*'.length);
    });
});

describe('editor shortcut conversion', () => {
    it('converts saved shortcuts to CodeMirror keys', () => {
        expect(shortcutToCodeMirrorKey('ctrl+b')).toBe('Ctrl-b');
        expect(shortcutToCodeMirrorKey('ctrl+shift+c')).toBe('Ctrl-Shift-c');
        expect(shortcutToCodeMirrorKey('super+b')).toBe('Meta-b');
        expect(shortcutToCodeMirrorKey('alt+h')).toBe('Alt-h');
    });
});
