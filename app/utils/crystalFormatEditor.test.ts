import { describe, expect, it } from 'vitest';
import {
    addFreeSection,
    addNamedFreeSection,
    getLocalizedDefaultCrystalFormats,
    localizeDefaultCrystalFormatsIfUntouched,
    moveFreeSection,
    removeFreeSection,
    resetCrystalTypeFormat,
} from './crystalFormatEditor';
import { DEFAULT_CRYSTAL_FORMATS, type CrystalTypeFormat } from './crystalFormatConfig';

describe('crystalFormatEditor helpers', () => {
    it('T9 inserts a free section before history', () => {
        const next = addFreeSection(DEFAULT_CRYSTAL_FORMATS.qa);

        expect(next.sections.at(-2)).toMatchObject({ label: '新しい節', slot: 'free', tracked: true });
        expect(next.sections.at(-1)?.slot).toBe('history');
    });

    it('T9 removes only free sections', () => {
        const withFree = addFreeSection(DEFAULT_CRYSTAL_FORMATS.recipe);
        const removed = removeFreeSection(withFree, withFree.sections.length - 2);
        const unchanged = removeFreeSection(DEFAULT_CRYSTAL_FORMATS.recipe, 1);

        expect(removed).toEqual(DEFAULT_CRYSTAL_FORMATS.recipe);
        expect(unchanged).toEqual(DEFAULT_CRYSTAL_FORMATS.recipe);
    });

    it('adds the recipe candidate once before history', () => {
        const added = addNamedFreeSection(DEFAULT_CRYSTAL_FORMATS.recipe, '事前条件');
        const duplicate = addNamedFreeSection(added, '事前条件');

        expect(added.sections.at(-2)).toMatchObject({ label: '事前条件', slot: 'free', tracked: true });
        expect(duplicate).toEqual(added);
    });

    it('T10 moves free sections without crossing key or history', () => {
        const format: CrystalTypeFormat = {
            sections: [
                { label: 'Key', slot: 'question', tracked: true },
                { label: 'Answer', slot: 'answer', tracked: true },
                { label: 'Free', slot: 'free', tracked: true },
                { label: 'History', slot: 'history', tracked: false },
            ],
        };

        expect(moveFreeSection(format, 2, 'up').sections.map((section) => section.label)).toEqual([
            'Key',
            'Free',
            'Answer',
            'History',
        ]);
        expect(moveFreeSection(format, 2, 'down')).toEqual(format);
        expect(moveFreeSection(moveFreeSection(format, 2, 'up'), 1, 'up').sections.map((section) => section.label)).toEqual([
            'Key',
            'Free',
            'Answer',
            'History',
        ]);
    });

    it('T10 resets one type to defaults without sharing references', () => {
        const reset = resetCrystalTypeFormat('term');

        expect(reset).toEqual(DEFAULT_CRYSTAL_FORMATS.term);
        expect(reset).not.toBe(DEFAULT_CRYSTAL_FORMATS.term);
        expect(reset.sections[0]).not.toBe(DEFAULT_CRYSTAL_FORMATS.term.sections[0]);
    });

    it('shows untouched default template labels in English', () => {
        const localized = localizeDefaultCrystalFormatsIfUntouched(DEFAULT_CRYSTAL_FORMATS, 'en');

        expect(localized.recipe.sections.map((section) => section.label)).toEqual([
            'When to Use', 'Steps', 'Source', 'Notes', 'Improvement History',
        ]);
        expect(getLocalizedDefaultCrystalFormats('en').term.sections[0].label).toBe('Term');
    });

    it('does not overwrite user-customized template labels in English mode', () => {
        const customized = getLocalizedDefaultCrystalFormats('ja');
        customized.qa.sections[0].label = 'My Question';

        expect(localizeDefaultCrystalFormatsIfUntouched(customized, 'en')).toEqual(customized);
    });
});
