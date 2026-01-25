'use client';

import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { open } from '@tauri-apps/plugin-shell';
import { EditorState, Extension, StateField, Compartment, RangeSetBuilder, Transaction, Facet, StateEffect } from '@codemirror/state';
import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate, keymap, WidgetType } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { createRoot } from 'react-dom/client';
import ResizableImage from './ResizableImage';

// Helper to resolve relative path (same as in StickyNote)
const resolvePath = (baseFile: string, relativePath: string) => {
    if (!baseFile) return relativePath;
    if (/^[a-zA-Z]:\\|^\\\\|^http/.test(relativePath)) return relativePath;

    // Extract directory - support both \ and /
    const lastSlash = Math.max(baseFile.lastIndexOf('\\'), baseFile.lastIndexOf('/'));
    const baseDir = lastSlash >= 0 ? baseFile.substring(0, lastSlash) : '';

    // Join and normalize to backslashes for Windows absolute paths
    const combined = `${baseDir}/${relativePath}`.replace(/\//g, '\\');

    // Ensure we don't have double backslashes unless it's UNC
    const absPath = combined.replace(/\\\\+/g, '\\');
    // But if it was UNC, we want to keep the first two
    if (combined.startsWith('\\\\')) {
        return '\\\\' + absPath.substring(1).replace(/\\+/g, '\\');
    }

    return absPath;
};

// [NEW] Image Widget for Live Preview
class ImageWidget extends WidgetType {
    constructor(
        readonly src: string,
        readonly alt: string,
        readonly scale: number,
        readonly filePath: string,
        readonly fullMatch: string
    ) {
        super();
    }

    toDOM(view: EditorView): HTMLElement {
        const container = document.createElement('span');
        container.className = 'cm-image-widget';
        container.style.display = 'inline-block';
        container.style.verticalAlign = 'bottom';

        const resolvedSrc = resolvePath(this.filePath, this.src);

        const root = createRoot(container);
        console.log('[WIDGET] Rendering ResizableImage. Src:', resolvedSrc, 'Scale:', this.scale);
        root.render(
            <ResizableImage
                src={resolvedSrc}
                alt={this.alt}
                scale={this.scale}
                baseOffset={0} // Not needed for widget
                contentReadOnly={false}
                onDragStart={(e) => {
                    e.stopPropagation(); // Stop CodeMirror from handling this drag
                    // Pass the full markdown source AND current position
                    const pos = view.posAtDOM(container);
                    e.dataTransfer.setData('application/x-fusen-markdown', this.fullMatch);
                    if (pos !== null) {
                        e.dataTransfer.setData('application/x-fusen-pos', pos.toString());
                    }
                    console.log('[DRAG] Start. Markdown:', this.fullMatch, 'Pos:', pos);
                }}
                onResizeEnd={(newScale) => {
                    // Update markdown source
                    // Need to find where this widget is in the doc
                    // Since specific widget instance doesn't know its pos, we rely on React closure?
                    // No, toDOM is creating a detached React root.
                    // We need to dispatch a transaction to view.

                    // But where is 'pos'? 
                    // Widget doesn't track its own position live.
                    // We need to implement 'update' or find a way to signal back.
                    // The easiest way is to trigger a custom event or callback that searches for this specific match again?
                    // Or create a closure that calls 'view.dispatch' but we need valid 'from/to'.

                    // Actually, we can pass a callback that uses 'view.posAtDOM(container)'?
                    // Yes, view.posAtDOM(container) should give us the position.

                    const pos = view.posAtDOM(container);
                    if (pos < 0) return;

                    // We need 'from' and 'to' of the replaced decoration.
                    // The decoration covers 'fullMatch'.
                    // So we can replace 'fullMatch' length from pos?
                    // Wait, posAtDOM returns position *before* the widget usually? Or inside?
                    // For a replace decoration, the widget sits at 'from'.

                    // Let's verify:
                    const line = view.state.doc.lineAt(pos);
                    // Match content at pos
                    // We know fullMatch. Check if text at pos matches fullMatch.
                    const text = view.state.doc.sliceString(pos, pos + this.fullMatch.length);
                    // Check logic
                    // If text != match, maybe pos is slightly off or doc changed.

                    // Construct replacement: ![alt|newScale](src)
                    const newMarkdown = `![${this.alt}|${newScale}](${this.src})`;

                    view.dispatch({
                        changes: { from: pos, to: pos + this.fullMatch.length, insert: newMarkdown }
                    });
                }}
            />
        );
        return container;
    }

    ignoreEvent() { return true; }

    eq(other: ImageWidget): boolean {
        return other.src === this.src &&
            other.alt === this.alt &&
            other.scale === this.scale &&
            other.filePath === this.filePath &&
            other.fullMatch === this.fullMatch;
    }
}

// [NEW] ViewPlugin to detect images and replace with Widgets
const imagePreviewPlugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
        this.decorations = this.computeDecorations(view);
    }

    update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
            this.decorations = this.computeDecorations(update.view);
        }
    }

    computeDecorations(view: EditorView) {
        const builder = new RangeSetBuilder<Decoration>();
        const { doc } = view.state;
        const filePath = view.state.facet(filePathFacet); // Access filePath from facet

        // Simple regex scan over visible ranges (or whole doc for simplicity if small)
        // Sticky Notes are small, scanning whole doc is fine.
        for (const { from, to } of view.visibleRanges) {
            const text = doc.sliceString(from, to);
            // Regex for ![alt](src) or ![alt|scale](src)
            // Need global flag
            const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
            let match;

            while ((match = imgRegex.exec(text))) {
                const fullMatch = match[0];
                console.log('[PLUGIN] Found image match:', fullMatch);
                const altRaw = match[1];
                const src = match[2];
                const start = from + match.index;
                const end = start + fullMatch.length;

                // Parse scale
                const altParts = altRaw.split('|');
                const realAlt = altParts[0];
                let scale = 1.0;
                if (altParts.length > 1) {
                    const s = parseFloat(altParts[1]);
                    if (!isNaN(s)) scale = s;
                }

                builder.add(start, end, Decoration.replace({
                    widget: new ImageWidget(src, realAlt, scale, filePath, fullMatch),
                    inclusive: false
                }));
            }
        }
        return builder.finish();
    }
}, {
    decorations: v => v.decorations
});

