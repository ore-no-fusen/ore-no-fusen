import { describe, expect, it } from 'vitest';
import {
    emptyMessageForTab,
    nextSelectionIndex,
    nextTab,
    normalizeLauncherTab,
    tabToReservedTag,
} from './QuickLauncher';
import { LAUNCHER_SHELF_CHANGED_EVENT, shouldReloadLauncherForEvent } from '../utils/launcherEvents';

describe('QuickLauncher logic', () => {
    it('maps tabs to reserved tags', () => {
        expect(tabToReservedTag('shortcut')).toBe('shortcut');
        expect(tabToReservedTag('qa')).toBe('qa');
        expect(tabToReservedTag('term')).toBe('term');
        expect(tabToReservedTag('recipe')).toBe('recipe');
    });

    it('normalizes missing or unknown last tab to recipe', () => {
        expect(normalizeLauncherTab(undefined)).toBe('recipe');
        expect(normalizeLauncherTab('unknown')).toBe('recipe');
        expect(normalizeLauncherTab('shortcut')).toBe('shortcut');
    });

    it('selects the specified empty-state message for each tab', () => {
        expect(emptyMessageForTab('recipe')).toBe('青付箋を右クリック → レシピにする で最初のレシピを作れます。');
        expect(emptyMessageForTab('shortcut')).toBe('付箋を右クリック → お気に入りに登録 で追加できます。');
        expect(emptyMessageForTab('qa')).toBe('付箋を右クリック → ❓ QAにする で最初のQAを作れます。');
        expect(emptyMessageForTab('term')).toBe('この棚は今後のバージョンで使えるようになります。');
    });

    it('moves selection with wraparound', () => {
        expect(nextSelectionIndex(0, 3, 'up')).toBe(2);
        expect(nextSelectionIndex(2, 3, 'down')).toBe(0);
        expect(nextSelectionIndex(1, 3, 'up')).toBe(0);
        expect(nextSelectionIndex(1, 3, 'down')).toBe(2);
        expect(nextSelectionIndex(0, 0, 'down')).toBe(0);
    });

    it('moves tabs in display order with wraparound', () => {
        expect(nextTab('shortcut', 'right')).toBe('qa');
        expect(nextTab('qa', 'right')).toBe('term');
        expect(nextTab('recipe', 'right')).toBe('shortcut');
        expect(nextTab('shortcut', 'left')).toBe('recipe');
    });

    it('reloads launcher items for shelf changed events only', () => {
        expect(shouldReloadLauncherForEvent(LAUNCHER_SHELF_CHANGED_EVENT)).toBe(true);
        expect(shouldReloadLauncherForEvent('fusen:reload_note')).toBe(false);
    });
});
