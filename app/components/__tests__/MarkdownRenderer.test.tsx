import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

    it('returns English placeholders without Japanese characters in English mode', () => {
        const placeholders = [
            getEmptyNotePlaceholder('#f7e9b0', 'en'),
            getEmptyNotePlaceholder('#ffcdd2', 'en'),
            getEmptyNotePlaceholder('#80d8ff', 'en'),
            getEmptyNotePlaceholder('#ffffff', 'en'),
        ];

        expect(placeholders.join(' ')).not.toMatch(/[ぁ-んァ-ヶ一-龯]/);
        expect(placeholders[3]).toBe('(Empty note)');
    });

    it('renders the selected placeholder with the existing muted style', () => {
        const { container } = renderMarkdown('', { backgroundColor: '#80d8ff' });

        expect(screen.getByText('結果、決定事項、次回の作戦をメモ')).toBeTruthy();
        expect(container.querySelector('.text-\\[\\#999\\]')).toBeTruthy();
    });
});

describe('MarkdownRenderer outline', () => {
    it('shows a quiet toggle only for a line that has children', () => {
        const { container } = renderMarkdown('機能安全\n  SG\n  FSR\nサイバーセキュリティ');

        const toggle = screen.getByRole('button', { name: '閉じる' });
        expect(toggle.textContent).toBe('⌄');
        expect(toggle.className).toContain('opacity-0');
        expect(toggle.className).toContain('group-hover/outline:opacity-55');
        expect(toggle.className).toContain('focus-visible:opacity-90');
        expect(toggle.className).toContain('text-[19px]');
        expect(toggle.className).toContain('w-[12px]');
        expect(toggle.className).toContain('place-items-center');
        expect(toggle.className).toContain('-translate-y-[10px]');
        expect(toggle.className).toContain('overflow-visible');
        expect((toggle as HTMLElement).style.cursor).toContain('note-point.svg?v=1');
        expect(toggle.className).not.toMatch(/(?:^|\s)focus:opacity-90(?:\s|$)/);
        expect(screen.getAllByRole('button')).toHaveLength(1);
        expect(screen.queryByText('•')).toBeNull();
        expect(container.querySelector('.outline-indent')?.textContent).toBe('  ');
        expect((container.querySelector('[data-line-index="0"]') as HTMLElement).style.paddingLeft).toBe('12px');
    });

    it('hides all descendants while keeping the collapsed parent visible', () => {
        const { container } = renderMarkdown('機能安全\n  SG\n    SG-01\n  FSR\nサイバー', { collapsedOutlineLines: [0] });

        expect(screen.getByText('機能安全')).toBeTruthy();
        const toggle = screen.getByRole('button', { name: '開く' });
        expect(toggle.textContent).toBe('›');
        expect(toggle.className).toContain('-translate-y-[3px]');
        expect(toggle.className).toContain('opacity-70');
        expect(toggle.className).not.toContain('opacity-0');
        expect(container.querySelector('.outline-fold-marker')?.textContent).toBe('…');
        expect(screen.queryByText('SG')).toBeNull();
        expect(screen.queryByText('SG-01')).toBeNull();
        expect(screen.queryByText('FSR')).toBeNull();
        expect(screen.getByText('サイバー')).toBeTruthy();
    });

    it('shows the existing quiet toggle for Markdown heading and list parents', () => {
        renderMarkdown('# 見出し\n## 子見出し\n- 親リスト\n  - 子リスト');

        expect(screen.getAllByRole('button', { name: '閉じる' })).toHaveLength(3);
    });

    it('hides tables and fenced code inside a collapsed heading section', () => {
        const body = '# 見出し\n| A | B |\n|---|---|\n| 1 | 2 |\n```txt\ncode body\n```\n# 次';
        const { container } = renderMarkdown(body, { collapsedOutlineLines: [0] });

        expect(container.querySelector('table')).toBeNull();
        expect(container.querySelector('pre')).toBeNull();
        expect(screen.getByText('見出し')).toBeTruthy();
        expect(screen.getByText('次')).toBeTruthy();
    });

    it('does not show an ellipsis while a parent is expanded', () => {
        const { container } = renderMarkdown('親\n  子');

        expect(container.querySelector('.outline-fold-marker')).toBeNull();
    });

    it('places a nested toggle after its saved indentation without moving the text', () => {
        const { container } = renderMarkdown('親\n  子\n    孫');
        const nestedLine = container.querySelector('[data-line-index="1"]');
        const indent = nestedLine?.querySelector('.outline-indent');
        const toggle = nestedLine?.querySelector('.outline-toggle');

        expect(indent?.textContent).toBe('  ');
        expect(indent?.nextElementSibling).toBe(toggle);
    });

    it('keeps all three ordered-list indentation spaces before the nested toggle', () => {
        const { container } = renderMarkdown('1. 親\n   1. 子\n      1. 孫');
        const nestedLine = container.querySelector('[data-line-index="1"]');

        expect(nestedLine?.querySelector('.outline-indent')?.textContent).toBe('   ');
        expect(nestedLine?.querySelector('.outline-indent')?.nextElementSibling).toBe(nestedLine?.querySelector('.outline-toggle'));
    });

    it('reports toggle changes without changing the body', () => {
        const onChange = vi.fn();
        renderMarkdown('親\n  子', { onCollapsedOutlineLinesChange: onChange });

        screen.getByRole('button', { name: '閉じる' }).click();
        expect(onChange).toHaveBeenCalledWith([0]);
    });

    it('does not enter edit mode when the toggle is double-clicked', () => {
        const onDoubleClick = vi.fn();
        renderMarkdown('親\n  子', { onDoubleClick });

        fireEvent.doubleClick(screen.getByRole('button', { name: '閉じる' }));
        expect(onDoubleClick).not.toHaveBeenCalled();
    });

    it('keeps the toggled parent at the same viewport position', () => {
        const requestFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
        const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
        const rect = (top: number) => ({
            x: 0, y: top, top, left: 0, right: 200, bottom: top + 20,
            width: 200, height: 20, toJSON: () => ({}),
        });
        const getRect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
            if (this.getAttribute('data-line-index') === '0') {
                return rect(this.querySelector('[aria-label="開く"]') ? 250 : 100);
            }
            return rect(0);
        });

        function Harness() {
            const [collapsed, setCollapsed] = React.useState<number[]>([]);
            return (
                <main data-testid="outline-scroller" style={{ overflow: 'auto' }}>
                    <MarkdownRenderer
                        {...defaultProps}
                        content={'親\n  子'}
                        collapsedOutlineLines={collapsed}
                        onCollapsedOutlineLinesChange={setCollapsed}
                    />
                </main>
            );
        }

        render(<Harness />);
        const scroller = screen.getByTestId('outline-scroller');
        fireEvent.click(screen.getByRole('button', { name: '閉じる' }));

        expect(scroller.scrollTop).toBe(150);
        getRect.mockRestore();
        requestFrame.mockRestore();
        cancelFrame.mockRestore();
    });
});
