import type { CrystalSpec } from './crystalFormat';
import {
    RECIPE_SECTION_NAMES,
    TRACKED_RECIPE_SECTION_NAMES,
} from './recipeFormat';
import {
    QA_SECTION_NAMES,
    TRACKED_QA_SECTION_NAMES,
} from './qaFormat';
import {
    TERM_SECTION_NAMES,
    TRACKED_TERM_SECTION_NAMES,
} from './termFormat';

export type CrystalType = 'recipe' | 'qa' | 'term';
export type CrystalSlot =
    | 'situation'
    | 'steps'
    | 'question'
    | 'answer'
    | 'name'
    | 'gist'
    | 'detail'
    | 'source'
    | 'supplement'
    | 'history'
    | 'free';

export interface CrystalSectionConfig {
    label: string;
    slot: CrystalSlot;
    tracked: boolean;
}

export interface CrystalTypeFormat {
    sections: CrystalSectionConfig[];
}

export interface CrystalFormats {
    version: 1;
    recipe: CrystalTypeFormat;
    qa: CrystalTypeFormat;
    term: CrystalTypeFormat;
}

const TYPE_ORDER: CrystalType[] = ['recipe', 'qa', 'term'];
const KEY_SLOTS: Record<CrystalType, CrystalSlot> = {
    recipe: 'situation',
    qa: 'question',
    term: 'name',
};
const REQUIRED_SLOTS: Record<CrystalType, readonly CrystalSlot[]> = {
    recipe: ['situation', 'steps', 'supplement', 'history'],
    qa: ['question', 'answer', 'source', 'supplement', 'history'],
    term: ['name', 'gist', 'detail', 'source', 'supplement', 'history'],
};

export const DEFAULT_CRYSTAL_FORMATS: CrystalFormats = {
    version: 1,
    recipe: {
        sections: [
            { label: RECIPE_SECTION_NAMES[0], slot: 'situation', tracked: true },
            { label: RECIPE_SECTION_NAMES[1], slot: 'steps', tracked: true },
            { label: RECIPE_SECTION_NAMES[2], slot: 'supplement', tracked: true },
            { label: RECIPE_SECTION_NAMES[3], slot: 'history', tracked: false },
        ],
    },
    qa: {
        sections: [
            { label: QA_SECTION_NAMES[0], slot: 'question', tracked: true },
            { label: QA_SECTION_NAMES[1], slot: 'answer', tracked: true },
            { label: QA_SECTION_NAMES[2], slot: 'source', tracked: true },
            { label: QA_SECTION_NAMES[3], slot: 'supplement', tracked: true },
            { label: QA_SECTION_NAMES[4], slot: 'history', tracked: false },
        ],
    },
    term: {
        sections: [
            { label: TERM_SECTION_NAMES[0], slot: 'name', tracked: true },
            { label: TERM_SECTION_NAMES[1], slot: 'gist', tracked: true },
            { label: TERM_SECTION_NAMES[2], slot: 'free', tracked: true },
            { label: TERM_SECTION_NAMES[3], slot: 'detail', tracked: true },
            { label: TERM_SECTION_NAMES[4], slot: 'free', tracked: true },
            { label: TERM_SECTION_NAMES[5], slot: 'free', tracked: true },
            { label: TERM_SECTION_NAMES[6], slot: 'source', tracked: true },
            { label: TERM_SECTION_NAMES[7], slot: 'supplement', tracked: true },
            { label: TERM_SECTION_NAMES[8], slot: 'history', tracked: false },
        ],
    },
};

function cloneFormat(format: CrystalTypeFormat): CrystalTypeFormat {
    return {
        sections: format.sections.map((section) => ({ ...section })),
    };
}

function cloneDefaults(): CrystalFormats {
    return {
        version: 1,
        recipe: cloneFormat(DEFAULT_CRYSTAL_FORMATS.recipe),
        qa: cloneFormat(DEFAULT_CRYSTAL_FORMATS.qa),
        term: cloneFormat(DEFAULT_CRYSTAL_FORMATS.term),
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSlot(value: unknown): value is CrystalSlot {
    return (
        value === 'situation' ||
        value === 'steps' ||
        value === 'question' ||
        value === 'answer' ||
        value === 'name' ||
        value === 'gist' ||
        value === 'detail' ||
        value === 'source' ||
        value === 'supplement' ||
        value === 'history' ||
        value === 'free'
    );
}

function normalizeTypeFormat(type: CrystalType, input: unknown): CrystalTypeFormat {
    if (!isRecord(input) || !Array.isArray(input.sections)) {
        return cloneFormat(DEFAULT_CRYSTAL_FORMATS[type]);
    }

    const requiredSlots = REQUIRED_SLOTS[type];
    const requiredSlotSet = new Set<CrystalSlot>(requiredSlots);
    const seenRequiredSlots = new Set<CrystalSlot>();
    const sections: CrystalSectionConfig[] = [];

    for (const rawSection of input.sections) {
        if (!isRecord(rawSection) || typeof rawSection.label !== 'string' || rawSection.label.trim() === '') {
            return cloneFormat(DEFAULT_CRYSTAL_FORMATS[type]);
        }
        if (!isSlot(rawSection.slot)) {
            return cloneFormat(DEFAULT_CRYSTAL_FORMATS[type]);
        }
        if (rawSection.slot !== 'free') {
            if (!requiredSlotSet.has(rawSection.slot) || seenRequiredSlots.has(rawSection.slot)) {
                return cloneFormat(DEFAULT_CRYSTAL_FORMATS[type]);
            }
            seenRequiredSlots.add(rawSection.slot);
        }

        sections.push({
            label: rawSection.label,
            slot: rawSection.slot,
            tracked: rawSection.slot === 'history' ? false : rawSection.tracked === false ? false : true,
        });
    }

    if (requiredSlots.some((slot) => !seenRequiredSlots.has(slot))) {
        return cloneFormat(DEFAULT_CRYSTAL_FORMATS[type]);
    }

    const keySlot = KEY_SLOTS[type];
    const keySection = sections.find((section) => section.slot === keySlot);
    const historySection = sections.find((section) => section.slot === 'history');
    const middleSections = sections.filter((section) => section.slot !== keySlot && section.slot !== 'history');

    return {
        sections: [keySection, ...middleSections, historySection].filter(
            (section): section is CrystalSectionConfig => section !== undefined,
        ),
    };
}

export function normalizeCrystalFormats(input: unknown): CrystalFormats {
    const defaults = cloneDefaults();
    if (!isRecord(input)) {
        return defaults;
    }

    const normalized: CrystalFormats = {
        version: 1,
        recipe: defaults.recipe,
        qa: defaults.qa,
        term: defaults.term,
    };

    for (const type of TYPE_ORDER) {
        normalized[type] = normalizeTypeFormat(type, input[type]);
    }

    return normalized;
}

export function configToSpec(format: CrystalTypeFormat): CrystalSpec {
    return {
        sectionNames: format.sections.map((section) => section.label),
        trackedSectionNames: format.sections
            .filter((section) => section.tracked)
            .map((section) => section.label),
    };
}
