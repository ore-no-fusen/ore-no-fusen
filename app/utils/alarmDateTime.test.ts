import { describe, expect, it } from 'vitest';
import { formatAlarmDateTime } from './alarmDateTime';

describe('formatAlarmDateTime', () => {
    it('formats an English alarm date without Japanese weekday characters', () => {
        expect(formatAlarmDateTime('2026-07-24T06:01', 'en')).toMatch(/^Fri, 07\/24\/2026, 06:01$/);
    });

    it('keeps the Japanese weekday format for Japanese', () => {
        expect(formatAlarmDateTime('2026-07-24T06:01', 'ja')).toBe('2026/07/24 (金) 06:01');
    });
});
