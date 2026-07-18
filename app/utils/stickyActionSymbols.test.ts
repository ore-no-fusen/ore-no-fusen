import { describe, expect, it } from 'vitest';
import { STICKY_ACTION_SYMBOLS } from './stickyActionSymbols';

describe('STICKY_ACTION_SYMBOLS', () => {
    it('keeps sticky-note buttons and context-menu actions on one shared symbol set', () => {
        expect(STICKY_ACTION_SYMBOLS).toEqual({
            newNote: '＋',
            archive: '📦',
            delete: '🗑️',
            help: '?',
        });
    });
});
