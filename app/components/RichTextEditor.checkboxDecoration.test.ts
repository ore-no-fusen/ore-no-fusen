import { describe, expect, it } from 'vitest';
import { checkboxMarkerDecorationLength, markdownMarkerDecorationLength } from './RichTextEditor';

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
