import { describe, expect, it } from 'vitest';
import { DEFAULT_ANNOTATION_SETTINGS } from './ImageAnnotationModal';

describe('ImageAnnotationModal defaults', () => {
    it('starts with the requested green highlighter settings', () => {
        expect(DEFAULT_ANNOTATION_SETTINGS).toEqual({
            tool: 'highlight',
            color: '#00FF00',
            strokeWidth: 15,
            highlightOpacity: 0.5,
        });
    });
});
