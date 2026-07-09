import {
    buildSourceNoteLine,
    type CrystalSpec,
    formatDateYYMMDD,
    joinCrystalSections,
    normalizeLineEndings,
    trimOuterBlankLines,
} from './crystalFormat';
import { configToSpec, type CrystalTypeFormat } from './crystalFormatConfigCore';

export const QA_SECTION_NAMES = ['問い', '答え', 'きっかけ', '根拠・補足', '改善履歴'] as const;
export const TRACKED_QA_SECTION_NAMES = ['問い', '答え', 'きっかけ', '根拠・補足'] as const;
export const QA_SPEC: CrystalSpec = {
    sectionNames: QA_SECTION_NAMES,
    trackedSectionNames: TRACKED_QA_SECTION_NAMES,
};

const DEFAULT_QA_FORMAT: CrystalTypeFormat = {
    sections: [
        { label: QA_SECTION_NAMES[0], slot: 'question', tracked: true },
        { label: QA_SECTION_NAMES[1], slot: 'answer', tracked: true },
        { label: QA_SECTION_NAMES[2], slot: 'source', tracked: true },
        { label: QA_SECTION_NAMES[3], slot: 'supplement', tracked: true },
        { label: QA_SECTION_NAMES[4], slot: 'history', tracked: false },
    ],
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

export function buildQaDraft(input: QaDraftInput, format: CrystalTypeFormat = DEFAULT_QA_FORMAT): string {
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

    const contentBySlot = {
        question: sourceTitle,
        answer: trimOuterBlankLines(answerLines.join('\n')),
        source: buildSourceNoteLine(date, sourceTitle),
        supplement: supplementLines.join('\n'),
        history: `- ${date} 初版`,
    };
    const sections = Object.fromEntries(format.sections.map((section) => [section.label, '']));
    for (const section of format.sections) {
        if (section.slot in contentBySlot) {
            sections[section.label] = contentBySlot[section.slot as keyof typeof contentBySlot];
        }
    }

    return joinCrystalSections(configToSpec(format), sections);
}
