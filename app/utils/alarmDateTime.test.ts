import { describe, expect, it } from 'vitest';
import { formatAlarmDateTime } from './alarmDateTime';

describe('formatAlarmDateTime', () => {
    it.each([
        ['2026-07-05T09:00', '2026/07/05 (日) 09:00'],
        ['2026-07-06T09:00', '2026/07/06 (月) 09:00'],
        ['2026-07-07T09:00', '2026/07/07 (火) 09:00'],
        ['2026-07-08T09:00', '2026/07/08 (水) 09:00'],
        ['2026-07-09T09:00', '2026/07/09 (木) 09:00'],
        ['2026-07-10T23:57', '2026/07/10 (金) 23:57'],
        ['2026-07-11T09:00', '2026/07/11 (土) 09:00'],
    ])('%s の曜日を表示する', (value, expected) => {
        expect(formatAlarmDateTime(value)).toBe(expected);
    });

    it.each(['', 'invalid', '2026-02-30T09:00'])('不正な値 %s は加工しない', (value) => {
        expect(formatAlarmDateTime(value)).toBe(value);
    });
});
