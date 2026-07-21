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

        const localized = localizeDefaultCrystalFormatsIfUntouched(customized, 'en');
        expect(localized.qa.sections[0].label).toBe('My Question');
        expect(localized.qa.sections[1].label).toBe('Answer');
    });

    it('normalizes the legacy Hiro source label in Japanese and English', () => {
        const formats = getLocalizedDefaultCrystalFormats('ja');
        formats.recipe.sections[2].label = 'きっかけ　★ヒロ';

        expect(localizeDefaultCrystalFormatsIfUntouched(formats, 'ja').recipe.sections[2].label).toBe('きっかけ');
        expect(localizeDefaultCrystalFormatsIfUntouched(formats, 'en').recipe.sections[2].label).toBe('Source');
    });

    it('localizes fixed sections after custom sections change their positions', () => {
        const formats = getLocalizedDefaultCrystalFormats('ja');
        formats.term.sections.splice(5, 0, { label: 'そもそものきっかけ', slot: 'free', tracked: true });

        const localized = localizeDefaultCrystalFormatsIfUntouched(formats, 'en');
        expect(localized.term.sections.find((section) => section.slot === 'source')?.label).toBe('Source');
        expect(localized.term.sections.find((section) => section.slot === 'supplement')?.label).toBe('Notes');
        expect(localized.term.sections.find((section) => section.label === 'そもそものきっかけ')?.label).toBe('そもそものきっかけ');
    });

    it('restores English default labels to Japanese without changing custom labels', () => {
        const formats = getLocalizedDefaultCrystalFormats('en');
        formats.recipe.sections.splice(2, 0, { label: 'My custom section', slot: 'free', tracked: true });

        const localized = localizeDefaultCrystalFormatsIfUntouched(formats, 'ja');
        expect(localized.recipe.sections.find((section) => section.slot === 'situation')?.label).toBe('こんなとき');
        expect(localized.recipe.sections.find((section) => section.slot === 'steps')?.label).toBe('どうする');
        expect(localized.recipe.sections.find((section) => section.slot === 'source')?.label).toBe('きっかけ');
        expect(localized.recipe.sections.find((section) => section.slot === 'supplement')?.label).toBe('補足');
        expect(localized.recipe.sections.find((section) => section.label === 'My custom section')?.label).toBe('My custom section');
    });
});
