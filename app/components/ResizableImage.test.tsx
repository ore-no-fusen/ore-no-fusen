import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ResizableImage from './ResizableImage';

vi.mock('@tauri-apps/api/core', () => ({
    convertFileSrc: (src: string) => `asset://${src}`,
}));

afterEach(() => {
    cleanup();
});

describe('ResizableImage', () => {
    it('shows the markdown source when image loading fails', () => {
        render(
            <ResizableImage
                src="C:/Users/uck/Pictures/missing.png"
                alt="img"
                baseOffset={0}
                markdownFallback="![img](C:/Users/uck/Pictures/missing.png)"
                onResizeEnd={vi.fn()}
            />
        );

        fireEvent.error(screen.getByRole('img', { name: 'img' }));

        expect(screen.getByText('![img](C:/Users/uck/Pictures/missing.png)')).toBeTruthy();
    });

    it('reconstructs markdown fallback from alt and src when no source markdown is provided', () => {
        render(
            <ResizableImage
                src="C:/Users/uck/Pictures/missing.png"
                alt="img"
                baseOffset={0}
                onResizeEnd={vi.fn()}
            />
        );

        fireEvent.error(screen.getByRole('img', { name: 'img' }));

        expect(screen.getByText('![img](C:/Users/uck/Pictures/missing.png)')).toBeTruthy();
    });
});
