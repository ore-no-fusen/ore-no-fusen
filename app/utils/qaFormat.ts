import {
    type CrystalSpec,
    formatDateYYMMDD,
    joinCrystalSections,
    normalizeLineEndings,
    trimOuterBlankLines,
} from './crystalFormat';

export const QA_SECTION_NAMES = ['問い', '答え', 'きっかけ', '根拠・補足', '改善履歴'] as const;
export const TRACKED_QA_SECTION_NAMES = ['問い', '答え', 'きっかけ', '根拠・補足'] as const;
export const QA_SPEC: CrystalSpec = {
    sectionNames: QA_SECTION_NAMES,
    trackedSectionNames: TRACKED_QA_SECTION_NAMES,
};

export interface QaDraftInput {
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

export function buildQaDraft(input: QaDraftInput): string {
    const date = formatDateYYMMDD(input.date);
    const sourceTitle = input.sourceTitle?.trim() ?? '';
    const answerLines: string[] = [];
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
        answerLines.push(isMarkdownHeadingLine(line) ? stripMarkdownHeadingPrefix(line) : line);
    }

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

    return joinCrystalSections(QA_SPEC, {
        問い: sourceTitle,
        答え: trimOuterBlankLines(answerLines.join('\n')),
        きっかけ: sourceTitle
            ? `- ${date} 付箋『${sourceTitle}』から作成`
            : `- ${date} 付箋から作成`,
        '根拠・補足': supplementLines.join('\n'),
        改善履歴: `- ${date} 初版`,
    });
}
