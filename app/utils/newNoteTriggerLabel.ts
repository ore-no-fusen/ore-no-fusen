import { formatShortcutLabel } from './shortcutKey';

export type NewNoteTrigger = 'shortcut' | 'double_ctrl' | 'double_shift';

export function formatNewNoteTriggerLabel(
    trigger: string | null | undefined,
    shortcut: string | null | undefined,
    language: 'ja' | 'en',
): string {
    if (trigger === 'double_ctrl') return language === 'en' ? 'Double Ctrl' : 'Ctrlを2回';
    if (trigger === 'double_shift') return language === 'en' ? 'Double Shift' : 'Shiftを2回';
    return formatShortcutLabel(shortcut || 'ctrl+n').replace(/ \+ /g, '+');
}

