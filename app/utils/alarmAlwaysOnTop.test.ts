import { describe, expect, it } from 'vitest';
import { normalizeAlarmAlwaysOnTop } from './alarmAlwaysOnTop';

describe('normalizeAlarmAlwaysOnTop', () => {
    it('uses false while the original pin state is not loaded', () => {
        expect(normalizeAlarmAlwaysOnTop(undefined)).toBe(false);
        expect(normalizeAlarmAlwaysOnTop(null)).toBe(false);
    });

    it('preserves loaded boolean pin states', () => {
        expect(normalizeAlarmAlwaysOnTop(true)).toBe(true);
        expect(normalizeAlarmAlwaysOnTop(false)).toBe(false);
    });
});
