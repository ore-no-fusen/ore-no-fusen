import { describe, expect, it } from 'vitest';
import { nextRecipeDraftRequest } from './recipeDraftRequest';

describe('nextRecipeDraftRequest', () => {
    it('increments the revision when the same source note is requested again', () => {
        expect(nextRecipeDraftRequest({ path: 'same.md', revision: 1 }, 'same.md')).toEqual({
            path: 'same.md',
            revision: 2,
        });
    });
});
