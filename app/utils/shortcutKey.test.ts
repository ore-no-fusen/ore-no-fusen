import { describe, expect, it } from 'vitest';
import { formatShortcutLabel, keyboardEventToShortcut, matchesShortcut } from './shortcutKey';

function keyEvent(input: {
    key: string;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
    metaKey?: boolean;
}): Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey'> {
    return {
        key: input.key,
        ctrlKey: input.ctrlKey ?? false,
        shiftKey: input.shiftKey ?? false,
        altKey: input.altKey ?? false,
        metaKey: input.metaKey ?? false,
    };
}

describe('keyboardEventToShortcut', () => {
    it('converts modifier plus normal key combinations', () => {
        expect(keyboardEventToShortcut(keyEvent({ key: 'n', ctrlKey: true }))).toBe('ctrl+n');
        expect(keyboardEventToShortcut(keyEvent({ key: ' ', ctrlKey: true, altKey: true }))).toBe('ctrl+alt+space');
        expect(keyboardEventToShortcut(keyEvent({ key: 'h', ctrlKey: true, shiftKey: true }))).toBe('ctrl+shift+h');
    });

    it('returns null for modifier-only keys', () => {
        expect(keyboardEventToShortcut(keyEvent({ key: 'Control', ctrlKey: true }))).toBeNull();
        expect(keyboardEventToShortcut(keyEvent({ key: 'Shift', shiftKey: true }))).toBeNull();
        expect(keyboardEventToShortcut(keyEvent({ key: 'Alt', altKey: true }))).toBeNull();
    });

    it('returns null for normal keys without modifiers', () => {
        expect(keyboardEventToShortcut(keyEvent({ key: 'n' }))).toBeNull();
    });

    it('returns null for Escape', () => {
        expect(keyboardEventToShortcut(keyEvent({ key: 'Escape', ctrlKey: true }))).toBeNull();
    });

    it('normalizes F1-F24, letters, and digits', () => {
        expect(keyboardEventToShortcut(keyEvent({ key: 'F1', ctrlKey: true }))).toBe('ctrl+f1');
        expect(keyboardEventToShortcut(keyEvent({ key: 'F24', ctrlKey: true }))).toBe('ctrl+f24');
        expect(keyboardEventToShortcut(keyEvent({ key: 'N', ctrlKey: true }))).toBe('ctrl+n');
        expect(keyboardEventToShortcut(keyEvent({ key: '7', ctrlKey: true }))).toBe('ctrl+7');
    });

    it('returns null for unsupported keys', () => {
        expect(keyboardEventToShortcut(keyEvent({ key: '!', ctrlKey: true }))).toBeNull();
    });
});

describe('formatShortcutLabel', () => {
    it('formats shortcut labels for display', () => {
        expect(formatShortcutLabel('ctrl+shift+h')).toBe('Ctrl + Shift + H');
        expect(formatShortcutLabel('super+space')).toBe('Win + Space');
    });
});

describe('matchesShortcut', () => {
    it('matches normalized shortcut strings', () => {
        expect(matchesShortcut(keyEvent({ key: 'N', ctrlKey: true, altKey: true }), 'ctrl+alt+n')).toBe(true);
        expect(matchesShortcut(keyEvent({ key: 'h', ctrlKey: true, shiftKey: true }), ' CTRL + SHIFT + H ')).toBe(true);
    });

    it('does not match different shortcuts or disabled values', () => {
        expect(matchesShortcut(keyEvent({ key: 'n', ctrlKey: true }), 'ctrl+alt+n')).toBe(false);
        expect(matchesShortcut(keyEvent({ key: 'n', ctrlKey: true }), null)).toBe(false);
        expect(matchesShortcut(keyEvent({ key: 'n' }), 'n')).toBe(false);
    });
});