// [NEW] Facet to pass filePath to extensions
const filePathFacet = Facet.define<string, string>({
    combine: (values: readonly string[]) => values[0] || ''
});

interface RichTextEditorProps {
    value: string;
    onChange: (value: string) => void;
    filePath: string; // [NEW] Needed for relative path resolution

    onKeyDown?: (e: React.KeyboardEvent) => void;
    backgroundColor: string;
    cursorPosition?: number | null; // 初期カーソル位置（文字オフセット）
    isNewNote?: boolean; // [NEW] 新規付箋フラグ（新規時のみプレースホルダ+選択）
    fontSize?: number; // 設定からのフォントサイズ（デフォルト: 16px）
    onInsertHeading1?: () => void; // 見出し1挿入リクエスト（外部から呼ぶ用）
    onInsertBold?: () => void; // 強調挿入リクエスト（外部から呼ぶ用）
}

// 外部から呼べるメソッドの型定義
export interface RichTextEditorRef {
    insertHeading1: () => void;
    insertBold: () => void;
    insertList: () => void;
    insertCheckbox: () => void;
    focus: () => void; // カーソル位置を変えずにフォーカスだけ当てる
    setCursorToEnd: () => void; // カーソルを末尾に配置
    setCursor: (offset: number) => void; // カーソルを指定位置に配置
    setSelection: (start: number, end: number) => void; // [New] 範囲選択を設定
    getContent: () => string; // [New] 最新の内容を同期的に取得
    insertText: (text: string) => void; // [New] カーソル位置にテキスト挿入
}

// Decoration用のプラグイン（見出しと強調のみ）
const markdownDecorations = StateField.define<DecorationSet>({
    create(state) {
        return buildDecorations(state);
    },
    update(decorations, tr) {
        if (tr.docChanged) {
            return buildDecorations(tr.state);
        }
        return decorations.map(tr.changes);
    },
    provide: f => EditorView.decorations.from(f)
});

