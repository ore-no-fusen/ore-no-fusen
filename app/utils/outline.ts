import { markdownLanguage } from '@codemirror/lang-markdown';

export const OUTLINE_INDENT = 2;

export type OutlineLine = {
    index: number;
    depth: number;
    content: string;
    kind: 'plain' | 'heading' | 'list';
    eligible: boolean;
    hasChildren: boolean;
    subtreeEnd: number;
    hidden: boolean;
};

function leadingSpaces(line: string): number {
    return line.match(/^ */)?.[0].length ?? 0;
}

function isVisibleBulletLine(line: string): boolean {
    const trimmed = line.trimStart();
    return trimmed.startsWith('・') || /^(?:[-*+]\s+|\d+\.\s+)/.test(trimmed);
}

export function isOutlineEligibleLine(line: string, inCodeFence = false): boolean {
    const trimmed = line.trim();
    if (inCodeFence || !trimmed) return false;
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) return false;
    if (/^!\[[^\]]*\]\([^)]+\)$/.test(trimmed)) return false;
    return true;
}

export function parseOutline(body: string, collapsedLines: readonly number[] = []): OutlineLine[] {
    const source = body.split('\n');
    const collapsed = new Set(collapsedLines);
    const result: OutlineLine[] = [];
    const lineStarts: number[] = [];
    let offset = 0;
    let inCodeFence = false;

    for (let index = 0; index < source.length; index += 1) {
        const line = source[index];
        lineStarts.push(offset);
        offset += line.length + 1;
        const fence = line.trim().startsWith('```');
        const eligible = isOutlineEligibleLine(line, inCodeFence || fence);
        const spaces = eligible ? leadingSpaces(line) : 0;
        result.push({
            index,
            depth: Math.floor(spaces / OUTLINE_INDENT),
            content: line.slice(spaces),
            kind: 'plain',
            eligible,
            hasChildren: false,
            subtreeEnd: index,
            hidden: false,
        });
        if (fence) inCodeFence = !inCodeFence;
    }

    // 「題名 + 箇条書き」は、題名を親、連続する箇条書きを子として扱う。
    // 直接入力した「・」と、表示時に「・」となるMarkdownリストの両方が対象。
    // 本文の記号や保存形式は変えず、表示時の階層だけを導出する。
    for (let index = 0; index < result.length - 1; index += 1) {
        const parent = result[index];
        if (!parent.eligible || isVisibleBulletLine(source[index])) continue;
        let next = index + 1;
        if (!result[next].eligible || !isVisibleBulletLine(source[next])) continue;
        while (next < result.length && result[next].eligible && isVisibleBulletLine(source[next])) {
            result[next].depth = parent.depth + 1 + Math.floor(leadingSpaces(source[next]) / OUTLINE_INDENT);
            next += 1;
        }
    }

    // 既存仕様: 通常行は行頭2スペースを1階層として扱う。
    for (let index = 0; index < result.length; index += 1) {
        const current = result[index];
        if (!current.eligible) continue;
        let end = index;
        for (let next = index + 1; next < result.length; next += 1) {
            if (!result[next].eligible || result[next].depth <= current.depth) break;
            end = next;
        }
        current.subtreeEnd = end;
    }

    const lineAtOffset = (position: number): number => {
        let low = 0;
        let high = lineStarts.length - 1;
        while (low <= high) {
            const middle = Math.floor((low + high) / 2);
            if (lineStarts[middle] <= position) low = middle + 1;
            else high = middle - 1;
        }
        return Math.max(0, Math.min(source.length - 1, high));
    };

    // Markdownの構文として成立したリスト項目は、ListItemの実範囲を優先する。
    const tree = markdownLanguage.parser.parse(body);
    const cursor = tree.cursor();
    do {
        if (cursor.name === 'ListItem') {
            const start = lineAtOffset(cursor.from);
            let end = lineAtOffset(Math.max(cursor.from, cursor.to - 1));
            for (let next = start + 1; next <= end; next += 1) {
                const isNextTitle = result[next].eligible
                    && !isVisibleBulletLine(source[next])
                    && next + 1 < result.length
                    && isVisibleBulletLine(source[next + 1]);
                if (isNextTitle) {
                    end = next - 1;
                    break;
                }
            }
            const line = result[start];
            line.kind = 'list';
            line.subtreeEnd = Math.max(line.subtreeEnd, end);
        }
    } while (cursor.next());

    // 見出しは構文木上では兄弟なので、次の同レベル以上の見出しまでを節として補う。
    const headings: { line: number; level: number }[] = [];
    const headingCursor = tree.cursor();
    do {
        const match = /^ATXHeading([1-6])$/.exec(headingCursor.name);
        if (match) {
            headings.push({
                line: lineAtOffset(headingCursor.from),
                level: Number.parseInt(match[1], 10),
            });
        }
    } while (headingCursor.next());

    headings.forEach((heading, headingIndex) => {
        let end = result.length - 1;
        for (let next = headingIndex + 1; next < headings.length; next += 1) {
            if (headings[next].level <= heading.level) {
                end = headings[next].line - 1;
                break;
            }
        }
        while (end > heading.line && source[end].trim() === '') end -= 1;
        const line = result[heading.line];
        line.kind = 'heading';
        line.depth = heading.level - 1;
        line.subtreeEnd = Math.max(heading.line, end);
    });

    result.forEach(line => {
        line.hasChildren = line.subtreeEnd > line.index;
    });

    for (const parentIndex of collapsed) {
        const parent = result[parentIndex];
        if (!parent?.hasChildren) continue;
        for (let child = parentIndex + 1; child <= parent.subtreeEnd; child += 1) {
            result[child].hidden = true;
        }
    }

    return result;
}

