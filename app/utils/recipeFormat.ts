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

const SECTION_NAME_SET = new Set<string>(RECIPE_SECTION_NAMES);

function normalizeLineEndings(text: string): string {
    return text.replace(/\r\n?/g, '\n');
}

function trimOuterBlankLines(text: string): string {
    return normalizeLineEndings(text).replace(/^\n+|\n+$/g, '');
}

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

function formatDateYYMMDD(date: Date | string): string {
    if (typeof date === 'string') {
        const match = date.match(/^(\d{2}|\d{4})-(\d{2})-(\d{2})/);
        if (!match) {
            throw new Error('date must be Date or YYYY-MM-DD/YY-MM-DD string');
        }
        const year = match[1].length === 2 ? match[1] : match[1].slice(-2);
        return `${year}-${match[2]}-${match[3]}`;
    }

    const year = String(date.getFullYear()).slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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
    const sections: RecipeSections = {
        こんなとき: '',
        どうする: '',
        補足: '',
        改善履歴: '',
    };
    let currentSection: RecipeSectionName | null = null;
    const currentLines: string[] = [];

    const flush = () => {
        if (currentSection) {
            sections[currentSection] = trimOuterBlankLines(currentLines.join('\n'));
        }
        currentLines.length = 0;
    };

    for (const line of normalizeLineEndings(body).split('\n')) {
        const heading = line.match(/^# (.+)$/);
        if (heading && SECTION_NAME_SET.has(heading[1])) {
            flush();
            currentSection = heading[1] as RecipeSectionName;
            continue;
        }

        if (currentSection) {
            currentLines.push(line);
        }
    }

    flush();
    return sections;
}

export function joinRecipeSections(sections: RecipeSections): string {
    return [
        '# こんなとき',
        '',
        trimOuterBlankLines(sections.こんなとき),
        '',
        '# どうする',
        '',
        trimOuterBlankLines(sections.どうする),
        '',
        '# 補足',
        '',
        trimOuterBlankLines(sections.補足),
        '',
        '# 改善履歴',
        '',
        trimOuterBlankLines(sections.改善履歴),
    ].join('\n');
}

export function getChangedRecipeSections(
    originalBody: string,
    returnedBody: string,
): TrackedRecipeSectionName[] {
    const original = splitRecipeSections(originalBody);
    const returned = splitRecipeSections(returnedBody);

    return TRACKED_RECIPE_SECTION_NAMES.filter(
        (name) => trimOuterBlankLines(original[name]) !== trimOuterBlankLines(returned[name]),
    );
}

export function createImprovementHistoryLine(
    date: Date | string,
    changedSections: readonly TrackedRecipeSectionName[],
): string {
    const orderedSections = TRACKED_RECIPE_SECTION_NAMES.filter((name) => changedSections.includes(name));
    return `- ${formatDateYYMMDD(date)} ${orderedSections.join('・')}`;
}

export function appendImprovementHistoryLine(body: string, historyLine: string): string {
    const normalized = normalizeLineEndings(body);
    const lines = normalized.split('\n');
    const historyHeadingIndex = lines.findIndex((line) => line === '# 改善履歴');

    if (historyHeadingIndex === -1) {
        const base = normalized.trimEnd();
        return `${base}${base ? '\n\n' : ''}# 改善履歴\n\n${historyLine}`;
    }

    const nextHeadingIndex = lines.findIndex((line, index) => index > historyHeadingIndex && /^# .+$/.test(line));
    const insertIndex = nextHeadingIndex === -1 ? lines.length : nextHeadingIndex;
    const before = lines.slice(0, insertIndex).join('\n').trimEnd();
    const after = lines.slice(insertIndex).join('\n');

    return `${before}\n${historyLine}${after ? `\n\n${after}` : ''}`;
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
    const chars = Array.from(name);
    if (chars.length <= maxLength) {
        return name;
    }
    return `${chars.slice(0, maxLength).join('')}…`;
}
