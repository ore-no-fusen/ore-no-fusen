import {
    DEFAULT_CRYSTAL_FORMATS,
    loadCrystalFormats,
    type CrystalFormats,
    type CrystalSectionConfig,
    type CrystalType,
    type CrystalTypeFormat,
} from './crystalFormatConfig';
import type { Language } from '@/lib/i18n';

export const CRYSTAL_TYPE_LABELS: Record<CrystalType, string> = {
    recipe: '手順',
    qa: 'QA',
    term: '用語',
};

export const ROLE_LABELS: Record<CrystalSectionConfig['slot'], string> = {
    situation: '鍵',
    question: '鍵',
    name: '鍵',
    steps: '本体',
    answer: '本体',
    gist: '本体',
    detail: '詳細',
    source: '出所',
    supplement: '退避',
    history: '履歴',
    free: '自由',
};

const ENGLISH_DEFAULT_LABELS: Record<CrystalType, readonly string[]> = {
    recipe: ['When to Use', 'Steps', 'Source', 'Notes', 'Improvement History'],
    qa: ['Question', 'Answer', 'Source', 'Evidence and Notes', 'Improvement History'],
    term: ['Term', 'In One Line', 'Original / Translation', 'Meaning', 'Related Terms', 'Source', 'Notes', 'Improvement History'],
};

const LEGACY_DEFAULT_LABELS: Readonly<Record<string, string>> = {
    'きっかけ ★ヒロ': 'きっかけ',
    'きっかけ　★ヒロ': 'きっかけ',
};

function cloneCrystalTypeFormat(format: CrystalTypeFormat): CrystalTypeFormat {
    return {
        sections: format.sections.map((section) => ({ ...section })),
    };
}

export function cloneCrystalFormats(formats: CrystalFormats): CrystalFormats {
    return {
        version: 1,
        recipe: cloneCrystalTypeFormat(formats.recipe),
        qa: cloneCrystalTypeFormat(formats.qa),
        term: cloneCrystalTypeFormat(formats.term),
    };
}

export function getLocalizedDefaultCrystalFormats(language: Language): CrystalFormats {
    const defaults = cloneCrystalFormats(DEFAULT_CRYSTAL_FORMATS);
    if (language !== 'en') return defaults;
    for (const type of Object.keys(ENGLISH_DEFAULT_LABELS) as CrystalType[]) {
        defaults[type].sections = defaults[type].sections.map((section, index) => ({
            ...section,
            label: ENGLISH_DEFAULT_LABELS[type][index] ?? section.label,
        }));
    }
    return defaults;
}

export function localizeDefaultCrystalFormatsIfUntouched(formats: CrystalFormats, language: Language): CrystalFormats {
    const localized = cloneCrystalFormats(formats);

    for (const type of Object.keys(ENGLISH_DEFAULT_LABELS) as CrystalType[]) {
        const defaults = DEFAULT_CRYSTAL_FORMATS[type].sections;
        localized[type].sections = localized[type].sections.map((section) => {
            const normalizedLabel = LEGACY_DEFAULT_LABELS[section.label] ?? section.label;
            const defaultIndex = section.slot === 'free'
                ? defaults.findIndex((candidate, index) => candidate.slot === 'free' && (
                    candidate.label === normalizedLabel || ENGLISH_DEFAULT_LABELS[type][index] === normalizedLabel
                ))
                : defaults.findIndex((candidate) => candidate.slot === section.slot);
            const defaultSection = defaults[defaultIndex];
            const englishDefaultLabel = ENGLISH_DEFAULT_LABELS[type][defaultIndex];
            if (!defaultSection || section.slot !== defaultSection.slot || (
                normalizedLabel !== defaultSection.label && normalizedLabel !== englishDefaultLabel
            )) {
                return section;
            }
            return {
                ...section,
                label: language === 'en'
                    ? englishDefaultLabel ?? normalizedLabel
                    : defaultSection.label,
            };
        });
    }
    return localized;
}

export async function loadLocalizedCrystalFormats(language: Language): Promise<CrystalFormats> {
    return localizeDefaultCrystalFormatsIfUntouched(await loadCrystalFormats(), language);
}

export function addFreeSection(format: CrystalTypeFormat, label = '新しい節'): CrystalTypeFormat {
    const sections = format.sections.map((section) => ({ ...section }));
    const historyIndex = sections.findIndex((section) => section.slot === 'history');
    const insertIndex = historyIndex === -1 ? sections.length : historyIndex;
    sections.splice(insertIndex, 0, { label, slot: 'free', tracked: true });
    return { sections };
}

export function addNamedFreeSection(format: CrystalTypeFormat, label: string): CrystalTypeFormat {
    const sections = format.sections.map((section) => ({ ...section }));
    if (sections.some((section) => section.label === label)) {
        return { sections };
    }
    const historyIndex = sections.findIndex((section) => section.slot === 'history');
    const insertIndex = historyIndex === -1 ? sections.length : historyIndex;
    sections.splice(insertIndex, 0, { label, slot: 'free', tracked: true });
    return { sections };
}

export function removeFreeSection(format: CrystalTypeFormat, index: number): CrystalTypeFormat {
    const sections = format.sections.map((section) => ({ ...section }));
    if (sections[index]?.slot !== 'free') {
        return { sections };
    }
    sections.splice(index, 1);
    return { sections };
}

export function moveFreeSection(
    format: CrystalTypeFormat,
    index: number,
    direction: 'up' | 'down',
): CrystalTypeFormat {
    const sections = format.sections.map((section) => ({ ...section }));
    if (sections[index]?.slot !== 'free') {
        return { sections };
    }

    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (nextIndex <= 0 || nextIndex >= sections.length) {
        return { sections };
    }
    if (sections[nextIndex]?.slot === 'history') {
        return { sections };
    }

    [sections[index], sections[nextIndex]] = [sections[nextIndex], sections[index]];
    return { sections };
}

export function resetCrystalTypeFormat(type: CrystalType, language: Language = 'ja'): CrystalTypeFormat {
    return cloneCrystalTypeFormat(getLocalizedDefaultCrystalFormats(language)[type]);
}
