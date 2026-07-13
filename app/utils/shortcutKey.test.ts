import { describe, expect, it } from 'vitest';
import { formatShortcutLabel, hasShortcutConflict, keyboardEventToShortcut, matchesShortcut, normalizeShortcutString } from './shortcutKey';

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

describe('hasShortcutConflict', () => {
    it('detects equivalent shortcuts and ignores missing values', () => {
        expect(hasShortcutConflict('ctrl+shift+c', ['Shift+Control+KeyC', undefined])).toBe(true);
        expect(hasShortcutConflict('ctrl+b', ['ctrl+h', 'ctrl+l'])).toBe(false);
    });
});

describe('formatShortcutLabel', () => {
    it('formats shortcut labels for display', () => {
        expect(formatShortcutLabel('ctrl+shift+h')).toBe('Ctrl + Shift + H');
        expect(formatShortcutLabel('super+space')).toBe('Win + Space');
        expect(formatShortcutLabel('shift+control+KeyH')).toBe('Ctrl + Shift + H');
    });
});

describe('matchesShortcut', () => {
    it('matches normalized shortcut strings', () => {
        expect(matchesShortcut(keyEvent({ key: 'N', ctrlKey: true, altKey: true }), 'ctrl+alt+n')).toBe(true);
        expect(matchesShortcut(keyEvent({ key: 'h', ctrlKey: true, shiftKey: true }), ' CTRL + SHIFT + H ')).toBe(true);
        expect(matchesShortcut(keyEvent({ key: 'N', ctrlKey: true }), 'control+KeyN')).toBe(true);
    });

    it('does not match different shortcuts or disabled values', () => {
        expect(matchesShortcut(keyEvent({ key: 'n', ctrlKey: true }), 'ctrl+alt+n')).toBe(false);
        expect(matchesShortcut(keyEvent({ key: 'n', ctrlKey: true }), null)).toBe(false);
        expect(matchesShortcut(keyEvent({ key: 'n' }), 'n')).toBe(false);
    });
});

describe('normalizeShortcutString', () => {
    it('normalizes plugin shortcut strings', () => {
        expect(normalizeShortcutString('shift+control+KeyH')).toBe('ctrl+shift+h');
        expect(normalizeShortcutString('control+KeyN')).toBe('ctrl+n');
        expect(normalizeShortcutString('control+Digit1')).toBe('ctrl+1');
    });

    it('orders modifiers consistently', () => {
        expect(normalizeShortcutString('super+shift+alt+control+KeyN')).toBe('ctrl+alt+shift+super+n');
    });
});
