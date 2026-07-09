import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import {
    DEFAULT_CRYSTAL_FORMATS,
    configToSpec,
    loadCrystalFormats,
    normalizeCrystalFormats,
    type CrystalFormats,
} from './crystalFormatConfig';
import {
    RECIPE_SECTION_NAMES,
    TRACKED_RECIPE_SECTION_NAMES,
} from './recipeFormat';
import { QA_SPEC } from './qaFormat';
import { TERM_SPEC } from './termFormat';

vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);

describe('crystalFormatConfig', () => {
    beforeEach(() => {
        mockedInvoke.mockReset();
    });

    it('T1 converts defaults to existing specs', () => {
        expect(configToSpec(DEFAULT_CRYSTAL_FORMATS.recipe)).toEqual({
            sectionNames: RECIPE_SECTION_NAMES,
            trackedSectionNames: TRACKED_RECIPE_SECTION_NAMES,
        });
        expect(configToSpec(DEFAULT_CRYSTAL_FORMATS.qa)).toEqual(QA_SPEC);
        expect(configToSpec(DEFAULT_CRYSTAL_FORMATS.term)).toEqual(TERM_SPEC);
    });

    it('T2 falls back per type and normalizes key/history sections', () => {
        expect(normalizeCrystalFormats(null)).toEqual(DEFAULT_CRYSTAL_FORMATS);

        expect(
            normalizeCrystalFormats({
                recipe: {
                    sections: DEFAULT_CRYSTAL_FORMATS.recipe.sections.filter(
                        (section) => section.slot !== 'steps',
                    ),
                },
                qa: { sections: [] },
                term: { sections: [] },
            }).recipe,
        ).toEqual(DEFAULT_CRYSTAL_FORMATS.recipe);

        expect(
            normalizeCrystalFormats({
                recipe: {
                    sections: [
                        ...DEFAULT_CRYSTAL_FORMATS.recipe.sections.slice(0, 1),
                        { label: 'bad', slot: 'question', tracked: true },
                        ...DEFAULT_CRYSTAL_FORMATS.recipe.sections.slice(1),
                    ],
                },
            }).recipe,
        ).toEqual(DEFAULT_CRYSTAL_FORMATS.recipe);

        expect(
            normalizeCrystalFormats({
                qa: {
                    sections: [
                        ...DEFAULT_CRYSTAL_FORMATS.qa.sections,
                        { label: 'duplicate', slot: 'answer', tracked: true },
                    ],
                },
            }).qa,
        ).toEqual(DEFAULT_CRYSTAL_FORMATS.qa);

        expect(
            normalizeCrystalFormats({
                term: {
                    sections: DEFAULT_CRYSTAL_FORMATS.term.sections.map((section) =>
                        section.slot === 'gist' ? { ...section, label: '' } : section,
                    ),
                },
            }).term,
        ).toEqual(DEFAULT_CRYSTAL_FORMATS.term);

        const normalized = normalizeCrystalFormats({
            recipe: {
                sections: [
                    DEFAULT_CRYSTAL_FORMATS.recipe.sections[1],
                    { ...DEFAULT_CRYSTAL_FORMATS.recipe.sections[3], tracked: true },
                    DEFAULT_CRYSTAL_FORMATS.recipe.sections[2],
                    DEFAULT_CRYSTAL_FORMATS.recipe.sections[0],
                ],
            },
        });

        expect(normalized.recipe.sections.map((section) => section.slot)).toEqual([
            'situation',
            'steps',
            'supplement',
            'history',
        ]);
        expect(normalized.recipe.sections.at(-1)?.tracked).toBe(false);
    });

    it('T3 preserves label order, tracked extraction, and free positions', () => {
        const input: CrystalFormats = {
            version: 1,
            recipe: DEFAULT_CRYSTAL_FORMATS.recipe,
            qa: {
                sections: [
                    { label: 'Q', slot: 'question', tracked: true },
                    { label: 'A', slot: 'answer', tracked: false },
                    { label: 'Free 1', slot: 'free', tracked: true },
                    { label: 'Source', slot: 'source', tracked: true },
                    { label: 'Free 2', slot: 'free', tracked: false },
                    { label: 'Supplement', slot: 'supplement', tracked: 'yes' as unknown as boolean },
                    { label: 'History', slot: 'history', tracked: true },
                ],
            },
            term: DEFAULT_CRYSTAL_FORMATS.term,
        };

        const normalized = normalizeCrystalFormats(input);

        expect(normalized.qa.sections.map((section) => section.slot)).toEqual([
            'question',
            'answer',
            'free',
            'source',
            'free',
            'supplement',
            'history',
        ]);
        expect(configToSpec(normalized.qa)).toEqual({
            sectionNames: ['Q', 'A', 'Free 1', 'Source', 'Free 2', 'Supplement', 'History'],
            trackedSectionNames: ['Q', 'Free 1', 'Source', 'Supplement'],
        });
    });

    it('T8 loads persisted formats and absorbs missing, failed, and broken input', async () => {
        mockedInvoke.mockResolvedValueOnce(null);
        await expect(loadCrystalFormats()).resolves.toEqual(DEFAULT_CRYSTAL_FORMATS);

        mockedInvoke.mockRejectedValueOnce(new Error('unavailable'));
        await expect(loadCrystalFormats()).resolves.toEqual(DEFAULT_CRYSTAL_FORMATS);

        mockedInvoke.mockResolvedValueOnce('{');
        await expect(loadCrystalFormats()).resolves.toEqual(DEFAULT_CRYSTAL_FORMATS);

        mockedInvoke.mockResolvedValueOnce(JSON.stringify({
            version: 1,
            recipe: {
                sections: [
                    { label: 'Steps', slot: 'steps', tracked: true },
                    { label: 'History', slot: 'history', tracked: true },
                    { label: 'Situation', slot: 'situation', tracked: true },
                    { label: 'Supplement', slot: 'supplement', tracked: false },
                ],
            },
        }));

        await expect(loadCrystalFormats()).resolves.toMatchObject({
            recipe: {
                sections: [
                    { label: 'Situation', slot: 'situation', tracked: true },
                    { label: 'Steps', slot: 'steps', tracked: true },
                    { label: 'Supplement', slot: 'supplement', tracked: false },
                    { label: 'History', slot: 'history', tracked: false },
                ],
            },
            qa: DEFAULT_CRYSTAL_FORMATS.qa,
            term: DEFAULT_CRYSTAL_FORMATS.term,
        });
    });
});
