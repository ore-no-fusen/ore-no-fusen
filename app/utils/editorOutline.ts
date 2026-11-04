import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { parseOutline } from './outline';

export const refreshEditorOutline = StateEffect.define<readonly number[]>();

class OutlineToggle extends WidgetType {
    constructor(readonly index: number, readonly collapsed: boolean, readonly toggle: (index: number) => void, readonly isEnglish: boolean) { super(); }
    eq(other: OutlineToggle) { return this.index === other.index && this.collapsed === other.collapsed && this.isEnglish === other.isEnglish; }
    toDOM() {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'cm-outline-toggle';
        button.setAttribute('aria-label', this.isEnglish ? (this.collapsed ? 'Expand' : 'Collapse') : (this.collapsed ? '開く' : '閉じる'));
        button.textContent = this.collapsed ? '›' : '⌄';
        button.addEventListener('mousedown', event => event.preventDefault());
        button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); this.toggle(this.index); });
        return button;
    }
    ignoreEvent() { return true; }
}

class FoldedContent extends WidgetType {
    toDOM() { const span = document.createElement('span'); span.className = 'cm-outline-folded'; span.textContent = ' …'; return span; }
}

export function outlineHiddenRanges(state: EditorState, collapsed: readonly number[]) {
    const lines = parseOutline(state.doc.toString(), collapsed);
    return lines.filter(line => line.hasChildren && !line.hidden && collapsed.includes(line.index)).map(line => ({
        from: state.doc.line(line.index + 1).to,
        to: state.doc.line(line.subtreeEnd + 1).to,
    }));
}

export function editorOutlineExtension(initial: readonly number[], toggle: (index: number) => void, isEnglish: () => boolean = () => false) {
    const collapsedField = StateField.define<readonly number[]>({
        create: () => initial,
        update(value, tr) {
            for (const effect of tr.effects) if (effect.is(refreshEditorOutline)) return effect.value;
            return value;
        },
    });
    const decorations = StateField.define<DecorationSet>({
        create(state) { return build(state); },
        update(value, tr) {
            return tr.docChanged || tr.effects.some(e => e.is(refreshEditorOutline)) ? build(tr.state) : value;
        },
        provide: field => EditorView.decorations.from(field),
    });
    function build(state: EditorState) {
        const collapsed = state.field(collapsedField);
        const lines = parseOutline(state.doc.toString(), collapsed);
        const ranges: { from: number; to: number; value: Decoration }[] = [];
        for (const line of lines) {
            if (line.hidden || !line.hasChildren) continue;
            const start = state.doc.line(line.index + 1);
            const marker = start.from + (start.text.match(/^ */)?.[0].length ?? 0);
            ranges.push({ from: marker, to: marker, value: Decoration.widget({ widget: new OutlineToggle(line.index, collapsed.includes(line.index), toggle, isEnglish()), side: -1 }) });
            if (collapsed.includes(line.index)) {
                ranges.push({ from: start.to, to: state.doc.line(line.subtreeEnd + 1).to, value: Decoration.replace({ widget: new FoldedContent() }) });
            }
        }
        return Decoration.set(ranges.map(r => r.value.range(r.from, r.to)), true);
    }
    return [collapsedField, decorations, EditorState.transactionFilter.of(tr => {
        if (!tr.docChanged) return tr;
        const ranges = outlineHiddenRanges(tr.startState, tr.startState.field(collapsedField));
        let unsafe = false;
        tr.changes.iterChangedRanges((from, to) => {
            if (ranges.some(range => from < range.to && to > range.from || from === to && from > range.from && from < range.to)) unsafe = true;
        });
        return unsafe ? [] : tr;
    })];
}