function buildDecorations(state: EditorState): DecorationSet {
    const decorations: any[] = [];

    for (let i = 1; i <= state.doc.lines; i++) {
        const line = state.doc.line(i);
        const text = line.text;

        // 見出し: 行頭 # 
        const h1Match = text.match(/^(#)\s+(.+)$/);
        if (h1Match) {
            const markerStart = line.from;
            const markerEnd = line.from + 2; // "# "
            const titleStart = markerEnd;
            const titleEnd = line.to;

            decorations.push(
                Decoration.mark({ class: 'cm-md-marker' }).range(markerStart, markerEnd - 1),
                Decoration.mark({ class: 'cm-md-h1' }).range(titleStart, titleEnd)
            );
            continue;
        }

        // リスト / チェックボックス
        const taskMatch = text.match(/^([\-\*\+]\s+\[[ xX]\]\s+)(.*)$/);
        const listMatch = !taskMatch && text.match(/^([\-\*\+]\s+)(.*)$/);

        if (taskMatch) {
            const markerLen = taskMatch[1].length;
            decorations.push(
                Decoration.mark({ class: 'cm-md-marker' }).range(line.from, line.from + markerLen)
            );
        } else if (listMatch) {
            const markerLen = listMatch[1].length;
            decorations.push(
                Decoration.mark({ class: 'cm-md-marker' }).range(line.from, line.from + markerLen)
            );
        }

        // リンク: [text](url)
        const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        let lMatch;
        while ((lMatch = linkRegex.exec(text)) !== null) {
            decorations.push(
                Decoration.mark({ class: 'cm-md-marker' }).range(line.from + lMatch.index, line.from + lMatch.index + 1), // [
                Decoration.mark({ class: 'cm-md-link-text' }).range(line.from + lMatch.index + 1, line.from + lMatch.index + 1 + lMatch[1].length),
                Decoration.mark({ class: 'cm-md-marker' }).range(line.from + lMatch.index + 1 + lMatch[1].length, line.from + lMatch.index + 1 + lMatch[1].length + 2), // ](
                Decoration.mark({ class: 'cm-md-link-url' }).range(line.from + lMatch.index + 3 + lMatch[1].length, line.from + lMatch.index + 3 + lMatch[1].length + lMatch[2].length),
                Decoration.mark({ class: 'cm-md-marker' }).range(line.from + lMatch.index + 3 + lMatch[1].length + lMatch[2].length, line.from + lMatch.index + 4 + lMatch[1].length + lMatch[2].length) // )
            );
        }

        // 強調: **text**
        const boldRegex = /(\*\*)([^*]+)(\*\*)/g;
        let match;
        while ((match = boldRegex.exec(text)) !== null) {
            const startPos = line.from + match.index;
            const openMarkerEnd = startPos + 2;
            const contentStart = openMarkerEnd;
            const contentEnd = contentStart + match[2].length;
            const closeMarkerStart = contentEnd;
            const closeMarkerEnd = closeMarkerStart + 2;

            // 開始 ** マーカー
            decorations.push(
                Decoration.mark({
                    class: 'cm-md-marker cm-md-bold-marker'
                }).range(startPos, openMarkerEnd)
            );

            // 強調テキスト
            decorations.push(
                Decoration.mark({
                    class: 'cm-md-bold'
                }).range(contentStart, contentEnd)
            );

            // 終了 ** マーカー
            decorations.push(
                Decoration.mark({
                    class: 'cm-md-marker cm-md-bold-marker'
                }).range(closeMarkerStart, closeMarkerEnd)
            );
        }
    }

    return Decoration.set(decorations, true);
}

// [NEW] Placeholder StateField for new notes only
// Tracks whether to show placeholder (disabled on first docChanged)
// NOTE: StateField is pure logic - does NOT reference React props
const placeholderFlagField = StateField.define<boolean>({
    create(_state) {
        // 初期値はState生成時にのみ注入される（init()から）
        return false; // デフォルトはfalse（既存付箋）
    },
    update(showPlaceholder, tr) {
        // docChangedがあれば即座にfalseにする（二度と復活しない）
        if (tr.docChanged && showPlaceholder) {
            return false;
        }
        return showPlaceholder;
    }
});

// [NEW] Placeholder Decoration Field
// Shows first line in gray when flag is true
// NOTE: Decoration生成は常にtr.state.docを基準にする
const placeholderDecorationField = StateField.define<DecorationSet>({
    create(state) {
        const showPlaceholder = state.field(placeholderFlagField);
        if (!showPlaceholder || state.doc.lines === 0) return Decoration.none;

        const line1 = state.doc.line(1);
        return Decoration.set([
            Decoration.mark({
                class: 'cm-placeholder-line'
            }).range(line1.from, line1.to)
        ], true);
    },
    update(decorations, tr) {
        const showPlaceholder = tr.state.field(placeholderFlagField);
        if (!showPlaceholder) return Decoration.none;

        if (tr.docChanged || tr.startState.field(placeholderFlagField) !== showPlaceholder) {
            const line1 = tr.state.doc.line(1);
            return Decoration.set([
                Decoration.mark({
                    class: 'cm-placeholder-line'
                }).range(line1.from, line1.to)
            ], true);
        }

        return decorations.map(tr.changes);
    },
    provide: f => EditorView.decorations.from(f)
});

// [New] Link Detection Logic
// URL and Windows Path Regex (Drive Letter & UNC)
const LINK_REGEX = /((?:https?:\/\/[^\s]+)|(?:[a-zA-Z]:\\[^:<>"\/?*|\r\n]+)|(?:\\\\[^:<>"\/?*|\r\n]+))/g;

const linkDecorationField = ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
        this.decorations = this.computeDecorations(view);
    }

    update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
            this.decorations = this.computeDecorations(update.view);
        }
    }

    computeDecorations(view: EditorView) {
        const widgets: any[] = [];
        for (const { from, to } of view.visibleRanges) {
            const text = view.state.doc.sliceString(from, to);
            let match;
            // Reset regex state just in case
            LINK_REGEX.lastIndex = 0;

            while ((match = LINK_REGEX.exec(text))) {
                const start = from + match.index;
                const end = start + match[0].length;
                widgets.push(Decoration.mark({
                    class: 'cm-link',
                    attributes: { title: 'Ctrl + Click to open' }
                }).range(start, end));
            }
        }
        return Decoration.set(widgets, true); // true = sorted
    }
}, {
    decorations: v => v.decorations
});

