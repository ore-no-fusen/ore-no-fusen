import { describe, expect, it, vi } from 'vitest';
import { AnnotationHistory } from './annotationHistory';

const makeNode = () => ({ remove: vi.fn(), destroy: vi.fn() });
const makeLayer = () => ({ add: vi.fn(), batchDraw: vi.fn() });

describe('AnnotationHistory', () => {
    it('undoes and redoes drawings across different tools in operation order', () => {
        const history = new AnnotationHistory<ReturnType<typeof makeNode>>();
        const layer = makeLayer();
        const pen = makeNode();
        const arrow = makeNode();

        history.record(pen);
        history.record(arrow);
        history.undo(layer);
        history.undo(layer);

        expect(arrow.remove).toHaveBeenCalledOnce();
        expect(pen.remove).toHaveBeenCalledOnce();
        expect(history.counts).toEqual({ undo: 0, redo: 2 });

        history.redo(layer);
        history.redo(layer);
        expect(layer.add).toHaveBeenNthCalledWith(1, pen);
        expect(layer.add).toHaveBeenNthCalledWith(2, arrow);
        expect(history.counts).toEqual({ undo: 2, redo: 0 });
    });

    it('discards redo drawings when a new drawing is recorded', () => {
        const history = new AnnotationHistory<ReturnType<typeof makeNode>>();
        const layer = makeLayer();
        const oldDrawing = makeNode();
        const newDrawing = makeNode();

        history.record(oldDrawing);
        history.undo(layer);
        history.record(newDrawing);

        expect(oldDrawing.destroy).toHaveBeenCalledOnce();
        expect(history.counts).toEqual({ undo: 1, redo: 0 });
    });

    it('clears all history when the editor closes', () => {
        const history = new AnnotationHistory<ReturnType<typeof makeNode>>();
        const layer = makeLayer();
        const drawing = makeNode();
        history.record(drawing);
        history.undo(layer);

        history.reset();

        expect(drawing.destroy).toHaveBeenCalledOnce();
        expect(history.counts).toEqual({ undo: 0, redo: 0 });
    });
});
