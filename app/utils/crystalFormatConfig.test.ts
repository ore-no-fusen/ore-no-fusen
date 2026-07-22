import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { getChangedCrystalSections, joinCrystalSections, splitCrystalSections } from './crystalFormat';
import {
    DEFAULT_CRYSTAL_FORMATS,
    configToSpec,
    loadCrystalFormats,
    normalizeCrystalFormats,
    type CrystalFormats,
    type CrystalTypeFormat,
} from './crystalFormatConfig';
import { buildRecipeDraft } from './recipeFormat';
import {
    RECIPE_SECTION_NAMES,
    TRACKED_RECIPE_SECTION_NAMES,
} from './recipeFormat';
import { buildQaDraft, QA_SPEC } from './qaFormat';
import { buildTermDraft, TERM_SPEC } from './termFormat';

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
                    { ...DEFAULT_CRYSTAL_FORMATS.recipe.sections[4], tracked: true },
                    DEFAULT_CRYSTAL_FORMATS.recipe.sections[3],
                    DEFAULT_CRYSTAL_FORMATS.recipe.sections[2],
                    DEFAULT_CRYSTAL_FORMATS.recipe.sections[0],
                ],
            },
        });

        expect(normalized.recipe.sections.map((section) => section.slot)).toEqual([
            'situation',
            'steps',
            'supplement',
            'source',
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

    it('T5 uses renamed config labels while preserving slot contents', () => {
        const recipeFormat: CrystalTypeFormat = {
            sections: [
                { label: 'When', slot: 'situation', tracked: true },
                { label: 'Do', slot: 'steps', tracked: true },
                { label: 'Trigger', slot: 'source', tracked: true },
                { label: 'Extra', slot: 'supplement', tracked: true },
                { label: 'History', slot: 'history', tracked: false },
            ],
        };
        const recipe = splitCrystalSections(configToSpec(recipeFormat), buildRecipeDraft({
            blueBody: 'blue\nhttps://example.com',
            yellowBody: 'yellow1\nyellow2\nyellow3',
            pinkBodies: ['pink'],
            date: '2026-07-10',
        }, recipeFormat));

        expect(recipe.When).toBe('blue');
        expect(recipe.Do).toBe('1. pink');
        expect(recipe.Trigger).toBe('yellow1\nyellow2');
        expect(recipe.Extra).toContain('https://example.com');

        const qaFormat: CrystalTypeFormat = {
            sections: [
                { label: 'Question', slot: 'question', tracked: true },
                { label: 'Answer', slot: 'answer', tracked: true },
                { label: 'Source', slot: 'source', tracked: true },
                { label: 'Evidence', slot: 'supplement', tracked: true },
                { label: 'History', slot: 'history', tracked: false },
            ],
        };
        const qa = splitCrystalSections(configToSpec(qaFormat), buildQaDraft({
            sourceTitle: 'Title',
            sourceBody: '# Heading\nbody\n![img](a.png)',
            date: '2026-07-10',
        }, qaFormat));

        expect(qa.Question).toBe('Heading');
        expect(qa.Answer).toBe('body');
        expect(qa.Source).toBe('');
        expect(qa.Evidence).toContain('![img](a.png)');

        const termFormat: CrystalTypeFormat = {
            sections: [
                { label: 'Term', slot: 'name', tracked: true },
                { label: 'Gist', slot: 'gist', tracked: true },
                { label: 'Meaning', slot: 'detail', tracked: true },
                { label: 'Source', slot: 'source', tracked: true },
                { label: 'Extra', slot: 'supplement', tracked: true },
                { label: 'History', slot: 'history', tracked: false },
            ],
        };
        const term = splitCrystalSections(configToSpec(termFormat), buildTermDraft({
            sourceTitle: 'Source note',
            termName: 'RAG',
            sourceBody: 'one\ntwo\nthree\nhttps://example.com',
            date: '2026-07-10',
        }, termFormat));

        expect(term.Term).toBe('RAG');
        expect(term.Gist).toBe('one');
        expect(term.Meaning).toBe('two\nthree');
        expect(term.Source).toBe('');
        expect(term.Extra).toContain('https://example.com');
    });

    it('T6 shows empty free sections in the editable draft', () => {
        const format: CrystalTypeFormat = {
            sections: [
                { label: 'Question', slot: 'question', tracked: true },
                { label: 'Memo', slot: 'free', tracked: true },
                { label: 'Answer', slot: 'answer', tracked: true },
                { label: 'Source', slot: 'source', tracked: true },
                { label: 'Supplement', slot: 'supplement', tracked: true },
                { label: 'History', slot: 'history', tracked: false },
            ],
        };
        const spec = configToSpec(format);
        const draft = buildQaDraft({
            sourceTitle: 'Title',
            sourceBody: 'body',
            date: '2026-07-10',
        }, format);

        expect(spec.sectionNames).toEqual(['Question', 'Memo', 'Answer', 'Source', 'Supplement', 'History']);
        expect(splitCrystalSections(spec, draft).Memo).toBe('');
        expect(draft.indexOf('# Memo')).toBeLessThan(draft.indexOf('# Answer'));
    });

    it('T7 ignores changes in sections marked tracked=false', () => {
        const format: CrystalTypeFormat = {
            sections: [
                { label: 'Question', slot: 'question', tracked: true },
                { label: 'Answer', slot: 'answer', tracked: false },
                { label: 'Source', slot: 'source', tracked: false },
                { label: 'Supplement', slot: 'supplement', tracked: false },
                { label: 'History', slot: 'history', tracked: false },
            ],
        };
        const spec = configToSpec(format);
        const original = joinCrystalSections(spec, {
            Question: 'same',
            Answer: 'before',
            Source: 'before',
            Supplement: 'before',
            History: '',
        });
        const changed = joinCrystalSections(spec, {
            Question: 'same',
            Answer: 'after',
            Source: 'after',
            Supplement: 'after',
            History: 'after',
        });

        expect(getChangedCrystalSections(spec, original, changed)).toEqual([]);
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
                    { label: 'Trigger', slot: 'source', tracked: true },
                    { label: 'Supplement', slot: 'supplement', tracked: false },
                ],
            },
        }));

        await expect(loadCrystalFormats()).resolves.toMatchObject({
            recipe: {
                sections: [
                    { label: 'Situation', slot: 'situation', tracked: true },
                    { label: 'Steps', slot: 'steps', tracked: true },
                    { label: 'Trigger', slot: 'source', tracked: true },
                    { label: 'Supplement', slot: 'supplement', tracked: false },
                    { label: 'History', slot: 'history', tracked: false },
                ],
            },
            qa: DEFAULT_CRYSTAL_FORMATS.qa,
            term: DEFAULT_CRYSTAL_FORMATS.term,
        });
    });
});
