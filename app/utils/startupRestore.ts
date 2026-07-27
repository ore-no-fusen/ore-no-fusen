export async function runWithConcurrency<T>(
    items: readonly T[],
    concurrency: number,
    worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
    const limit = Math.max(1, Math.floor(concurrency));
    let nextIndex = 0;

    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (nextIndex < items.length) {
            const index = nextIndex++;
            await worker(items[index], index);
        }
    });

    await Promise.all(runners);
}

export function waitForStartupReady(
    expectedLabels: ReadonlySet<string>,
    readyLabels: ReadonlySet<string>,
    subscribe: (resolve: () => void) => () => void,
    timeoutMs: number,
): Promise<void> {
    if ([...expectedLabels].every((label) => readyLabels.has(label))) return Promise.resolve();

    return new Promise<void>((resolve) => {
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let unsubscribe = () => {};
        const finish = () => {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            unsubscribe();
            resolve();
        };
        unsubscribe = subscribe(finish);
        timer = setTimeout(finish, timeoutMs);
    });
}

export function partitionStartupLabels(
    expectedLabels: ReadonlySet<string>,
    readyLabels: ReadonlySet<string>,
): { ready: string[]; missing: string[] } {
    const ready: string[] = [];
    const missing: string[] = [];
    for (const label of expectedLabels) {
        if (readyLabels.has(label)) ready.push(label);
        else missing.push(label);
    }
    return { ready, missing };
}
