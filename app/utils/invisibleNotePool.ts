export type InvisibleWindowCandidate = { label: string };

export function shouldEditPromotedPoolNote(isNew?: boolean): boolean {
    return isNew === true;
}

export function selectReadyInvisibleNote<T extends InvisibleWindowCandidate>(
    windows: T[],
    readyLabels: ReadonlySet<string>,
    usedLabels: ReadonlySet<string>,
    isPersistedAsPromoted: (label: string) => boolean,
): T | undefined {
    return windows.find((window) =>
        window.label.startsWith('pool-window-')
        && readyLabels.has(window.label)
        && !usedLabels.has(window.label)
        && !isPersistedAsPromoted(window.label),
    );
}
