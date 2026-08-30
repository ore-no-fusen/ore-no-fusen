import { describe, expect, it } from 'vitest';
import {
    formatCollapsedLines,
    moveOutlineSubtree,
    moveCollapsedLines,
    parseOutline,
    readCollapsedLines,
    remapCollapsedLines,
} from './outline';
import { splitFrontMatter, updateFrontmatterValue } from './splitFrontMatter';

describe('outline utilities', () => {
    it('derives hierarchy and hides every descendant of a collapsed parent', () => {
        const lines = parseOutline('機能安全\n  SG\n    SG-01\n  FSR\nサイバー', [0]);
        expect(lines.map(line => ({ depth: line.depth, child: line.hasChildren, hidden: line.hidden }))).toEqual([
            { depth: 0, child: true, hidden: false },
            { depth: 1, child: true, hidden: true },
            { depth: 2, child: false, hidden: true },
            { depth: 1, child: false, hidden: true },
            { depth: 0, child: false, hidden: false },
        ]);
    });

    it('does not treat tables, images, or fenced code as outline items', () => {
        const lines = parseOutline('親\n  子\n| A | B |\n![x](a.png)\n```\n  code\n```');
        expect(lines.map(line => line.eligible)).toEqual([true, true, false, false, false, false, false]);
    });

    it('round-trips a flat single-line frontmatter value', () => {
        expect(formatCollapsedLines([7, 1, 7])).toBe('[1, 7]');
        expect(readCollapsedLines('---\noutlineCollapsed: [1, 7]\n---')).toEqual([1, 7]);
        expect(readCollapsedLines('---\ntags: []\n---')).toEqual([]);
    });

    it('persists collapsed state without changing existing body or frontmatter fields', () => {
        const body = '機能安全\n  SG\n  FSR';
        const originalFront = '---\ntags: [safety]\nfolded: false\n---';
        const updatedFront = updateFrontmatterValue(originalFront, 'outlineCollapsed', formatCollapsedLines([0]));
        const saved = `${updatedFront}\n\n${body}`;
        const loaded = splitFrontMatter(saved);

        expect(readCollapsedLines(loaded.front)).toEqual([0]);
        expect(loaded.front).toContain('tags: [safety]');
        expect(loaded.front).toContain('folded: false');
        expect(loaded.body).toBe(body);
    });

    it('keeps collapsed state on rename and shifts it when lines are inserted', () => {
        expect(remapCollapsedLines('親\n  子', '新しい親\n  子', [0])).toEqual([0]);
        expect(remapCollapsedLines('親\n  子', '前書き\n親\n  子', [0])).toEqual([1]);
        expect(remapCollapsedLines('親\n  子', '新しい\n親\n  子', [0])).toEqual([1]);
    });

    it('moves a parent together with all descendants', () => {
        expect(moveOutlineSubtree('親A\n  子A\n親B', 0, 2).body).toBe('親A\n  子A\n親B');
        expect(moveOutlineSubtree('親A\n  子A\n親B\n親C', 0, 3).body).toBe('親B\n親A\n  子A\n親C');
    });

    it('moves collapsed line numbers with their subtree', () => {
        expect(moveCollapsedLines([0, 3], 0, 1, 3)).toEqual([1, 3]);
        expect(moveCollapsedLines([1, 3], 3, 3, 0)).toEqual([0, 2]);
    });
});
