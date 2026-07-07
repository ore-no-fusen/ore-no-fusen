import { describe, expect, it } from 'vitest';
import {
    createLinkTargetRegex,
    decodeNotePathFromUrl,
    encodeNotePathForUrl,
    isAbsoluteOrExternalPath,
    isLinkTarget,
    normalizePath,
    pathsEqual,
} from './pathUtils';
import { resolvePath } from './markdownUtils';

describe('pathUtils', () => {
    it('keeps existing path comparison behavior', () => {
        expect(pathsEqual('C:\\Users\\uck\\note.md', 'c:/users/uck/note.md')).toBe(true);
        expect(normalizePath('C:\\Users\\uck\\note.md\\')).toBe('c:/users/uck/note.md');
    });

    it('round-trips note paths for URL query parameters without losing subfolders', () => {
        const path = 'D:\\Users\\uck\\Documents\\OreNoFusen\\Recipes\\0004_2026-07-06_eeeee.md';
        expect(decodeURIComponent(encodeNotePathForUrl(path))).toBe(path);
        expect(decodeNotePathFromUrl('D:/Users/uck/Documents/OreNoFusen/Recipes/0004_2026-07-06_eeeee.md')).toBe(path);
    });

    it('detects absolute and external paths without treating relative paths as absolute', () => {
        expect(isAbsoluteOrExternalPath('C:\\Users\\uck\\image.png')).toBe(true);
        expect(isAbsoluteOrExternalPath('C:/Users/uck/image.png')).toBe(true);
        expect(isAbsoluteOrExternalPath('\\\\server\\share\\image.png')).toBe(true);
        expect(isAbsoluteOrExternalPath('//server/share/image.png')).toBe(true);
        expect(isAbsoluteOrExternalPath('https://example.com/image.png')).toBe(true);
        expect(isAbsoluteOrExternalPath('data:image/png;base64,abc')).toBe(true);
        expect(isAbsoluteOrExternalPath('assets/image.png')).toBe(false);
        expect(isAbsoluteOrExternalPath('C:relative\\image.png')).toBe(false);
    });

    it('detects link targets for Windows backslash and slash paths', () => {
        expect(isLinkTarget('C:\\Users\\uck\\AppData\\Local\\ore-no-fusen\\msix-test\\')).toBe(true);
        expect(isLinkTarget('C:/Users/uck/AppData/Local/ore-no-fusen/msix-test/')).toBe(true);
        expect(isLinkTarget('C:\\Program Files\\WindowsApps\\ONFStudios.FUSEN.Test\\ore-no-fusen.exe')).toBe(true);
        expect(isLinkTarget('https://example.com/path')).toBe(true);
        expect(isLinkTarget('C:relative\\file.txt')).toBe(false);
    });

    it('splits C slash paths as link targets', () => {
        const text = 'ログ\nC:/Users/uck/AppData/Local/ore-no-fusen/app.log\nを確認';
        const matches = [...text.matchAll(createLinkTargetRegex())].map((match) => match[0]);

        expect(matches).toEqual(['C:/Users/uck/AppData/Local/ore-no-fusen/app.log']);
    });
});

describe('resolvePath', () => {
    const baseFile = 'C:\\Users\\uck\\Documents\\OreNoFusen\\note.md';

    it('does not join Windows absolute slash paths with the base file', () => {
        expect(resolvePath(baseFile, 'C:/Users/uck/Pictures/test.png')).toBe('C:/Users/uck/Pictures/test.png');
    });

    it('keeps existing absolute and external path handling', () => {
        expect(resolvePath(baseFile, 'C:\\Users\\uck\\Pictures\\test.png')).toBe('C:\\Users\\uck\\Pictures\\test.png');
        expect(resolvePath(baseFile, 'https://example.com/test.png')).toBe('https://example.com/test.png');
        expect(resolvePath(baseFile, 'data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
    });

    it('continues to resolve relative image paths against the note directory', () => {
        expect(resolvePath(baseFile, 'assets/test.png')).toBe('C:\\Users\\uck\\Documents\\OreNoFusen\\assets\\test.png');
    });
});
