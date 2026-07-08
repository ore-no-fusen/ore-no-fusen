export interface CrystalSpec {
    /** 文書順の全セクション名（最後は必ず '改善履歴'） */
    sectionNames: readonly string[];
    /** 改善履歴の変更判定対象（= sectionNames から '改善履歴' を除いたもの） */
    trackedSectionNames: readonly string[];
}

export const IMPROVEMENT_HISTORY_SECTION = '改善履歴';

export function normalizeLineEndings(text: string): string {
    return text.replace(/\r\n?/g, '\n');
}

export function trimOuterBlankLines(text: string): string {
    return normalizeLineEndings(text).replace(/^\n+|\n+$/g, '');
}

export function formatDateYYMMDD(date: Date | string): string {
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

export function buildSourceNoteLine(date: Date | string, sourceTitle?: string | null): string {
    const formattedDate = formatDateYYMMDD(date);
    const title = sourceTitle?.trim() ?? '';

    return title ? `- ${formattedDate} 付箋『${title}』から作成` : `- ${formattedDate} 付箋から作成`;
}

export function splitCrystalSections(spec: CrystalSpec, body: string): Record<string, string> {
    const sections = Object.fromEntries(spec.sectionNames.map((name) => [name, '']));
    const sectionNameSet = new Set<string>(spec.sectionNames);
    let currentSection: string | null = null;
    const currentLines: string[] = [];

    const flush = () => {
        if (currentSection) {
            sections[currentSection] = trimOuterBlankLines(currentLines.join('\n'));
        }
        currentLines.length = 0;
    };

    for (const line of normalizeLineEndings(body).split('\n')) {
        const heading = line.match(/^# (.+)$/);
        if (heading && sectionNameSet.has(heading[1])) {
            flush();
            currentSection = heading[1];
            continue;
        }

        if (currentSection) {
            currentLines.push(line);
        }
    }

    flush();
    return sections;
}

export function joinCrystalSections(spec: CrystalSpec, sections: Record<string, string>): string {
    return spec.sectionNames
        .flatMap((name) => [`# ${name}`, '', trimOuterBlankLines(sections[name]), ''])
        .slice(0, -1)
        .join('\n');
}

export function getChangedCrystalSections(
    spec: CrystalSpec,
    originalBody: string,
    returnedBody: string,
): string[] {
    const original = splitCrystalSections(spec, originalBody);
    const returned = splitCrystalSections(spec, returnedBody);

    return spec.trackedSectionNames.filter(
        (name) => trimOuterBlankLines(original[name]) !== trimOuterBlankLines(returned[name]),
    );
}

export function createImprovementHistoryLine(
    spec: CrystalSpec,
    date: Date | string,
    changedSections: readonly string[],
): string {
    const orderedSections = spec.trackedSectionNames.filter((name) => changedSections.includes(name));
    return `- ${formatDateYYMMDD(date)} ${orderedSections.join('・')}`;
}

export function appendImprovementHistoryLine(body: string, historyLine: string): string {
    const normalized = normalizeLineEndings(body);
    const lines = normalized.split('\n');
    const historyHeadingIndex = lines.findIndex((line) => line === `# ${IMPROVEMENT_HISTORY_SECTION}`);

    if (historyHeadingIndex === -1) {
        const base = normalized.trimEnd();
        return `${base}${base ? '\n\n' : ''}# ${IMPROVEMENT_HISTORY_SECTION}\n\n${historyLine}`;
    }

    const nextHeadingIndex = lines.findIndex((line, index) => index > historyHeadingIndex && /^# .+$/.test(line));
    const insertIndex = nextHeadingIndex === -1 ? lines.length : nextHeadingIndex;
    const before = lines.slice(0, insertIndex).join('\n').trimEnd();
    const after = lines.slice(insertIndex).join('\n');

    return `${before}\n${historyLine}${after ? `\n\n${after}` : ''}`;
}

export function truncateCrystalName(name: string, maxLength = 10): string {
    const chars = Array.from(name);
    if (chars.length <= maxLength) {
        return name;
    }
    return `${chars.slice(0, maxLength).join('')}…`;
}
