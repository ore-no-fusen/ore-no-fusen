import {
    buildSourceNoteLine,
    type CrystalSpec,
    formatDateYYMMDD,
    joinCrystalSections,
    normalizeLineEndings,
    trimOuterBlankLines,
} from './crystalFormat';

export const TERM_SECTION_NAMES = ['意味', '例・使い方', 'きっかけ', '補足', '改善履歴'] as const;
export const TRACKED_TERM_SECTION_NAMES = ['意味', '例・使い方', 'きっかけ', '補足'] as const;
export const TERM_SPEC: CrystalSpec = {
    sectionNames: TERM_SECTION_NAMES,
    trackedSectionNames: TRACKED_TERM_SECTION_NAMES,
};

export interface TermDraftInput {
    sourceTitle?: string | null;
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

function splitMeaningAndUsage(lines: string[]): { meaning: string; usage: string } {
    const meaningLines: string[] = [];
    const usageLines: string[] = [];
    let meaningContentLineCount = 0;

    for (const line of lines) {
        if (meaningContentLineCount < 2) {
            if (!line.trim()) {
                continue;
            }
            meaningLines.push(line);
            meaningContentLineCount += 1;
            continue;
        }

        if (usageLines.length === 0 && !line.trim()) {
            continue;
        }
        usageLines.push(line);
    }

    return {
        meaning: trimOuterBlankLines(meaningLines.join('\n')),
        usage: trimOuterBlankLines(usageLines.join('\n')),
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

    const { meaning, usage } = splitMeaningAndUsage(bodyLines);
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
        意味: meaning,
        '例・使い方': usage,
        きっかけ: buildSourceNoteLine(date, input.sourceTitle),
        補足: supplementLines.join('\n'),
        改善履歴: `- ${date} 初版`,
    });
}
