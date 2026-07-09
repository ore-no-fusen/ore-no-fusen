import {
    buildSourceNoteLine,
    type CrystalSpec,
    formatDateYYMMDD,
    joinCrystalSections,
    normalizeLineEndings,
    trimOuterBlankLines,
} from './crystalFormat';

export const TERM_SECTION_NAMES = ['用語', '一言でいうと', '訳', '意味', '例・使い方', '関連ワード', 'きっかけ', '補足', '改善履歴'] as const;
export const TRACKED_TERM_SECTION_NAMES = ['用語', '一言でいうと', '訳', '意味', '例・使い方', '関連ワード', 'きっかけ', '補足'] as const;
export const TERM_SPEC: CrystalSpec = {
    sectionNames: TERM_SECTION_NAMES,
    trackedSectionNames: TRACKED_TERM_SECTION_NAMES,
};

export interface TermDraftInput {
    sourceTitle?: string | null;
    termName?: string | null;
    sourceBody: string;
    date: Date | string;
}

function stripMarkdownHeadingPrefix(line: string): string {
    return line.replace(/^#{1,6}\s+/, '').trim();
}

function isMarkdownHeadingLine(line: string): boolean {
    return /^#{1,6}\s+/.test(line);
}

function isUrlLine(line: string): boolean {
    return /^https?:\/\/\S+$/i.test(line.trim());
}

function isImageMarkdownLine(line: string): boolean {
    return /^!\[[^\]]*]\([^)]+\)\s*$/.test(line.trim());
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

export function splitTermNameAndBody(sourceBody: string): { name: string; rest: string } {
    const lines = normalizeLineEndings(sourceBody).split('\n');
    const nameLineIndex = lines.findIndex((line) => {
        if (!line.trim()) {
            return false;
        }
        return !isUrlLine(line) && !isImageMarkdownLine(line);
    });

    if (nameLineIndex === -1) {
        return {
            name: '',
            rest: lines.join('\n'),
        };
    }

    const nameLine = lines[nameLineIndex];
    const restLines = lines.filter((_, index) => index !== nameLineIndex);

    return {
        name: isMarkdownHeadingLine(nameLine) ? stripMarkdownHeadingPrefix(nameLine) : nameLine.trim(),
        rest: restLines.join('\n'),
    };
}

function splitSummaryAndMeaning(lines: string[]): { summary: string; meaning: string } {
    const summaryLines: string[] = [];
    const meaningLines: string[] = [];
    let summaryContentLineCount = 0;

    for (const line of lines) {
        if (summaryContentLineCount < 2) {
            if (!line.trim()) {
                continue;
            }
            summaryLines.push(line);
            summaryContentLineCount += 1;
            continue;
        }

        if (meaningLines.length === 0 && !line.trim()) {
            continue;
        }
        meaningLines.push(line);
    }

    return {
        summary: trimOuterBlankLines(summaryLines.join('\n')),
        meaning: trimOuterBlankLines(meaningLines.join('\n')),
    };
}

export function buildTermDraft(input: TermDraftInput): string {
    const date = formatDateYYMMDD(input.date);
    const bodyLines: string[] = [];
    const references: string[] = [];
    const images: string[] = [];

    for (const line of normalizeLineEndings(input.sourceBody).split('\n')) {
        if (isUrlLine(line)) {
            references.push(line);
            continue;
        }
        if (isImageMarkdownLine(line)) {
            images.push(line);
            continue;
        }
        bodyLines.push(isMarkdownHeadingLine(line) ? stripMarkdownHeadingPrefix(line) : line);
    }

    const { summary, meaning } = splitSummaryAndMeaning(bodyLines);
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

    return joinCrystalSections(TERM_SPEC, {
        用語: input.termName?.trim() ?? '',
        一言でいうと: summary,
        訳: '',
        意味: meaning,
        '例・使い方': '',
        関連ワード: '',
        きっかけ: buildSourceNoteLine(date, input.sourceTitle),
        補足: supplementLines.join('\n'),
        改善履歴: `- ${date} 初版`,
    });
}
