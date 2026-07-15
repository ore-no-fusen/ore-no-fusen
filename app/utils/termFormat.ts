import {
    type CrystalSpec,
    formatDateYYMMDD,
    joinCrystalSections,
    normalizeLineEndings,
    trimOuterBlankLines,
} from './crystalFormat';
import { configToSpec, type CrystalTypeFormat } from './crystalFormatConfigCore';

export const TERM_SECTION_NAMES = ['用語', '一言でいうと', '原語・訳', '意味', '関連ワード', 'きっかけ', '補足', '改善履歴'] as const;
export const TRACKED_TERM_SECTION_NAMES = ['用語', '一言でいうと', '原語・訳', '意味', '関連ワード', 'きっかけ', '補足'] as const;
export const TERM_SPEC: CrystalSpec = {
    sectionNames: TERM_SECTION_NAMES,
    trackedSectionNames: TRACKED_TERM_SECTION_NAMES,
};

const DEFAULT_TERM_FORMAT: CrystalTypeFormat = {
    sections: [
        { label: TERM_SECTION_NAMES[0], slot: 'name', tracked: true },
        { label: TERM_SECTION_NAMES[1], slot: 'gist', tracked: true },
        { label: TERM_SECTION_NAMES[2], slot: 'free', tracked: true },
        { label: TERM_SECTION_NAMES[3], slot: 'detail', tracked: true },
        { label: TERM_SECTION_NAMES[4], slot: 'free', tracked: true },
        { label: TERM_SECTION_NAMES[5], slot: 'source', tracked: true },
        { label: TERM_SECTION_NAMES[6], slot: 'supplement', tracked: true },
        { label: TERM_SECTION_NAMES[7], slot: 'history', tracked: false },
    ],
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
    let hasSummaryContent = false;

    for (const line of lines) {
        if (!hasSummaryContent) {
            if (!line.trim()) {
                continue;
            }
            summaryLines.push(line);
            hasSummaryContent = true;
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

export function buildTermDraft(input: TermDraftInput, format: CrystalTypeFormat = DEFAULT_TERM_FORMAT): string {
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
        supplementLines.push('## 参考', ...uniqueReferences.map((line) => `- ${line}`));
    }
    if (uniqueImages.length > 0) {
        supplementLines.push('## 画像', ...uniqueImages.map((line) => `- ${line}`));
    }

    const contentBySlot = {
        name: input.termName?.trim() ?? '',
        gist: summary,
        detail: meaning,
        source: '',
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
