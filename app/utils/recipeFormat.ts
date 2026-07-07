import {
    appendImprovementHistoryLine as appendCrystalImprovementHistoryLine,
    createImprovementHistoryLine as createCrystalImprovementHistoryLine,
    type CrystalSpec,
    formatDateYYMMDD,
    getChangedCrystalSections,
    joinCrystalSections,
    normalizeLineEndings,
    splitCrystalSections,
    trimOuterBlankLines,
    truncateCrystalName,
} from './crystalFormat';

export const RECIPE_SECTION_NAMES = ['こんなとき', 'どうする', '補足', '改善履歴'] as const;
export const TRACKED_RECIPE_SECTION_NAMES = ['こんなとき', 'どうする', '補足'] as const;

export type RecipeSectionName = (typeof RECIPE_SECTION_NAMES)[number];
export type TrackedRecipeSectionName = (typeof TRACKED_RECIPE_SECTION_NAMES)[number];

export type RecipeSections = Record<RecipeSectionName, string>;

export interface RecipeDraftInput {
    blueBody: string;
    yellowBody?: string | null;
    pinkBodies?: string[];
    date: Date | string;
}

const RECIPE_SPEC: CrystalSpec = {
    sectionNames: RECIPE_SECTION_NAMES,
    trackedSectionNames: TRACKED_RECIPE_SECTION_NAMES,
};

function nonEmptyLines(text: string): string[] {
    return normalizeLineEndings(text)
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}

function stripMarkdownHeadingPrefix(line: string): string {
    return line.replace(/^#{1,6}\s+/, '').trim();
}

function nonEmptyMaterialLines(text: string): string[] {
    return nonEmptyLines(text).map(stripMarkdownHeadingPrefix).filter((line) => line.length > 0);
}

function isUrlLine(line: string): boolean {
    return /^https?:\/\/\S+$/i.test(line.trim());
}

function isImageMarkdownLine(line: string): boolean {
    return /^!\[[^\]]*]\([^)]+\)\s*$/.test(line.trim());
}

function stripListPrefix(line: string): string {
    return line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').trim();
}

function uniqueNonEmpty(lines: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const line of lines) {
        const normalized = line.trim();
        if (!normalized || seen.has(normalized)) {
            continue;
        }
        seen.add(normalized);
        result.push(normalized);
    }

    return result;
}

export function splitRecipeSections(body: string): RecipeSections {
    return splitCrystalSections(RECIPE_SPEC, body) as RecipeSections;
}

export function joinRecipeSections(sections: RecipeSections): string {
    return joinCrystalSections(RECIPE_SPEC, sections);
}

export function getChangedRecipeSections(
    originalBody: string,
    returnedBody: string,
): TrackedRecipeSectionName[] {
    return getChangedCrystalSections(RECIPE_SPEC, originalBody, returnedBody) as TrackedRecipeSectionName[];
}

export function createImprovementHistoryLine(
    date: Date | string,
    changedSections: readonly TrackedRecipeSectionName[],
): string {
    return createCrystalImprovementHistoryLine(RECIPE_SPEC, date, changedSections);
}

export function appendImprovementHistoryLine(body: string, historyLine: string): string {
    return appendCrystalImprovementHistoryLine(body, historyLine);
}

export function buildRecipeDraft(input: RecipeDraftInput): string {
    const yellowLines = nonEmptyMaterialLines(input.yellowBody ?? '');
    const blueLines = nonEmptyMaterialLines(input.blueBody);
    // こんなとき = 黄のみ（無ければ空。青は こんなとき に回さない）
    const situationLines = yellowLines.slice(0, 2);
    const references: string[] = [];
    const images: string[] = [];
    const pinkStepCandidates: string[] = [];
    const blueStepCandidates: string[] = [];

    const collectLine = (line: string, stepCandidates: string[]) => {
        if (isUrlLine(line)) {
            references.push(line);
            return;
        }
        if (isImageMarkdownLine(line)) {
            images.push(line);
            return;
        }
        stepCandidates.push(stripListPrefix(line));
    };

    // どうする = 青（起点なので優先して先頭）＋ 桃。青は常にここに入る
    for (const line of blueLines) {
        collectLine(line, blueStepCandidates);
    }
    for (const line of (input.pinkBodies ?? []).flatMap(nonEmptyMaterialLines)) {
        collectLine(line, pinkStepCandidates);
    }

    const blueSteps = uniqueNonEmpty(blueStepCandidates);
    const pinkSteps = uniqueNonEmpty(pinkStepCandidates);
    const steps = uniqueNonEmpty([...blueSteps, ...pinkSteps]).slice(0, 7);
    const supplementLines: string[] = [];
    const uniqueReferences = uniqueNonEmpty(references);
    const uniqueImages = uniqueNonEmpty(images);

    if (uniqueReferences.length > 0) {
        supplementLines.push('## 参考', '', ...uniqueReferences.map((line) => `- ${line}`));
    }
    if (uniqueImages.length > 0) {
        if (supplementLines.length > 0) {
            supplementLines.push('');
        }
        supplementLines.push('## 画像', '', ...uniqueImages.map((line) => `- ${line}`));
    }

    return [
        '# こんなとき',
        '',
        situationLines.join('\n'),
        '',
        '# どうする',
        '',
        ...steps.map((step, index) => `${index + 1}. ${step}`),
        '',
        '# 補足',
        '',
        supplementLines.join('\n'),
        '',
        '# 改善履歴',
        '',
        `- ${formatDateYYMMDD(input.date)} 初版`,
    ].join('\n');
}

export function truncateRecipeName(name: string, maxLength = 10): string {
    return truncateCrystalName(name, maxLength);
}
