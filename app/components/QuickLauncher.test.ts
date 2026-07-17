import { describe, expect, it } from 'vitest';
import {
    emptyMessageForTab,
    nextSelectionIndex,
    nextTab,
    normalizeLauncherTab,
    removeActionLabel,
    shouldCloseLauncherAfterBlur,
    isLatestLauncherRequest,
    filterLauncherItemsByTag,
    launcherTagOptions,
    UNCLASSIFIED_TAG_FILTER,
    tabToReservedTag,
} from './QuickLauncher';
import { LAUNCHER_SHELF_CHANGED_EVENT, shouldReloadLauncherForEvent } from '../utils/launcherEvents';

describe('QuickLauncher logic', () => {
    const item = (path: string, tags: string[]) => ({
        path,
        title: path,
        tags,
        launches: 0,
        is_recipe: false,
    });

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
        expect(emptyMessageForTab('term')).toBe('付箋を右クリック → 📖 用語にする で最初の用語を作れます。');
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

    it('closes after blur only when unlocked and still unfocused', () => {
        expect(shouldCloseLauncherAfterBlur(false, false)).toBe(true);
        expect(shouldCloseLauncherAfterBlur(false, true)).toBe(false);
        expect(shouldCloseLauncherAfterBlur(true, false)).toBe(false);
    });

    it('uses crystal trash for crystals and shelf removal for favorites', () => {
        expect(removeActionLabel('shortcut')).toBe('棚から外す');
        expect(removeActionLabel('recipe')).toBe('ゴミ箱へ移動');
        expect(removeActionLabel('qa')).toBe('ゴミ箱へ移動');
        expect(removeActionLabel('term')).toBe('ゴミ箱へ移動');
    });

    it('accepts only the latest overlapping search response', () => {
        expect(isLatestLauncherRequest(3, 3)).toBe(true);
        expect(isLatestLauncherRequest(2, 3)).toBe(false);
    });

    it('builds user-tag categories without system tags and adds unclassified', () => {
        const items = [
            item('a', ['recipe', '開発']),
            item('b', ['qa', '調査', '開発']),
            item('c', ['term']),
        ];

        expect(launcherTagOptions(items)).toEqual(['開発', '調査', UNCLASSIFIED_TAG_FILTER]);
    });

    it('filters launcher items by user tag or unclassified', () => {
        const items = [
            item('a', ['shortcut', '開発']),
            item('b', ['qa', '調査']),
            item('c', ['term']),
        ];

        expect(filterLauncherItemsByTag(items, '開発').map((value) => value.path)).toEqual(['a']);
        expect(filterLauncherItemsByTag(items, UNCLASSIFIED_TAG_FILTER).map((value) => value.path)).toEqual(['c']);
    });
});
