export type AnnotationHistoryNode = {
    remove: () => unknown;
    destroy: () => unknown;
};

export type AnnotationHistoryLayer<T extends AnnotationHistoryNode> = {
    add: (node: T) => unknown;
    batchDraw: () => unknown;
};

export class AnnotationHistory<T extends AnnotationHistoryNode> {
    private undoStack: T[] = [];
    private redoStack: T[] = [];

    record(node: T): void {
        this.redoStack.forEach((redoNode) => redoNode.destroy());
        this.redoStack = [];
        this.undoStack.push(node);
    }

    undo(layer: AnnotationHistoryLayer<T>): void {
        const node = this.undoStack.pop();
        if (!node) return;
        node.remove();
        this.redoStack.push(node);
        layer.batchDraw();
    }

    redo(layer: AnnotationHistoryLayer<T>): void {
        const node = this.redoStack.pop();
        if (!node) return;
        layer.add(node);
        this.undoStack.push(node);
        layer.batchDraw();
    }

    clearDetachedNodes(): void {
        this.redoStack.forEach((node) => node.destroy());
        this.redoStack = [];
    }

    reset(): void {
        this.clearDetachedNodes();
        this.undoStack = [];
    }

    get counts(): { undo: number; redo: number } {
        return { undo: this.undoStack.length, redo: this.redoStack.length };
    }
}
