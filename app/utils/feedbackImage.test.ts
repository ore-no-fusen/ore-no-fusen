import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertFeedbackImages, compressFeedbackImage } from './feedbackImage';

describe('feedback image preparation', () => {
  it('rejects a fourth image, unsupported type, and more than 5 MiB', () => {
    const png = new File([new Uint8Array([1])], 'a.png', { type: 'image/png' });
    expect(() => assertFeedbackImages([png, png, png, png])).toThrow();
    expect(() => assertFeedbackImages([new File(['x'], 'a.gif', { type: 'image/gif' })])).toThrow();
    expect(() => assertFeedbackImages([new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'a.png', { type: 'image/png' })])).toThrow();
  });

  beforeEach(() => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 4096, height: 2048, close: vi.fn() })));
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag !== 'canvas') return document.createElement(tag);
      return {
        width: 0, height: 0,
        getContext: () => ({ drawImage: vi.fn() }),
        toBlob: (callback: (blob: Blob | null) => void) => callback(new Blob([new Uint8Array(100)], { type: 'image/webp' })),
      } as unknown as HTMLCanvasElement;
    }) as typeof document.createElement);
  });

  it('decodes, limits the long edge, and returns a smaller WebP', async () => {
    const file = new File([new Uint8Array(1000)], 'screen.png', { type: 'image/png' });
    const result = await compressFeedbackImage(file);
    expect(result.type).toBe('image/webp');
    expect(result.size).toBe(100);
    const canvas = vi.mocked(document.createElement).mock.results[0].value as HTMLCanvasElement;
    expect(canvas.width).toBe(2048);
    expect(canvas.height).toBe(1024);
  });
});
