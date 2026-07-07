import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MarkdownRenderer, { getEmptyNotePlaceholder } from '../MarkdownRenderer';

vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-shell', () => ({
    open: vi.fn(),
}));

const defaultProps = {
    backgroundColor: '#ffffff',
    fontSize: 14,
    onCheckboxToggle: vi.fn(),
    onImageResize: vi.fn(),
    onDoubleClick: vi.fn(),
    resolvePath: (_baseFile: string, relativePath: string) => relativePath,
};

function renderMarkdown(content: string, props: Partial<React.ComponentProps<typeof MarkdownRenderer>> = {}) {
    return render(
        <MarkdownRenderer
            {...defaultProps}
            content={content}
            {...props}
        />,
    );
}

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe('MarkdownRenderer recipeMode', () => {
    const representativeContent = [
        '# 見出し',
        '- 箇条書き',
        '- [ ] チェック',
        '1. 番号行',
        '## 小見出し',
        'https://example.com',
        '**太字**',
    ].join('\n');

    it('keeps recipeMode=false rendering behavior for ## and numbered lines', () => {
        const { container } = renderMarkdown(representativeContent);

        const heading = screen.getByText('見出し').closest('div');
        expect(heading?.className).toContain('font-bold');
        expect(heading?.getAttribute('style') ?? '').not.toContain('#d9480f');

        const subHeadingLine = screen.getByText('## 小見出し').closest('div');
        expect(subHeadingLine?.className).not.toContain('font-bold');
        expect(screen.getByText('## 小見出し').getAttribute('data-src-start')).toBe('31');

        const numberedLine = screen.getByText('1. 番号行').closest('div');
        expect(numberedLine?.className).not.toContain('font-bold');
        expect(screen.getByText('1. 番号行').getAttribute('data-src-start')).toBe('24');

        expect(screen.getByText('•')).toBeTruthy();
        expect(screen.getByText('☐')).toBeTruthy();
        expect(screen.getByText('https://example.com').getAttribute('style')).toContain('color: blue');
        expect(container.querySelector('strong')?.textContent).toBe('太字');
    });

    it('colors recipe headings and only the ordered-list marker in recipeMode=true', () => {
        renderMarkdown('# こんなとき\n## 参考\n1. 本文', { recipeMode: true });

        const heading = screen.getByText('こんなとき').closest('div');
        expect(heading?.getAttribute('style')).toContain('color: rgb(217, 72, 15)');
        expect(heading?.className).toContain('font-bold');
        expect(screen.getByText('こんなとき').getAttribute('data-src-start')).toBe('2');

        const subHeading = screen.getByText('参考').closest('div');
        expect(subHeading?.getAttribute('style')).toContain('color: rgb(217, 72, 15)');
        expect(subHeading?.className).toContain('font-bold');
        expect(screen.getByText('参考').getAttribute('data-src-start')).toBe('11');

        const marker = screen.getByText('1.');
        expect(marker.getAttribute('style')).toContain('color: rgb(25, 113, 194)');
        expect(marker.getAttribute('data-src-start')).toBe('14');

        const body = screen.getByText('本文');
        expect(body.getAttribute('style')).toBeNull();
        expect(body.getAttribute('data-src-start')).toBe('17');
    });

    it('preserves singleLinePreview truncation classes with recipeMode=true', () => {
        renderMarkdown('## とても長い小見出し\n1. とても長い本文', {
            recipeMode: true,
            singleLinePreview: true,
        });

        const subHeadingContent = screen.getByText('とても長い小見出し');
        expect(subHeadingContent.parentElement?.className).toContain('block overflow-hidden text-ellipsis');

        const marker = screen.getByText('1.');
        expect(marker.getAttribute('style')).toContain('color: rgb(25, 113, 194)');
        expect(marker.closest('div')?.className).toContain('block overflow-hidden text-ellipsis');
    });
});

describe('getEmptyNotePlaceholder', () => {
    it('returns color-specific placeholders for yellow, pink, and blue notes', () => {
        expect(getEmptyNotePlaceholder('#f7e9b0')).toBe('アイデア、違和感、こんなときをメモ');
        expect(getEmptyNotePlaceholder('#ffcdd2')).toBe('課題、TODO、試したことをメモ');
        expect(getEmptyNotePlaceholder('#80d8ff')).toBe('結果、決定事項、次回の作戦をメモ');
    });

    it('keeps the existing placeholder for white, black, and unknown colors', () => {
        expect(getEmptyNotePlaceholder('#fafaf0')).toBe('（空のメモ）');
        expect(getEmptyNotePlaceholder('#cfd8dc')).toBe('（空のメモ）');
        expect(getEmptyNotePlaceholder('#ffffff')).toBe('（空のメモ）');
    });

    it('renders the selected placeholder with the existing muted style', () => {
        const { container } = renderMarkdown('', { backgroundColor: '#80d8ff' });

        expect(screen.getByText('結果、決定事項、次回の作戦をメモ')).toBeTruthy();
        expect(container.querySelector('.text-\\[\\#999\\]')).toBeTruthy();
    });
});
