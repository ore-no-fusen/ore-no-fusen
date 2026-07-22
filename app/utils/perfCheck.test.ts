import { describe, expect, it } from 'vitest';
import { evaluateReadyGate, parsePerfLines, percentile, summarize } from '../../scripts/perf-check.mjs';

describe('perf-check', () => {
    it('uses nearest-rank percentiles', () => {
        const values = Array.from({ length: 100 }, (_, index) => index + 1);
        expect(percentile(values, 50)).toBe(50);
        expect(percentile(values, 95)).toBe(95);
        expect(percentile(values, 99)).toBe(99);
    });

    it('counts outcomes and dropped measurements', () => {
        const report = summarize([
            { event: 'READY', elapsed_ms: 10, meta: { status: 'success' }, dropped_before: 2 },
            { event: 'READY', elapsed_ms: 30, meta: { status: 'failed' }, dropped_before: 0 },
        ]);
        expect(report.dropped).toBe(2);
        expect(report.groups[0]).toMatchObject({ count: 2, success: 1, failed: 1, p50: 10, p95: 30 });
    });

    it('aggregates the same event across window labels', () => {
        const report = summarize([
            { event: 'NOTE_EDITOR_READY', label: 'pool-window-a', elapsed_ms: 10, meta: {} },
            { event: 'NOTE_EDITOR_READY', label: 'pool-window-b', elapsed_ms: 30, meta: {} },
        ]);
        expect(report.groups).toHaveLength(1);
        expect(report.groups[0]).toMatchObject({ name: 'NOTE_EDITOR_READY', count: 2, p50: 10, p95: 30 });
    });

    it('uses end-to-end editor readiness for the 300ms gate', () => {
        const gate = evaluateReadyGate([
            { name: 'T2_READY', count: 5, p50: 10 },
            { name: 'NOTE_EDITOR_READY', count: 5, p50: 250 },
        ]);
        expect(gate).toEqual({ passed: true, name: 'NOTE_EDITOR_READY', p50: 250 });
    });

    it('keeps launcher search tabs separate', () => {
        const report = summarize([
            { event: 'LAUNCHER_SEARCH_DONE', label: 'shortcut', elapsed_ms: 1000, meta: {} },
            { event: 'LAUNCHER_SEARCH_DONE', label: 'qa', elapsed_ms: 30, meta: {} },
        ]);
        expect(report.groups.map((group: { name: string }) => group.name)).toEqual([
            'LAUNCHER_SEARCH_DONE (shortcut)',
            'LAUNCHER_SEARCH_DONE (qa)',
        ]);
    });

    it('skips malformed lines without losing valid events', () => {
        expect(parsePerfLines('{"event":"READY"}\nnot-json\n')).toEqual({
            events: [{ event: 'READY' }],
            invalid: 1,
        });
    });
});
