import { describe, expect, it } from 'vitest';
import { formatNewNoteTriggerLabel } from './newNoteTriggerLabel';

describe('formatNewNoteTriggerLabel', () => {
    it('設定中のショートカットを表示用に整形する', () => {
        expect(formatNewNoteTriggerLabel('shortcut', 'alt+n', 'ja')).toBe('Alt+N');
    });

    it('2回押し設定を言語別に表示する', () => {
        expect(formatNewNoteTriggerLabel('double_ctrl', 'ctrl+n', 'ja')).toBe('Ctrlを2回');
        expect(formatNewNoteTriggerLabel('double_shift', 'ctrl+n', 'en')).toBe('Double Shift');
    });
});