const linkEventHandler = EditorView.domEventHandlers({
    mousedown(event, view) {
        // Only trigger on Ctrl + Click (or Meta + Click)
        if (!event.ctrlKey && !event.metaKey) return;

        const target = event.target as HTMLElement;
        // Check if clicked element is part of a link
        if (target.closest('.cm-link')) {
            // Find position
            const pos = view.posAtDOM(target);
            // Find full link text at this position
            // Simple approach: get the line and match regex again to find the specific link
            // Better approach: use the decorations, but we don't have easy access here.
            // Fallback: Scan around cursor.

            // Optimized: target text content is likely the link part because of how CodeMirror renders
            // But CM might split text.
            // Let's get the token at position.

            const line = view.state.doc.lineAt(pos);
            const lineText = line.text;
            const offsetInLine = pos - line.from;

            // Re-run regex on line to find the link at this offset
            let match;
            LINK_REGEX.lastIndex = 0;
            while ((match = LINK_REGEX.exec(lineText))) {
                const start = match.index;
                const end = start + match[0].length;
                if (offsetInLine >= start && offsetInLine <= end) {
                    const link = match[0];
                    console.log('[LinkClick] Opening:', link);
                    event.preventDefault();

                    if (/^https?:\/\//i.test(link)) {
                        open(link).catch(e => console.error('Failed to open link:', e));
                    } else {
                        // Import invoke specifically for this action if not available in scope, 
                        // or assume invoke is available (usually needs import).
                        // Dynamic import to be safe and avoid top-level dependency if not used elsewhere
                        import('@tauri-apps/api/core').then(({ invoke }) => {
                            invoke('fusen_open_file', { path: link })
                                .catch(e => console.error('Failed to open file:', e));
                        });
                    }
                    return;
                }
            }
        }
    }
});

const RichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>(({
    value,
    onChange,
    filePath, // [NEW]

    onKeyDown,
    backgroundColor,
    cursorPosition,
    isNewNote = false, // [NEW] デフォルトはfalse（既存付箋）
    fontSize = 16 // デフォルトは16px
}, ref) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const themeCompartment = useRef(new Compartment());
    const filePathCompartment = useRef(new Compartment());

    // 外部から呼べるメソッドを公開
    useImperativeHandle(ref, () => ({
        getContent: () => {
            return viewRef.current?.state.doc.toString() ?? '';
        },
        insertHeading1: () => {
            if (!viewRef.current) return;
            const view = viewRef.current;
            const { state } = view;
            const { from, to } = state.selection.main;
            const lineStart = state.doc.lineAt(from).number;
            const lineEnd = state.doc.lineAt(to).number;

            const changes: any[] = [];
            let allHave = true;
            for (let i = lineStart; i <= lineEnd; i++) {
                if (!state.doc.line(i).text.startsWith('# ')) {
                    allHave = false;
                    break;
                }
            }

            for (let i = lineStart; i <= lineEnd; i++) {
                const line = state.doc.line(i);
                if (allHave) {
                    changes.push({ from: line.from, to: line.from + 2 });
                } else {
                    if (!line.text.startsWith('# ')) {
                        changes.push({ from: line.from, to: line.from, insert: '# ' });
                    }
                }
            }

            view.dispatch({ changes });
            view.focus();
        },
        insertList: () => {
            if (!viewRef.current) return;
            const view = viewRef.current;
            const { state } = view;
            const { from, to } = state.selection.main;
            const lineStart = state.doc.lineAt(from).number;
            const lineEnd = state.doc.lineAt(to).number;

            const changes: any[] = [];
            let allHave = true;
            for (let i = lineStart; i <= lineEnd; i++) {
                if (!state.doc.line(i).text.startsWith('- ')) {
                    allHave = false;
                    break;
                }
            }

            for (let i = lineStart; i <= lineEnd; i++) {
                const line = state.doc.line(i);
                if (allHave) {
                    changes.push({ from: line.from, to: line.from + 2 });
                } else if (!line.text.startsWith('- ')) {
                    changes.push({ from: line.from, to: line.from, insert: '- ' });
                }
            }

            view.dispatch({ changes });
            view.focus();
        },
        insertCheckbox: () => {
            if (!viewRef.current) return;
            const view = viewRef.current;
            const { state } = view;
            const { from, to } = state.selection.main;
            const lineStart = state.doc.lineAt(from).number;
            const lineEnd = state.doc.lineAt(to).number;

            const changes: any[] = [];
            let allHave = true;
            for (let i = lineStart; i <= lineEnd; i++) {
                if (!state.doc.line(i).text.startsWith('- [ ] ')) {
                    allHave = false;
                    break;
                }
            }

            for (let i = lineStart; i <= lineEnd; i++) {
                const line = state.doc.line(i);
                if (allHave) {
                    changes.push({ from: line.from, to: line.from + 6 });
                } else if (!line.text.startsWith('- [ ] ')) {
                    changes.push({ from: line.from, to: line.from, insert: '- [ ] ' });
                }
            }

            view.dispatch({ changes });
            view.focus();
        },
        insertBold: () => {
            if (!viewRef.current) return;
            const view = viewRef.current;
            const { state } = view;
            const selection = state.selection.main;
            const { from, to } = selection;

            if (from === to) {
                // カーソルのみの場合： **** を挿入して中にカーソルを置く
                view.dispatch({
                    changes: { from, to, insert: '****' },
                    selection: { anchor: from + 2, head: from + 2 }
                });
            } else {
                const selectedText = state.doc.sliceString(from, to);

                // 複数行にまたがっているかチェック
                if (selectedText.includes('\n')) {
                    const lines = selectedText.split('\n');
                    // 全ての非空行が ** で囲まれているかチェック
                    const allBolded = lines.every(l => l.trim() === '' || (l.startsWith('**') && l.endsWith('**')));

                    const newLines = lines.map(l => {
                        if (l.trim() === '') return l;
                        if (allBolded) {
                            return l.slice(2, -2);
                        } else {
                            if (l.startsWith('**') && l.endsWith('**')) return l;
                            return `**${l}**`;
                        }
                    });

                    const newContent = newLines.join('\n');
                    view.dispatch({
                        changes: { from, to, insert: newContent },
                        selection: { anchor: from, head: from + newContent.length }
                    });
                } else {
                    // 単一行の選択
                    if (selectedText.startsWith('**') && selectedText.endsWith('**')) {
                        // 解除
                        const unbolded = selectedText.slice(2, -2);
                        view.dispatch({
                            changes: { from, to, insert: unbolded },
                            selection: { anchor: from, head: from + unbolded.length }
                        });
                    } else {
                        // 適用
                        const bolded = `**${selectedText}**`;
                        view.dispatch({
                            changes: { from, to, insert: bolded },
                            selection: { anchor: from, head: from + bolded.length }
                        });
                    }
                }
            }
            view.focus();
        },
        focus: () => {
            if (!viewRef.current) return;
            viewRef.current.focus();
        },
        setCursorToEnd: () => {
            if (!viewRef.current) return;
            const docLength = viewRef.current.state.doc.length;
            viewRef.current.dispatch({
                selection: { anchor: docLength, head: docLength }
            });
            viewRef.current.focus();
        },
        setCursor: (offset: number) => {
            if (!viewRef.current) return;
            const docLength = viewRef.current.state.doc.length;
            const safeOffset = Math.min(Math.max(0, offset), docLength);
            viewRef.current.dispatch({
                selection: { anchor: safeOffset, head: safeOffset }
            });
            viewRef.current.focus();
        },
        setSelection: (start: number, end: number) => {
            if (!viewRef.current) return;
            const view = viewRef.current;
            const docLength = view.state.doc.length;

            const a = Math.min(Math.max(0, start), docLength);
            const b = Math.min(Math.max(0, end), docLength);
            const anchor = Math.min(a, b);
            const head = Math.max(a, b);
            view.dispatch({
                selection: { anchor, head },
                scrollIntoView: true
            });
            view.focus();
        },
        insertText: (text: string) => {
            if (!viewRef.current) {
                console.error('[EDITOR] insertText: viewRef is null');
                return;
            }
            const view = viewRef.current;
            const { state } = view;
            const { from, to } = state.selection.main;

            console.log(`[EDITOR] insertText: "${text}" at range [${from}, ${to}]`);

            view.dispatch({
                changes: { from, to, insert: text },
                // カーソルを挿入テキストの後ろへ
                selection: { anchor: from + text.length, head: from + text.length },
                scrollIntoView: true,
            });
            view.focus();
        },
        view: viewRef.current
    }));

    useEffect(() => {
        if (!editorRef.current) return;

        // EditorView 作成
        const view = new EditorView({
            state: EditorState.create({
                doc: value,
                extensions: [
                    // 編集可能に設定（重要）
                    EditorView.editable.of(true),
                    // 基本的な編集機能
                    history(),
                    keymap.of([
                        ...defaultKeymap,
                        ...historyKeymap
                    ]),
                    // Markdown装飾
                    markdownDecorations,
                    // [NEW] Placeholder for new notes
                    // NOTE: 新規判定はState生成時にのみ注入する
                    placeholderFlagField,
                    placeholderDecorationField,
                    linkDecorationField, // [New]
                    linkEventHandler,    // [New]
                    imagePreviewPlugin,  // [NEW]
                    filePathFacet.of(filePath), // [NEW] Inject filePath
                    ...(isNewNote ? [
                        // 新規付箋の場合のみinit()でtrueを注入
                        placeholderFlagField.init(() => true)
                    ] : []),
                    // 変更検知
                    EditorView.updateListener.of((update: ViewUpdate) => {
                        if (update.docChanged) {
                            onChange(update.state.doc.toString());
                        }
                    }),
                    // イベントハンドラ
                    EditorView.domEventHandlers({
                        blur: (e, view) => {
                            console.log('[RichTextEditor] Blur ignored (managed by parent)');
                        },
                        keydown: (e) => {
                            if (e.key === 'Escape' && onKeyDown) {
                                onKeyDown(e as any);
                            }
                        },
                        // [FIX] Pasteハンドラの追加：カーソル位置への画像挿入
                        paste: (e, view) => {
                            console.log('[EDITOR] Paste event detected');
                            const items = e.clipboardData?.items;
                            if (!items) return;

                            for (const item of items) {
                                console.log('[EDITOR] Paste item type:', item.type);
                                if (item.type.startsWith('image/')) {
                                    e.preventDefault(); // デフォルト挙動（末尾追加など）を阻止

                                    const file = item.getAsFile();
                                    if (!file) {
                                        console.warn('[EDITOR] Paste: Failed to get file from item');
                                        continue;
                                    }

                                    // カーソル位置の取得
                                    const currentPos = view.state.selection.main.from;
                                    console.log('[EDITOR] Paste: Inserting image at pos:', currentPos);

                                    // TODO: ここでTauri(Rust)側の画像保存コマンドを呼び出し、保存されたパスを受け取る
                                    // const savedPath = await invoke('save_image', { ... });
                                    // とりあえず今回は「カーソル位置への挿入」の検証のためダミーを使用
                                    const imagePath = "image_path_placeholder.png";
                                    const markdown = `![image](${imagePath})`;

                                    // カーソル位置に挿入し、カーソルを画像の直後に移動
                                    view.dispatch({
                                        changes: {
                                            from: currentPos,
                                            to: currentPos,
                                            insert: markdown
                                        },
                                        selection: {
                                            anchor: currentPos + markdown.length,
                                            head: currentPos + markdown.length
                                        }
                                    });
                                    return;
                                }
                            }
                        },
                        dragenter: (e) => {
                            e.preventDefault();
                            if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                        },
                        dragover: (e, view) => {
                            e.preventDefault();
                            if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

                            // ドラッグ中のカーソル位置追従
                            const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
                            if (pos !== null) {
                                if (view.state.selection.main.anchor !== pos) {
                                    view.dispatch({ selection: { anchor: pos, head: pos } });
                                }
                            }
                        },
                        // [FIX] Dropハンドラの修正：座標ベースの移動ロジックへ変更
                        drop: (e, view) => {
                            if (e.dataTransfer?.types.includes('application/x-fusen-image')) {
                                e.preventDefault();
                                e.stopPropagation();

                                const dropPos = view.posAtCoords({ x: e.clientX, y: e.clientY });
                                console.log('[DRAG] Drop event. Drop Coords:', { x: e.clientX, y: e.clientY }, 'DropPos:', dropPos);
                                if (dropPos === null) {
                                    console.error('[DRAG] Failed to calculate drop position from coords');
                                    return;
                                }

                                // Widgetから送られてきた正確な「元位置」を取得
                                const posString = e.dataTransfer.getData('application/x-fusen-pos');
                                const draggedMarkdown = e.dataTransfer.getData('application/x-fusen-markdown');

                                console.log('[DRAG] Drop Data - PosString:', posString, 'Markdown:', draggedMarkdown);

                                if (!posString || !draggedMarkdown) {
                                    console.error('[DRAG] Missing drag data');
                                    return;
                                }

                                const oldPos = parseInt(posString, 10);
                                if (isNaN(oldPos)) {
                                    console.error('[DRAG] Invalid start position:', posString);
                                    return;
                                }

                                // 同じ場所にドロップした場合は無視
                                if (dropPos >= oldPos && dropPos <= oldPos + draggedMarkdown.length) {
                                    console.log('[DRAG] Dropped on itself. Ignoring.');
                                    return;
                                }

                                console.log(`[DRAG] Executing Move: ${oldPos} -> ${dropPos}`);

                                // 移動：元の削除と新しい場所への挿入をアトミックに実行
                                // 削除によって位置がずれるため、削除箇所と挿入箇所の前後関係で補正が必要だが、
                                // CodeMirrorのTransactionは賢いのでchanges配列で同時処理すれば整合性が取れる
                                view.dispatch({
                                    changes: [
                                        { from: oldPos, to: oldPos + draggedMarkdown.length, insert: '' }, // 削除
                                        { from: dropPos, to: dropPos, insert: draggedMarkdown }            // 挿入
                                    ],
                                    // ドロップ先にカーソルを合わせる
                                    selection: { anchor: dropPos, head: dropPos }
                                });
                            }
                        }
                    }),
                    // テーマ (動的更新用Compartment)
                    themeCompartment.current.of(EditorView.theme({
                        '&': {
                            fontFamily: '"BIZ UDPGothic", "Meiryo", "Yu Gothic UI", sans-serif',
                            fontSize: `${fontSize}px`,
                            lineHeight: '1.4',
                            letterSpacing: '0.01em',
                            backgroundColor: backgroundColor,
                        },
                        '&.cm-focused': {
                            outline: 'none'
                        },
                        '.cm-content': {
                            padding: '0px',
                            caretColor: '#333',
                            whiteSpace: 'pre-wrap',
                            wordWrap: 'break-word',
                        },
                        '.cm-line': {
                            padding: '0px',
                        },
                        // Markdown装飾の追加スタイル
                        '.cm-md-marker': {
                            color: '#ff8c00', // 装飾であることをアピールするオレンジ色
                            opacity: 0.6,      // 視認性確保
                        },
                        '.cm-md-h1': {
                            fontWeight: '700',
                            fontSize: '1.1em',
                        },
                        '.cm-md-bold': {
                            fontWeight: '700',
                            color: 'red',
                        },
                        // エディタ内の全ての文字にフォントを強制適用 (英語monospace化防止)
                        '.cm-content, .cm-content *': {
                            fontFamily: '"BIZ UDPGothic", "Meiryo", "Yu Gothic UI", sans-serif !important',
                            fontSize: `${fontSize}px`,
                            lineHeight: '1.4',
                            letterSpacing: '0.01em',
                        },
                        // [NEW] Placeholder style for new notes
                        '.cm-placeholder-line': {
                            color: '#999',
                            opacity: 0.6,
                        }
                    }))
                ]
            }),
            parent: editorRef.current
        });

        viewRef.current = view;

        // [NEW] 初期選択処理（作成直後に一度だけ予約）
        if (isNewNote) {
            view.focus();
            requestAnimationFrame(() => {
                if (view.state.doc.lines > 0) {
                    const line1 = view.state.doc.line(1);
                    view.dispatch({
                        selection: { anchor: line1.from, head: line1.to },
                        scrollIntoView: true
                    });
                }
            });
        }

        // 初期カーソル位置が指定されている場合は適用＆フォーカス（新規付箋以外）
        if (cursorPosition !== undefined && cursorPosition !== null) {
            // ドキュメントの長さを超えないようにガード
            const safePos = Math.min(cursorPosition, value.length);
            view.dispatch({
                selection: { anchor: safePos, head: safePos }
            });
            // 即座にフォーカス (setTimeoutなしで試みる)
            view.focus();

            // 安全策：少し遅延してもフォーカス
            setTimeout(() => {
                if (viewRef.current && !viewRef.current.hasFocus) {
                    viewRef.current.focus();
                }
            }, 10);
        }

        return () => {
            view.destroy();
            viewRef.current = null;
        };
    }, []); // 初回マウント時のみ作成



    // [New] cursorPosition change handler
    useEffect(() => {
        if (cursorPosition === undefined || cursorPosition === null) return;
        if (!viewRef.current) return;

        const view = viewRef.current;
        const docLength = view.state.doc.length;
        const safePos = Math.min(Math.max(0, cursorPosition), docLength);

        // 描画/初回ロードのズレに勝つため2フレームで確実にfocus
        requestAnimationFrame(() => {
            view.dispatch({ selection: { anchor: safePos, head: safePos } });
            view.focus();
            requestAnimationFrame(() => {
                view.focus();
            });
        });
    }, [cursorPosition]);

    // [New] reconfigure filePath when it changes
    useEffect(() => {
        if (!viewRef.current) return;
        viewRef.current.dispatch({
            effects: filePathCompartment.current.reconfigure(filePathFacet.of(filePath))
        });
    }, [filePath]);

    useEffect(() => {
        if (!viewRef.current) return;
        viewRef.current.dispatch({
            effects: themeCompartment.current.reconfigure(EditorView.theme({
                '&': {
                    fontFamily: '"BIZ UDPGothic", "Meiryo", "Yu Gothic UI", sans-serif',
                    fontSize: `${fontSize}px`,
                    lineHeight: '1.4',
                    letterSpacing: '0.01em',
                    backgroundColor: backgroundColor,
                    outline: 'none !important', // [Fix] Remove black dotted outline
                    padding: '0 !important', // Ensure no internal padding
                },
                '.cm-content': {
                    padding: '0 !important',
                },
                '.cm-line': {
                    padding: '0 !important',
                },
                '.cm-content, .cm-content *': {
                    fontFamily: '"BIZ UDPGothic", "Meiryo", "Yu Gothic UI", sans-serif !important',
                    fontSize: `${fontSize}px`,
                    lineHeight: '1.4',
                    letterSpacing: '0.01em',
                },
                '.cm-md-h1': {
                    fontSize: '1.1em',
                }
            }))
        });
    }, [fontSize, backgroundColor]);

    // value が外部から変更された場合の同期
    useEffect(() => {
        if (!viewRef.current) return;
        const currentValue = viewRef.current.state.doc.toString();
        if (currentValue !== value) {
            // 選択範囲を保存
            const selection = viewRef.current.state.selection.main;

            viewRef.current.dispatch({
                changes: {
                    from: 0,
                    to: currentValue.length,
                    insert: value
                },
                // 選択範囲を復元（新しいドキュメント範囲内に収める）
                selection: {
                    anchor: Math.min(selection.anchor, value.length),
                    head: Math.min(selection.head, value.length)
                }
            });
        }
    }, [value]);

    return (
        <div
            ref={editorRef}
            style={{
                width: '100%',
                minHeight: '100px',
                backgroundColor: backgroundColor
            }}
        />
    );
});

RichTextEditor.displayName = 'RichTextEditor';

export default RichTextEditor;
