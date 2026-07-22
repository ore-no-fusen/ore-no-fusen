const JAPANESE_WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const;

export function formatAlarmDateTime(value: string): string {
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

    return `${year}/${month}/${day} (${JAPANESE_WEEKDAYS[date.getDay()]}) ${hour}:${minute}`;
}
