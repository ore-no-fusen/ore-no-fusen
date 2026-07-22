import type { NoteMeta } from '@/app/api/notes';
import { splitFrontMatter } from './splitFrontMatter';

function field(front: string, name: string): string | undefined {
    const match = front.match(new RegExp(`(?:^|\\n)${name}:\\s*(.+)`));
    return match?.[1]?.trim().replace(/^["']|["']$/g, '');
}

function numberField(front: string, name: string): number | undefined {
    const value = Number(field(front, name));
    return Number.isFinite(value) ? value : undefined;
}

export function extractHydratedNoteMeta(rawContent: string): Partial<NoteMeta> {
    const { front } = splitFrontMatter(rawContent);
    const tagsValue = field(front, 'tags');
    const tags = tagsValue
        ?.replace(/^\[|\]$/g, '')
        .split(',')
        .map((tag) => tag.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean) ?? [];
    const windowValue = field(front, 'window')?.replace(/^\{|\}$/g, '');
    const geometry = Object.fromEntries(
        (windowValue ?? '').split(',').map((part) => part.split(':').map((value) => value.trim())).filter((part) => part.length === 2),
    );
    const geometryNumber = (name: string) => {
        const value = Number(geometry[name]);
        return Number.isFinite(value) ? value : undefined;
    };
    return {
        tags,
        background_color: field(front, 'backgroundColor'),
        font_size: numberField(front, 'fontSize'),
        opacity: numberField(front, 'opacity'),
        always_on_top: field(front, 'alwaysOnTop') === 'true',
        folded: field(front, 'folded') === 'true',
        x: geometryNumber('x'),
        y: geometryNumber('y'),
        width: geometryNumber('width'),
        height: geometryNumber('height'),
    };
}
