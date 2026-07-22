import { describe, expect, it } from 'vitest';
import { buildFoldedPreview } from './markdownUtils';

describe('buildFoldedPreview', () => {
    it('keeps ordinary text content unchanged', () => {
        expect(buildFoldedPreview('見出し\n本文')).toBe('見出し\n本文');
    });

    it('shows the image marker with the nearest following text', () => {
        expect(buildFoldedPreview('![画面](assets/screen.png)\n\nrarar\n続き')).toBe('[画像] rarar');
    });

    it('skips consecutive images before choosing text', () => {
        expect(buildFoldedPreview('![1](a.png)\n![2](b.png)\n識別する文字')).toBe('[画像] 識別する文字');
    });

    it('keeps the image marker when no text exists', () => {
        expect(buildFoldedPreview('![1](a.png)\n\n![2](b.png)')).toBe('[画像]');
    });
});
