import { describe, expect, it } from 'vitest';
import { buildPerfReadyPayload } from './perfMeasurement';

describe('buildPerfReadyPayload', () => {
    it('does no work when measurement is disabled', () => {
        expect(buildPerfReadyPayload(false, 'run-1', 100, 150)).toBeNull();
    });

    it('builds one safe completion payload when enabled', () => {
        expect(buildPerfReadyPayload(true, 'run-1', 100, 150)).toEqual({
            runId: 'run-1',
            elapsedMs: 50,
        });
    });

    it('rejects missing identifiers and invalid clocks', () => {
        expect(buildPerfReadyPayload(true, undefined, 100, 150)).toBeNull();
        expect(buildPerfReadyPayload(true, 'run-1', undefined, 150)).toBeNull();
        expect(buildPerfReadyPayload(true, 'run-1', 200, 150)).toBeNull();
    });
});
