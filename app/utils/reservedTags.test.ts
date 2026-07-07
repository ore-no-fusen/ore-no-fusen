import { describe, expect, it } from 'vitest';
import { isReservedTag, normalizeTagForReservation, RESERVED_TAGS } from './reservedTags';

describe('reservedTags', () => {
    it('defines the five reserved tags', () => {
        expect(RESERVED_TAGS).toEqual(['recipe', 'link', 'term', 'qa', 'shortcut']);
    });

    it('detects reserved tags case-insensitively and trims spaces', () => {
        expect(isReservedTag('recipe')).toBe(true);
        expect(isReservedTag(' Recipe ')).toBe(true);
        expect(isReservedTag('\tSHORTCUT\n')).toBe(true);
        expect(isReservedTag('qa')).toBe(true);
    });

    it('does not treat partial matches as reserved', () => {
        expect(isReservedTag('recipes')).toBe(false);
        expect(isReservedTag('my-recipe')).toBe(false);
        expect(isReservedTag('')).toBe(false);
    });

    it('normalizes tags for reservation checks', () => {
        expect(normalizeTagForReservation(' Term ')).toBe('term');
    });
});