export function readCollapsedLines(frontmatter: string): number[] {
    const raw = frontmatter.match(/^outlineCollapsed:\s*\[([^\]]*)\]\s*$/m)?.[1];
    if (!raw?.trim()) return [];
    return [...new Set(raw.split(',')
        .map(value => Number.parseInt(value.trim(), 10))
        .filter(value => Number.isInteger(value) && value >= 0))]
        .sort((a, b) => a - b);
}

export function formatCollapsedLines(lines: readonly number[]): string {
    const normalized = [...new Set(lines.filter(value => Number.isInteger(value) && value >= 0))]
        .sort((a, b) => a - b);
    return `[${normalized.join(', ')}]`;
}

export function remapCollapsedLines(previousBody: string, nextBody: string, collapsedLines: readonly number[]): number[] {
    const previous = previousBody.split('\n');
    const next = nextBody.split('\n');
    if (previous.length === next.length) return collapsedLines.filter(index => index < next.length);

    const used = new Set<number>();
    const mapped: number[] = [];
    for (const oldIndex of collapsedLines) {
        const text = previous[oldIndex];
        if (text === undefined) continue;
        let best = -1;
        let distance = Number.POSITIVE_INFINITY;
        next.forEach((candidate, index) => {
            if (used.has(index) || candidate !== text) return;
            const candidateDistance = Math.abs(index - oldIndex);
            if (candidateDistance < distance) {
                best = index;
                distance = candidateDistance;
            }
        });
        if (best >= 0) {
            used.add(best);
            mapped.push(best);
        } else if (next.length > 0) {
            // A parent can be renamed and split in one edit. Keep its state at the
            // nearest surviving line instead of silently expanding it.
            let fallback = Math.min(oldIndex, next.length - 1);
            while (fallback < next.length && used.has(fallback)) fallback += 1;
            if (fallback >= next.length) {
                fallback = Math.min(oldIndex, next.length - 1);
                while (fallback >= 0 && used.has(fallback)) fallback -= 1;
            }
            if (fallback >= 0) {
                used.add(fallback);
                mapped.push(fallback);
            }
        }
    }
    return mapped.sort((a, b) => a - b);
}

export function moveOutlineSubtree(body: string, sourceLine: number, targetLine: number): { body: string; movedRange: [number, number] } {
    const parsed = parseOutline(body);
    const source = parsed[sourceLine];
    if (!source?.eligible || sourceLine === targetLine) return { body, movedRange: [sourceLine, sourceLine] };
    const end = source.subtreeEnd + 1;
    if (targetLine >= sourceLine && targetLine < end) return { body, movedRange: [sourceLine, end - 1] };

    const lines = body.split('\n');
    const moving = lines.splice(sourceLine, end - sourceLine);
    let insertion = targetLine;
    if (targetLine > sourceLine) insertion -= moving.length;
    const targetDepth = parseOutline(lines.join('\n'))[Math.max(0, insertion)]?.depth ?? 0;
    // Markdown見出し・リストは構文記号を自動改変せず、まとまりだけを移動する。
    const depthDelta = source.kind === 'plain' ? targetDepth - source.depth : 0;
    const adjusted = moving.map(line => {
        if (depthDelta === 0) return line;
        if (depthDelta > 0) return `${' '.repeat(depthDelta * OUTLINE_INDENT)}${line}`;
        return line.slice(Math.min(leadingSpaces(line), Math.abs(depthDelta) * OUTLINE_INDENT));
    });
    lines.splice(insertion, 0, ...adjusted);
    return { body: lines.join('\n'), movedRange: [insertion, insertion + adjusted.length - 1] };
}

export function moveCollapsedLines(
    collapsedLines: readonly number[],
    sourceLine: number,
    sourceEnd: number,
    targetLine: number,
): number[] {
    const size = sourceEnd - sourceLine + 1;
    if (targetLine >= sourceLine && targetLine <= sourceEnd) return [...collapsedLines];
    const insertion = targetLine > sourceLine ? targetLine - size : targetLine;
    return collapsedLines.map(index => {
        if (index >= sourceLine && index <= sourceEnd) return insertion + (index - sourceLine);
        if (targetLine > sourceLine && index > sourceEnd && index < targetLine) return index - size;
        if (targetLine < sourceLine && index >= targetLine && index < sourceLine) return index + size;
        return index;
    }).sort((a, b) => a - b);
}
