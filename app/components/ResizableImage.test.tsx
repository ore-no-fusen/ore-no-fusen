import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ResizableImage, { clearConvertedFileSrcCache } from './ResizableImage';

vi.mock('@tauri-apps/api/core', () => ({
    convertFileSrc: (src: string) => `asset://${src}`,
}));

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

beforeEach(() => {
    clearConvertedFileSrcCache();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        blob: vi.fn().mockResolvedValue(new Blob(['updated-image'], { type: 'image/png' })),
    }));
    vi.stubGlobal('URL', {
        ...URL,
        createObjectURL: vi.fn(() => 'blob:updated-image'),
        revokeObjectURL: vi.fn(),
    });
});

describe('ResizableImage', () => {
    it('places the annotation action at the image top-left away from the note toolbar', async () => {
        const { container } = render(
            <ResizableImage
                src="C:/Users/uck/Pictures/screen.png"
                alt="screen"
                baseOffset={0}
                onResizeEnd={vi.fn()}
                onAnnotationClick={vi.fn()}
            />
        );

        const annotation = container.querySelector('.annotation-hint') as HTMLElement;
        expect(annotation).toBeTruthy();
        expect(annotation.style.left).toBe('4px');
        expect(annotation.style.right).toBe('');
        await waitFor(() => {
            expect(screen.getByRole('img', { name: 'screen' }).getAttribute('src'))
                .toBe('asset://C:/Users/uck/Pictures/screen.png');
        });
    });

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

    it('reloads an annotated local image without adding a query to the MSIX asset URL', async () => {
        const { rerender } = render(
            <ResizableImage
                src="C:/Users/uck/Pictures/screen.png"
                alt="screen"
                baseOffset={0}
                cacheKey={0}
                onResizeEnd={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(screen.getByRole('img', { name: 'screen' }).getAttribute('src'))
                .toBe('asset://C:/Users/uck/Pictures/screen.png');
        });

        rerender(
            <ResizableImage
                src="C:/Users/uck/Pictures/screen.png"
                alt="screen"
                baseOffset={0}
                cacheKey={1}
                onResizeEnd={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(screen.getByRole('img', { name: 'screen' }).getAttribute('src'))
                .toBe('blob:updated-image');
        });
        expect(fetch).toHaveBeenCalledWith(
            'asset://C:/Users/uck/Pictures/screen.png',
            { cache: 'no-store' },
        );
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
