import { describe, expect, it } from 'vitest';
import { STICKY_ICON_BUTTON_SIZE } from './stickyControlStyles';

describe('STICKY_ICON_BUTTON_SIZE', () => {
    it('付箋のアイコン操作を28pxに統一する', () => {
        expect(STICKY_ICON_BUTTON_SIZE).toBe('h-7 min-w-7');
    });
});

