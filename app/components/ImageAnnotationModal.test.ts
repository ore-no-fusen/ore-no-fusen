import { describe, expect, it } from 'vitest';
import { DEFAULT_ANNOTATION_SETTINGS, exportStageAsPng } from './ImageAnnotationModal';

describe('ImageAnnotationModal defaults', () => {
    it('starts with the requested green highlighter settings', () => {
        expect(DEFAULT_ANNOTATION_SETTINGS).toEqual({
            tool: 'highlight',
            color: '#00FF00',
            strokeWidth: 15,
            highlightOpacity: 0.5,
        });
    });
});

describe('exportStageAsPng', () => {
    it('waits for the Konva callback before resolving', async () => {
        let callback: ((dataUrl: string) => void) | undefined;
        const stage = {
            draw: () => undefined,
            toDataURL: (config: { callback: (dataUrl: string) => void }) => {
                callback = config.callback;
                return '';
            },
        };

        const result = exportStageAsPng(stage as never, 2);
        let resolved = false;
        void result.then(() => { resolved = true; });
        await Promise.resolve();
        expect(resolved).toBe(false);

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

        await expect(exportStageAsPng(stage as never, 1)).rejects.toThrow('PNG Data URLを生成できませんでした');
    });
});
