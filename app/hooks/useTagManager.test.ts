import { describe, expect, it } from 'vitest';
import { assertTagCanBeAdded, RESERVED_TAG_ERROR_MESSAGE } from './useTagManager';

describe('useTagManager reserved tag guard', () => {
    it('blocks reserved tags before UI add paths call Rust', () => {
        expect(() => assertTagCanBeAdded(' recipe ')).toThrow(RESERVED_TAG_ERROR_MESSAGE);
        expect(() => assertTagCanBeAdded('SHORTCUT')).toThrow(RESERVED_TAG_ERROR_MESSAGE);
    });

    it('allows normal user tags', () => {
        expect(() => assertTagCanBeAdded('project')).not.toThrow();
        expect(() => assertTagCanBeAdded('recipes')).not.toThrow();
    });
});
