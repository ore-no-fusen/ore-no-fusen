import {
    DEFAULT_CRYSTAL_FORMATS,
    type CrystalFormats,
    type CrystalSectionConfig,
    type CrystalType,
    type CrystalTypeFormat,
} from './crystalFormatConfig';

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

export function addFreeSection(format: CrystalTypeFormat): CrystalTypeFormat {
    const sections = format.sections.map((section) => ({ ...section }));
    const historyIndex = sections.findIndex((section) => section.slot === 'history');
    const insertIndex = historyIndex === -1 ? sections.length : historyIndex;
    sections.splice(insertIndex, 0, { label: '新しい節', slot: 'free', tracked: true });
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

export function resetCrystalTypeFormat(type: CrystalType): CrystalTypeFormat {
    return cloneCrystalTypeFormat(DEFAULT_CRYSTAL_FORMATS[type]);
}
