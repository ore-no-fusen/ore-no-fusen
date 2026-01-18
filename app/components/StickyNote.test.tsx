import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
    listen: vi.fn().mockReturnValue(Promise.resolve(() => { })),
}));

vi.mock('@tauri-apps/api/window', () => ({
    getCurrentWindow: () => mockWindow,
}));

vi.mock('@tauri-apps/api/menu', () => ({
    Menu: { new: vi.fn().mockResolvedValue({ popup: vi.fn() }) },
    MenuItem: { new: vi.fn() },
    PredefinedMenuItem: { new: vi.fn() },
    Submenu: { new: vi.fn() },
}));

// Mock RichTextEditor to avoid CodeMirror issues in JSDOM
vi.mock('./RichTextEditor', () => {
    return {
        default: ({ value, onChange, onKeyDown }: any) => (
            <textarea
                data-testid="rich-text-editor"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={onKeyDown}
            />
        )
    };
});

describe('StickyNote Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Default mock responses
        mockInvoke.mockImplementation((cmd) => {
            switch (cmd) {
                case 'fusen_read_note':
                    return Promise.resolve({
                        meta: { path: 'd:/test/note.md', width: 200, height: 200 },
                        body: '---\ntags: []\n---\nTest Content'
                    });
                case 'fusen_save_note':
                    return Promise.resolve();
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

        // Enter edit mode (click article text)
        // Note: StickyNote uses onPointerUp with a timeout to detect clicks
        const texts = screen.getAllByText('Test Content');
        await act(async () => {
            fireEvent.pointerUp(texts[0], { clientX: 100, clientY: 100, button: 0 });
        });

        // Verify edit mode (Editor should be present)
        await waitFor(() => {
            expect(screen.getAllByTestId('rich-text-editor').length).toBeGreaterThan(0);
        });

        // Trigger Window Blur
        await act(async () => {
            const blurEvent = new Event('blur', { bubbles: false, cancelable: false });
            window.dispatchEvent(blurEvent);
        });

        // Verify exit edit mode
        await waitFor(() => {
            expect(screen.queryByTestId('rich-text-editor')).toBeNull();
        });

        // Verify Save was called
        expect(mockInvoke).toHaveBeenCalledWith('fusen_save_note', expect.objectContaining({
            allowRename: true
        }));
    });

    it('Regression: Edit mode exit on Escape key', async () => {
        render(<StickyNote />);
        await waitFor(() => expect(screen.getAllByText('Test Content').length).toBeGreaterThan(0));

        // Enter edit mode
        const texts = screen.getAllByText('Test Content');
        await act(async () => {
            fireEvent.pointerUp(texts[0], { clientX: 100, clientY: 100, button: 0 });
        });

        await waitFor(() => {
            expect(screen.getAllByTestId('rich-text-editor').length).toBeGreaterThan(0);
        });

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

        // Enter edit mode first
        const texts = screen.getAllByText('Test Content');
        await act(async () => {
            fireEvent.pointerUp(texts[0], { clientX: 100, clientY: 100, button: 0 });
        });
        await waitFor(() => {
            expect(screen.getAllByTestId('rich-text-editor').length).toBeGreaterThan(0);
        });

        // Clear previous calls
        mockInvoke.mockClear();

        // Trigger Context Menu
        await act(async () => {
            fireEvent.contextMenu(document.body, { clientX: 100, clientY: 100 });
        });

        // Verify Save was called BEFORE menu logic
        await waitFor(() => {
            expect(mockInvoke).toHaveBeenCalledWith('fusen_save_note', expect.objectContaining({
                allowRename: true
            }));
        });
    });

});
