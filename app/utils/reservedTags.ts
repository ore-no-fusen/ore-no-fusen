export const RESERVED_TAGS = ['recipe', 'link', 'term', 'qa', 'shortcut'] as const;

export type ReservedTag = (typeof RESERVED_TAGS)[number];

const RESERVED_TAG_SET = new Set<string>(RESERVED_TAGS);

export function normalizeTagForReservation(tag: string): string {
    return tag.trim().toLowerCase();
}

export function isReservedTag(tag: string): tag is ReservedTag {
    return RESERVED_TAG_SET.has(normalizeTagForReservation(tag));
}
