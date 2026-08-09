import { describe, expect, it } from 'vitest';
import { ANNOTATION_WINDOW_SIZE, DEFAULT_ANNOTATION_SETTINGS, exportDrawingLayerAsPng } from './ImageAnnotationModal';

describe('ImageAnnotationModal defaults', () => {
    it('starts with the requested green highlighter settings', () => {
        expect(DEFAULT_ANNOTATION_SETTINGS).toEqual({
            tool: 'highlight',
            color: '#00FF00',
            strokeWidth: 15,
            highlightOpacity: 0.5,
        });
    });

    it('uses a large annotation window that keeps the footer visible', () => {
        expect(ANNOTATION_WINDOW_SIZE).toEqual({ width: 760, height: 620 });
    });
});

describe('exportDrawingLayerAsPng', () => {
    it('waits for the Konva callback before resolving', async () => {
        let callback: ((dataUrl: string) => void) | undefined;
        let exportSize: { width?: number; height?: number } = {};
        const stage = {
            draw: () => undefined,
            toDataURL: (config: { width?: number; height?: number; callback: (dataUrl: string) => void }) => {
                exportSize = { width: config.width, height: config.height };
                callback = config.callback;
                return '';
            },
        };

        const result = exportDrawingLayerAsPng(stage as never, 600, 400, 2);
        let resolved = false;
        void result.then(() => { resolved = true; });
        await Promise.resolve();
        expect(resolved).toBe(false);
        expect(exportSize).toEqual({ width: 600, height: 400 });

        callback?.('data:image/png;base64,valid');
        await expect(result).resolves.toBe('data:image/png;base64,valid');
    });

    it('rejects an empty PNG data URL', async () => {
        const stage = {
            draw: () => undefined,
            toDataURL: (config: { callback: (dataUrl: string) => void }) => {
                config.callback('data:image/png;base64,');
                return '';
            },
        };

        await expect(exportDrawingLayerAsPng(stage as never, 600, 400, 1)).rejects.toThrow('PNG Data URLを生成できませんでした');
    });
});
