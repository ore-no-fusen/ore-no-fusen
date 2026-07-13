import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ResizableImage, { clearConvertedFileSrcCache } from './ResizableImage';

vi.mock('@tauri-apps/api/core', () => ({
    convertFileSrc: (src: string) => `asset://${src}`,
}));

afterEach(() => {
    cleanup();
});

beforeEach(() => {
    clearConvertedFileSrcCache();
});

describe('ResizableImage', () => {
    it('reuses a converted local image URL immediately when the image remounts', async () => {
        const props = {
            src: 'C:/Users/uck/Pictures/screen.png',
            alt: 'screen',
            baseOffset: 0,
            onResizeEnd: vi.fn(),
        };
        const first = render(<ResizableImage {...props} />);

        await waitFor(() => {
            expect(screen.getByRole('img', { name: 'screen' }).getAttribute('src'))
                .toBe('asset://C:/Users/uck/Pictures/screen.png');
        });
        first.unmount();

        render(<ResizableImage {...props} />);

        expect(screen.getByRole('img', { name: 'screen' }).getAttribute('src'))
            .toBe('asset://C:/Users/uck/Pictures/screen.png');
    });

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

    it('retries fallback sources before showing markdown source', async () => {
        render(
            <ResizableImage
                src="primary.png"
                fallbackSrcs={['fallback.png']}
                alt="img"
                baseOffset={0}
                markdownFallback="![img](assets/img.png)"
                onResizeEnd={vi.fn()}
            />
        );

        fireEvent.error(screen.getByRole('img', { name: 'img' }));

        await waitFor(() => {
            expect(screen.getByRole('img', { name: 'img' }).getAttribute('src')).toBe('fallback.png');
        });

        fireEvent.error(screen.getByRole('img', { name: 'img' }));

        expect(screen.getByText('![img](assets/img.png)')).toBeTruthy();
    });
});
