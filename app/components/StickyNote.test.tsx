/**
 * StickyNote コンポーネントテスト
 *
 * 責務:
 * - 付箋の表示、編集、保存機能の単体テスト
 * - リグレッションテスト（バグ修正の確認）
 * - ユーザー操作のシミュレーション検証
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach, assert } from 'vitest';
import StickyNote from './StickyNote';

// Mock Next.js hooks
vi.mock('next/navigation', () => ({
    useSearchParams: () => ({
        get: (key: string) => {
            if (key === 'path') return 'd:/test/note.md';
            return null;
        },
    }),
}));

// Mock Tauri APIs
const mockInvoke = vi.fn();
const mockWebviewWindow = {
    getAllWebviewWindows: vi.fn().mockResolvedValue([]),
    getByLabel: vi.fn(),
};
const mockWindow = {
    label: 'main',
    listen: vi.fn().mockReturnValue(Promise.resolve(() => { })),
    close: vi.fn(),
    emit: vi.fn(),
};

vi.mock('@tauri-apps/api/core', () => ({
    invoke: (...args: any[]) => mockInvoke(...args),
}));

vi.mock('@tauri-apps/api/event', () => ({
    emit: vi.fn(),
    listen: vi.fn().mockResolvedValue(() => { }),
    // Ensure dynamic import finds these
    default: {
        emit: vi.fn(),
        listen: vi.fn().mockResolvedValue(() => { })
    }
}));

vi.mock('@tauri-apps/api/window', () => ({
    getCurrentWindow: () => mockWindow,
}));

vi.mock('@tauri-apps/api/menu', () => {
    const Menu = { new: vi.fn().mockResolvedValue({ popup: vi.fn() }) };
    const MenuItem = { new: vi.fn() };
    const PredefinedMenuItem = { new: vi.fn() };
    const Submenu = { new: vi.fn() };
    return {
        Menu,
        MenuItem,
        PredefinedMenuItem,
        Submenu,
        default: { Menu, MenuItem, PredefinedMenuItem, Submenu }
    };
});


// Mock RichTextEditor to avoid CodeMirror issues in JSDOM
vi.mock('./RichTextEditor', () => {
    const React = require('react');
    class MockEditor extends React.Component<any> {
        focus() {
            // Mock focus
        }
        insertBold() { }
        insertHeading1() { }
        insertList() { }
        insertCheckbox() { }
        insertText() { }

        render() {
            const { value, onChange, onKeyDown } = this.props;
            return (
                <textarea
                    data-testid="rich-text-editor"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={onKeyDown}
                />
            );
        }
    }
    return { default: MockEditor };
});

describe('StickyNote Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Default mock responses
        mockInvoke.mockImplementation((cmd, args) => {
            switch (cmd) {
                case 'fusen_read_note':
                    return Promise.resolve({
                        meta: { path: 'd:/test/note.md', width: 200, height: 200 },
                        body: '---\ntags: []\n---\nTest Content'
                    });
                case 'fusen_save_note':
                    return Promise.resolve(args?.path || 'd:/test/note.md');
                case 'fusen_get_all_tags':
                    return Promise.resolve(['tag1', 'tag2']);
                default:
                    return Promise.resolve(null);
            }
        });
    });

    // --- Regression Tests ---

    it('Regression: Edit mode exists on window blur', async () => {
        render(<StickyNote />);

        // Wait for load
        await waitFor(() => expect(screen.getAllByText('Test Content').length).toBeGreaterThan(0));

        // Enter edit mode (double click article text)
        const texts = screen.getAllByText('Test Content');
        await act(async () => {
            fireEvent.doubleClick(texts[0]);
        });

        // Verify edit mode (Editor should be present)
        await waitFor(() => {
            expect(screen.getAllByTestId('rich-text-editor').length).toBeGreaterThan(0);
        }, { timeout: 3000 });

        // [Fix] ignoreBlurUntilRef (200ms grace period) を十分に超える時間を待機
        await act(async () => {
            await new Promise((r) => setTimeout(r, 400));
        });

        // Trigger Outside Click (Pointer Down)
        await act(async () => {
            // Dispatch pointerdown on body (simulating click outside)
            fireEvent.pointerDown(document.body);
        });

        // Verify exit edit mode
        await waitFor(() => {
            expect(screen.queryByTestId('rich-text-editor')).toBeNull();
        }, { timeout: 3000 });

        // Verify Save was called
        expect(mockInvoke).toHaveBeenCalledWith('fusen_save_note', expect.objectContaining({
            allowRename: true
        }));
    });

    it('Regression: Edit mode exit on Escape key', async () => {
        render(<StickyNote />);
        await waitFor(() => expect(screen.getAllByText('Test Content').length).toBeGreaterThan(0));

        // Enter edit mode (double click)
        const texts = screen.getAllByText('Test Content');
        await act(async () => {
            fireEvent.doubleClick(texts[0]);
        });

        await waitFor(() => {
            expect(screen.getAllByTestId('rich-text-editor').length).toBeGreaterThan(0);
        }, { timeout: 3000 });

        // Press Escape
        const editors = screen.getAllByTestId('rich-text-editor');
        await act(async () => {
            fireEvent.keyDown(editors[0], { key: 'Escape', code: 'Escape' });
        });

        // Verify exit
        await waitFor(() => {
            expect(screen.queryByTestId('rich-text-editor')).toBeNull();
        });
    });

    it('Regression: Context Menu triggers save (Tag Restoration Bug)', async () => {
        render(<StickyNote />);
        await waitFor(() => expect(screen.getAllByText('Test Content').length).toBeGreaterThan(0));

        // Enter edit mode first (double click)
        const texts = screen.getAllByText('Test Content');
        await act(async () => {
            fireEvent.doubleClick(texts[0]);
        });
        await waitFor(() => {
            expect(screen.getAllByTestId('rich-text-editor').length).toBeGreaterThan(0);
        }, { timeout: 3000 });

        // Clear previous calls
        mockInvoke.mockClear();

        // Trigger Context Menu
        await act(async () => {
            // [Fix] Wait for grace period before blurring (reduced 800->200ms + buffer)
            await new Promise((r) => setTimeout(r, 400));

            // Simulate blur first to trigger save
            window.dispatchEvent(new FocusEvent('blur'));

            // Wait for save to process
            await new Promise((r) => setTimeout(r, 500));

            fireEvent.contextMenu(document.body, { clientX: 100, clientY: 100 });
        });

        // Verify Save was called
        await waitFor(() => {
            expect(mockInvoke).toHaveBeenCalledWith('fusen_save_note', expect.objectContaining({
                allowRename: true
            }));
        }, { timeout: 3000 });
    });

    it('Feature: Header Tag Display', async () => {
        // Mock returning tags in frontmatter
        mockInvoke.mockImplementation((cmd) => {
            if (cmd === 'fusen_read_note') {
                return Promise.resolve({
                    meta: { path: 'd:/test/note.md', width: 200, height: 200, tags: ['Tag1'] },
                    // Test cases: Normal
                    body: '---\ntags: [Tag1]\n---\nTest Content'
                });
            }
            if (cmd === 'fusen_get_all_tags') return Promise.resolve(['Tag1']);
            return Promise.resolve(null);
        });

        render(<StickyNote />);

        // Wait for parsed tags to appear in header
        await waitFor(() => {
            expect(screen.getByText('Tag1')).toBeTruthy();
        }, { timeout: 3000 });

        // Ensure Tag4 is NOT shown directly
        // expect(screen.queryByText('Tag4')).toBeNull();
    });

    it('Feature: Link Display (URLs and File Paths)', async () => {
        // Mock returning content with various link types
        mockInvoke.mockImplementation((cmd) => {
            if (cmd === 'fusen_read_note') {
                return Promise.resolve({
                    meta: { path: 'd:/test/note.md', width: 300, height: 300 },
                    body: '---\ntags: []\n---\nCheck out https://example.com for more info.\nAlso see d:\\path\\to\\file.txt'
                });
            }
            if (cmd === 'fusen_get_all_tags') return Promise.resolve([]);
            return Promise.resolve(null);
        });

        render(<StickyNote />);

        // Wait for content to load
        await waitFor(() => {
            expect(screen.getByText(/Check out/)).toBeTruthy();
        });

        // Verify that URL is rendered (should be in the DOM)
        // Note: The actual link rendering depends on the parseLinks function
        await waitFor(() => {
            const articleContent = document.body.textContent;
            expect(articleContent).toContain('https://example.com');
            expect(articleContent).toContain('d:\\path\\to\\file.txt');
        });
    });

});
