export type PerfReadyPayload = {
    runId: string;
    elapsedMs: number;
};

export function buildPerfReadyPayload(
    enabled: boolean,
    runId: string | undefined,
    startedAt: number | undefined,
    now: number,
): PerfReadyPayload | null {
    if (!enabled || !runId || startedAt === undefined || now < startedAt) {
        return null;
    }
    return {
        runId,
        elapsedMs: Math.round(now - startedAt),
    };
}
