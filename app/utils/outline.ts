export const OUTLINE_INDENT = 2;

export type OutlineLine = {
    index: number;
    depth: number;
    content: string;
    eligible: boolean;
    hasChildren: boolean;
    hidden: boolean;
};

function leadingSpaces(line: string): number {
    return line.match(/^ */)?.[0].length ?? 0;
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
    let inCodeFence = false;

    for (let index = 0; index < source.length; index += 1) {
        const line = source[index];
        const fence = line.trim().startsWith('```');
        const eligible = isOutlineEligibleLine(line, inCodeFence || fence);
        result.push({
            index,
            depth: eligible ? Math.floor(leadingSpaces(line) / OUTLINE_INDENT) : 0,
            content: line.slice(eligible ? Math.floor(leadingSpaces(line) / OUTLINE_INDENT) * OUTLINE_INDENT : 0),
            eligible,
            hasChildren: false,
            hidden: false,
        });
        if (fence) inCodeFence = !inCodeFence;
    }

    for (let index = 0; index < result.length; index += 1) {
        const current = result[index];
        if (!current.eligible) continue;
        for (let next = index + 1; next < result.length; next += 1) {
            if (!result[next].eligible) break;
            if (result[next].depth <= current.depth) break;
            current.hasChildren = true;
            break;
        }

        for (let parent = index - 1; parent >= 0; parent -= 1) {
            const candidate = result[parent];
            if (!candidate.eligible) break;
            if (candidate.depth < current.depth) {
                if (collapsed.has(candidate.index)) current.hidden = true;
                if (candidate.depth === 0) break;
            }
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

export function indentOutlineLines(body: string, fromLine: number, toLine: number, direction: 1 | -1): string {
    const lines = body.split('\n');
    for (let index = fromLine; index <= toLine && index < lines.length; index += 1) {
        if (!isOutlineEligibleLine(lines[index])) continue;
        if (direction === 1) lines[index] = `${' '.repeat(OUTLINE_INDENT)}${lines[index]}`;
        else if (lines[index].startsWith(' '.repeat(OUTLINE_INDENT))) lines[index] = lines[index].slice(OUTLINE_INDENT);
        else if (lines[index].startsWith(' ')) lines[index] = lines[index].slice(1);
    }
    return lines.join('\n');
}

export function moveOutlineSubtree(body: string, sourceLine: number, targetLine: number): { body: string; movedRange: [number, number] } {
    const parsed = parseOutline(body);
    const source = parsed[sourceLine];
    if (!source?.eligible || sourceLine === targetLine) return { body, movedRange: [sourceLine, sourceLine] };
    let end = sourceLine + 1;
    while (end < parsed.length && parsed[end].eligible && parsed[end].depth > source.depth) end += 1;
    if (targetLine >= sourceLine && targetLine < end) return { body, movedRange: [sourceLine, end - 1] };

    const lines = body.split('\n');
    const moving = lines.splice(sourceLine, end - sourceLine);
    let insertion = targetLine;
    if (targetLine > sourceLine) insertion -= moving.length;
    const targetDepth = parseOutline(lines.join('\n'))[Math.max(0, insertion)]?.depth ?? 0;
    const depthDelta = targetDepth - source.depth;
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
