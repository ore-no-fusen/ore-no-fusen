import type { Language } from '@/lib/i18n';

const JAPANESE_WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const;

export function formatAlarmDateTime(value: string, language: Language = 'ja'): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
    if (!match) return value;

    const [, year, month, day, hour, minute] = match;
    const date = new Date(Number(year), Number(month) - 1, Number(day));

    if (
        date.getFullYear() !== Number(year)
        || date.getMonth() !== Number(month) - 1
        || date.getDate() !== Number(day)
    ) {
        return value;
    }

    if (language === 'en') {
        return new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).format(new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)));
    }

    return `${year}/${month}/${day} (${JAPANESE_WEEKDAYS[date.getDay()]}) ${hour}:${minute}`;
}
