/**
 * リッチテキストエディタ (CodeMirror Wrapper)
 *
 * 責務:
 * - CodeMirror 6 を使用したMarkdown編集機能の提供
 * - シンタックスハイライト、キーバインド等のエディタ設定
 * - 編集内容の変更検知と親コンポーネントへの通知
 */

'use client';

import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { open } from '@tauri-apps/plugin-shell';
import { EditorState, EditorSelection, Extension, StateField, Compartment, RangeSetBuilder, Transaction, Facet, StateEffect, Line } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { highlightSelectionMatches, search, setSearchQuery, SearchQuery } from '@codemirror/search';
import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate, keymap, WidgetType } from '@codemirror/view'; // Remove scrollPastEnd
import { createRoot } from 'react-dom/client';
import ResizableImage from './ResizableImage';
import { createLinkTargetRegex, isAbsoluteOrExternalPath } from '../utils/pathUtils';

// Helper to resolve relative path (same as in StickyNote)
const resolvePath = (baseFile: string, relativePath: string) => {
    if (!baseFile) return relativePath;
    if (isAbsoluteOrExternalPath(relativePath)) return relativePath;

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
        root.render(
            <ResizableImage
                src={resolvedSrc}
                alt={this.alt}
                scale={this.scale}
                baseOffset={0} // Not needed for widget
                markdownFallback={this.fullMatch}
                contentReadOnly={false}
                onDragStart={(e) => {
                    e.stopPropagation(); // Stop CodeMirror from handling this drag
                    // Pass the full markdown source AND current position
                    const pos = view.posAtDOM(container);
                    e.dataTransfer.setData('application/x-fusen-markdown', this.fullMatch);
                    if (pos !== null) {
                        e.dataTransfer.setData('application/x-fusen-pos', pos.toString());
                    }
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
        const filePathChanged = update.startState.facet(filePathFacet) !== update.state.facet(filePathFacet);
        if (update.docChanged || update.viewportChanged || filePathChanged) {
            this.decorations = this.computeDecorations(update.view);
        }
    }

    computeDecorations(view: EditorView) {
        return buildImagePreviewDecorations(
            view.state.doc,
            view.visibleRanges,
            view.state.facet(filePathFacet)
        );
    }
}, {
    decorations: v => v.decorations
});

export function buildImagePreviewDecorations(
    doc: EditorState['doc'],
    visibleRanges: readonly { from: number; to: number }[],
    filePath: string
): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const visitedLines = new Set<number>();

    for (const { from, to } of visibleRanges) {
        let line = doc.lineAt(from);
        while (line.from <= to) {
            if (!visitedLines.has(line.number)) {
                visitedLines.add(line.number);
                addImagePreviewDecorationsForLine(builder, line, filePath);
            }

            if (line.to >= to || line.number >= doc.lines) break;
            line = doc.line(line.number + 1);
        }
    }

    return builder.finish();
}

function addImagePreviewDecorationsForLine(
    builder: RangeSetBuilder<Decoration>,
    line: Line,
    filePath: string
) {
    // 1行内で完結する画像Markdownだけをプレビュー化する。
    const imgRegex = /!\[([^\]\r\n]*)\]\(([^)\r\n]+)\)/g;
    let match;

    while ((match = imgRegex.exec(line.text))) {
        const fullMatch = match[0];
        const altRaw = match[1];
        const src = match[2];
        const start = line.from + match.index;
        const end = start + fullMatch.length;

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

// [NEW] Facet to pass filePath to extensions
const filePathFacet = Facet.define<string, string>({
    combine: (values: readonly string[]) => values[0] || ''
});

export interface RichTextEditorProps {
    value: string;
    onChange: (value: string) => void;
    filePath: string; // [NEW] Needed for relative path resolution

    onKeyDown?: (e: React.KeyboardEvent) => void;
    backgroundColor: string;
    cursorPosition?: number | null; // 初期カーソル位置（文字オフセット）
    initialCoords?: { x: number, y: number } | null; // [NEW] 初期カーソル位置（座標）
    isNewNote?: boolean; // [NEW] 新規付箋フラグ（新規時のみプレースホルダ+選択）
    fontSize?: number; // 設定からのフォントサイズ（デフォルト: 16px）
    onInsertHeading1?: () => void; // 見出し1挿入リクエスト（外部から呼ぶ用）
    onInsertBold?: () => void; // 強調挿入リクエスト（外部から呼ぶ用）
    onBlur?: (event?: FocusEvent) => void; // フォーカスが外れた時
    onSelectionChange?: (coords: { top: number; left: number; bottom: number } | null) => void; // テキスト選択変化
    // [NEW] Pool 窓用: 0→1 文字遷移を検出して 1 回だけ呼ぶコールバック（IME 未確定中も含む）
    onFirstChar?: () => void;
    // Pool 窓用: 画像貼り付けなど文字入力以外でも保存先ファイルを確保する
    onEnsureFilePath?: () => Promise<string | null>;
}

// 外部から呼べるメソッドの型定義
export interface RichTextEditorRef {
    insertHeading1: () => void;
    insertBold: () => void;
    insertList: () => void;
    insertCheckbox: () => void;
    insertTable: () => void; // テキスト↔テーブル変換トグル
    insertMermaid: () => void; // テキスト↔Mermaid図変換トグル
    focus: () => void; // カーソル位置を変えずにフォーカスだけ当てる
    focusAndSelectFirstLine: () => void; // 新規作成時用：フォーカスし、先頭にカーソルを置く
    setCursorToEnd: () => void; // カーソルを末尾に配置
    setCursorToLineEnd: (clientX: number, clientY: number) => void; // クリック座標の行末にカーソルを配置
    setCursorAtCoords: (clientX: number, clientY: number) => void; // [NEW] クリック座標に最も近いテキスト位置にカーソルを配置
    isFooterArea: (clientY: number) => boolean; // [NEW] 指定したY座標がエディタ本文より下のフッタ領域かどうか判定する
    setCursor: (offset: number) => void; // カーソルを指定位置に配置
    setSelection: (start: number, end: number) => void; // [New] 範囲選択を設定
    getContent: () => string; // [New] 最新の内容を同期的に取得
    insertText: (text: string) => void; // [New] カーソル位置にテキスト挿入
    highlightQuery: (query: string) => void; // [NEW] 検索語をハイライト
    clearHighlight: () => void; // [NEW] ハイライトをクリア
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
            // continue; // [Fix] Allow other decorations (bold/link) inside header
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
        const boldRegex = /(\*\*)(.*?)(\*\*)/g;
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

            // 強調テキスト（空rangeは不可）
            if (contentStart < contentEnd) {
                decorations.push(
                    Decoration.mark({
                        class: 'cm-md-bold'
                    }).range(contentStart, contentEnd)
                );
            }

            // 終了 ** マーカー
            decorations.push(
                Decoration.mark({
                    class: 'cm-md-marker cm-md-bold-marker'
                }).range(closeMarkerStart, closeMarkerEnd)
            );
        }
    }

    // [Fix] Ensure decorations are sorted, as we push them from multiple independent passes
    decorations.sort((a, b) => a.from - b.from || a.startSide - b.startSide);

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
        if (line1.from >= line1.to) return Decoration.none; // 空行ガード
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
            if (line1.from >= line1.to) return Decoration.none; // 空行ガード
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
const LINK_REGEX = createLinkTargetRegex();

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
                    event.preventDefault();

                    if (/^https?:\/\//i.test(link)) {
                        open(link).catch(e => {
                            console.error('Failed to open link:', e);
                            alert(`リンクを開けませんでした。\n${link}`);
                        });
                    } else {
                        import('@tauri-apps/api/core').then(({ invoke }) => {
                            invoke('fusen_open_file', { path: link })
                                .catch(e => {
                                    console.error('Failed to open file:', e);
                                    alert(`ファイルを開けませんでした。\n${link}`);
                                });
                        });
                    }
                    return;
                }
            }
        }
    }
});

const stripLinePrefix = (text: string): string => {
    return text
        .replace(/^#{1,6}\s+/, '')
        .replace(/^[\-\*\+]\s+\[[ xX]\]\s+/, '')
        .replace(/^[\-\*\+]\s+/, '');
};

const hasLinePrefix = (text: string, prefix: 'heading' | 'list' | 'checkbox'): boolean => {
    if (prefix === 'heading') return /^#\s+/.test(text);
    if (prefix === 'checkbox') return /^[\-\*\+]\s+\[[ xX]\]\s+/.test(text);
    return /^[\-\*\+]\s+/.test(text) && !/^[\-\*\+]\s+\[[ xX]\]\s+/.test(text);
};

const canApplyLinePrefix = (text: string): boolean => {
    return text.trim() !== '' && !/!\[.*?\]\(.*?\)/.test(text);
};

const getSelectedLineRange = (state: EditorState, from: number, to: number): { lineStart: number; lineEnd: number } => {
    const lineStart = state.doc.lineAt(from).number;
    const toLine = state.doc.lineAt(to);
    const lineEnd = to > from && toLine.from === to
        ? toLine.number - 1
        : toLine.number;
    return { lineStart, lineEnd };
};

const formatLineWithPrefix = (text: string, prefix: 'heading' | 'list' | 'checkbox'): string => {
    if (text.trim() === '') return text;
    const body = stripLinePrefix(text);
    if (prefix === 'heading') return `# ${body}`;
    if (prefix === 'checkbox') return `- [ ] ${body}`;
    return `- ${body}`;
};

const selectVisualLine = (view: EditorView, forward: boolean): boolean => {
    const range = view.state.selection.main;
    const coords = view.coordsAtPos(range.head, forward ? 1 : -1);
    if (!coords) return false;

    const contentRect = view.contentDOM.getBoundingClientRect();
    const x = Math.max(coords.left + 2, contentRect.left + 2);
    const y = forward ? coords.bottom + 2 : coords.top - 2;
    let head = view.posAtCoords({ x, y });

    if (head === null || head === range.head) {
        head = view.moveVertically(range, forward).head;
    }
    if (head === range.head) return false;

    view.dispatch({
        selection: EditorSelection.create([EditorSelection.range(range.anchor, head)]),
        scrollIntoView: true,
    });
    return true;
};

const IMAGE_MARKDOWN_LINE_REGEX = /^\s*!\[[^\]]*\]\([^)]+\)\s*$/;

const moveFromImageLineEnd = (view: EditorView, direction: 'left' | 'right'): boolean => {
    const range = view.state.selection.main;
    if (!range.empty) return false;

    const line = view.state.doc.lineAt(range.head);
    if (range.head <= line.from || !IMAGE_MARKDOWN_LINE_REGEX.test(line.text)) {
        return false;
    }

    const target = direction === 'left'
        ? line.from
        : line.number < view.state.doc.lines
            ? view.state.doc.line(line.number + 1).from
            : view.state.doc.length;

    if (target === range.head) return false;

    view.dispatch({
        selection: { anchor: target, head: target },
        scrollIntoView: true,
    });
    return true;
};

const RichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>((props, ref) => {
    const { value, onChange, filePath, onKeyDown, backgroundColor, cursorPosition, initialCoords, isNewNote, fontSize = 16, onBlur, onSelectionChange, onFirstChar, onEnsureFilePath } = props;
    const editorRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const themeCompartment = useRef(new Compartment());
    const filePathCompartment = useRef(new Compartment());
    const isReadyRef = useRef(false); // [NEW] 初期化直後の誤検知防止用フラグ
    const suppressFormatBarUntilRef = useRef(0);
    const latestFilePathRef = useRef(filePath);
    const latestOnEnsureFilePathRef = useRef(onEnsureFilePath);
    const latestOnChangeRef = useRef(onChange);
    const latestOnKeyDownRef = useRef(onKeyDown);
    const latestOnBlurRef = useRef(onBlur);
    const latestOnSelectionChangeRef = useRef(onSelectionChange);
    const latestOnFirstCharRef = useRef(onFirstChar);
    latestFilePathRef.current = filePath;
    latestOnEnsureFilePathRef.current = onEnsureFilePath;
    latestOnChangeRef.current = onChange;
    latestOnKeyDownRef.current = onKeyDown;
    latestOnBlurRef.current = onBlur;
    latestOnSelectionChangeRef.current = onSelectionChange;
    latestOnFirstCharRef.current = onFirstChar;

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
            const { lineStart, lineEnd } = getSelectedLineRange(state, from, to);

            const changes: any[] = [];
            let allHave = true;
            for (let i = lineStart; i <= lineEnd; i++) {
                if (!hasLinePrefix(state.doc.line(i).text, 'heading')) {
                    allHave = false;
                    break;
                }
            }

            for (let i = lineStart; i <= lineEnd; i++) {
                const line = state.doc.line(i);
                // [GUARD] 画像行は絶対に変更しない
                if (/!\[.*?\]\(.*?\)/.test(line.text)) continue;
                if (allHave) {
                    changes.push({ from: line.from, to: line.from + line.text.length, insert: stripLinePrefix(line.text) });
                } else {
                    if (!hasLinePrefix(line.text, 'heading')) {
                        changes.push({ from: line.from, to: line.from + line.text.length, insert: formatLineWithPrefix(line.text, 'heading') });
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
            const { lineStart, lineEnd } = getSelectedLineRange(state, from, to);

            const changes: any[] = [];
            let allHave = true;
            for (let i = lineStart; i <= lineEnd; i++) {
                if (!hasLinePrefix(state.doc.line(i).text, 'list')) {
                    allHave = false;
                    break;
                }
            }

            for (let i = lineStart; i <= lineEnd; i++) {
                const line = state.doc.line(i);
                // [GUARD] 画像行は絶対に変更しない
                if (/!\[.*?\]\(.*?\)/.test(line.text)) continue;
                if (allHave) {
                    changes.push({ from: line.from, to: line.from + line.text.length, insert: stripLinePrefix(line.text) });
                } else if (!hasLinePrefix(line.text, 'list')) {
                    changes.push({ from: line.from, to: line.from + line.text.length, insert: formatLineWithPrefix(line.text, 'list') });
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
            const { lineStart, lineEnd } = getSelectedLineRange(state, from, to);

            const changes: any[] = [];
            let allHave = true;
            for (let i = lineStart; i <= lineEnd; i++) {
                const line = state.doc.line(i);
                if (!canApplyLinePrefix(line.text)) continue;
                if (!hasLinePrefix(line.text, 'checkbox')) {
                    allHave = false;
                    break;
                }
            }

            for (let i = lineStart; i <= lineEnd; i++) {
                const line = state.doc.line(i);
                // [GUARD] 画像行は絶対に変更しない
                if (/!\[.*?\]\(.*?\)/.test(line.text)) continue;
                if (allHave) {
                    changes.push({ from: line.from, to: line.from + line.text.length, insert: stripLinePrefix(line.text) });
                } else if (!hasLinePrefix(line.text, 'checkbox')) {
                    changes.push({ from: line.from, to: line.from + line.text.length, insert: formatLineWithPrefix(line.text, 'checkbox') });
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
                    if (selectedText.startsWith('**') && selectedText.endsWith('**') && selectedText.length >= 4) {
                        // 選択テキスト自体が **...** → 解除
                        const unbolded = selectedText.slice(2, -2);
                        view.dispatch({
                            changes: { from, to, insert: unbolded },
                            selection: { anchor: from, head: from + unbolded.length }
                        });
                    } else {
                        // 選択範囲の外側に ** があるかチェック（内側だけ選択した場合）
                        const beforeFrom = from >= 2 ? state.doc.sliceString(from - 2, from) : '';
                        const afterTo = state.doc.sliceString(to, to + 2);
                        if (beforeFrom === '**' && afterTo === '**') {
                            // 外側の ** を削除（解除）
                            view.dispatch({
                                changes: [
                                    { from: to, to: to + 2, insert: '' },
                                    { from: from - 2, to: from, insert: '' }
                                ],
                                selection: { anchor: from - 2, head: to - 2 }
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
            }
            view.focus();
        },
        insertTable: () => {
            if (!viewRef.current) return;
            const view = viewRef.current;
            const { state } = view;
            const sel = state.selection.main;

            // 選択なし → 何もしない
            if (sel.from === sel.to) return;

            // 選択範囲を行頭・行末に拡張（行の途中から変換するとぐちゃぐちゃになるため）
            // sel.to が次の行頭ちょうどの場合は1つ戻して前の行末を使う
            const toPos = sel.to > sel.from && state.doc.lineAt(sel.to).from === sel.to ? sel.to - 1 : sel.to;
            const from = state.doc.lineAt(sel.from).from;
            const to = state.doc.lineAt(toPos).to;

            const selectedText = state.doc.sliceString(from, to);
            const lines = selectedText.split('\n');
            const nonEmptyLines = lines.filter(l => l.trim() !== '');
            if (nonEmptyLines.length === 0) return;

            // トグル判定: 先頭行が | で始まり | で終わる → テーブル → テキストへ逆変換
            const isTable = nonEmptyLines[0].trim().startsWith('|') && nonEmptyLines[0].trim().endsWith('|');

            let newText: string;
            if (isTable) {
                // テーブル → テキスト（区切り行 |---| を除外してセルをスペース2個で結合）
                newText = nonEmptyLines
                    .filter(l => !/^\|[-:\s|]+\|$/.test(l.trim()))
                    .map(l => l.trim().slice(1, -1).split('|').map((c: string) => c.trim()).join('  '))
                    .join('\n');
            } else {
                // テキスト → テーブル（スペース2個以上 or タブ で列を区切る）
                const rows = nonEmptyLines.map(l =>
                    l.split(/  +|\t/).map((c: string) => c.trim()).filter((_: string, i: number, a: string[]) => {
                        // 末尾の空列を除去しない（列数を正確に保つ）
                        return true;
                    })
                );
                // 末尾の空セルをトリム
                const trimmedRows = rows.map(r => {
                    let end = r.length;
                    while (end > 0 && r[end - 1] === '') end--;
                    return end > 0 ? r.slice(0, end) : r;
                });
                const maxCols = Math.max(...trimmedRows.map(r => r.length));
                // 列数を揃える
                const normalized = trimmedRows.map(r => [
                    ...r,
                    ...Array(Math.max(0, maxCols - r.length)).fill('')
                ]);
                const toRow = (cells: string[]) => `| ${cells.join(' | ')} |`;
                const sep = `|${Array(maxCols).fill('---').join('|')}|`;

                newText = [
                    toRow(normalized[0]),  // 1行目 = ヘッダー
                    sep,
                    ...normalized.slice(1).map(toRow)
                ].join('\n');
            }

            view.dispatch({
                changes: { from, to, insert: newText },
                selection: { anchor: from, head: from + newText.length }
            });
            view.focus();
        },
        insertMermaid: () => {
            if (!viewRef.current) return;
            const view = viewRef.current;
            const { state } = view;
            const sel = state.selection.main;

            // 選択なし → 何もしない
            if (sel.from === sel.to) return;

            // 選択範囲を行頭・行末に拡張（行の途中から変換するとぐちゃぐちゃになるため）
            // sel.to が次の行頭ちょうどの場合は1つ戻して前の行末を使う
            const toPos = sel.to > sel.from && state.doc.lineAt(sel.to).from === sel.to ? sel.to - 1 : sel.to;
            const from = state.doc.lineAt(sel.from).from;
            const to = state.doc.lineAt(toPos).to;

            const selectedText = state.doc.sliceString(from, to);
            const trimmed = selectedText.trim();

            // トグル判定: ```mermaid で始まる → 囲を外す
            if (trimmed.startsWith('```mermaid') && trimmed.endsWith('```')) {
                // 囲みを外す: 先頭行と末尾行を削除
                const innerLines = trimmed.split('\n').slice(1, -1);
                const newText = innerLines.join('\n');
                view.dispatch({
                    changes: { from, to, insert: newText },
                    selection: { anchor: from, head: from + newText.length }
                });
            } else {
                // テキスト → ```mermaid ``` で囲む
                const newText = `\`\`\`mermaid\n${trimmed}\n\`\`\``;
                view.dispatch({
                    changes: { from, to, insert: newText },
                    selection: { anchor: from, head: from + newText.length }
                });
            }
            view.focus();
        },
        focus: () => {
            if (!viewRef.current) return;
            viewRef.current.focus();
        },
        focusAndSelectFirstLine: () => {
            if (!viewRef.current) return;
            const doFocus = () => {
                const view = viewRef.current;
                if (!view) { return; }
                view.focus();
                view.dispatch({
                    selection: { anchor: 0, head: 0 },
                    scrollIntoView: true
                });
            };

            // [FIX] rAF x2 でレイアウト確定後に「1回だけ」実行する。
            // 以前は setTimeout 50ms / 150ms の繰り返し呼び出しがあり、
            // ユーザーが入力を開始した後（150〜250ms後）もカーソルを
            // 先頭にリセットし続けるバグを引き起こしていた。
            requestAnimationFrame(() => requestAnimationFrame(() => doFocus()));
        },
        setCursorToEnd: () => {
            if (!viewRef.current) return;
            const docLength = viewRef.current.state.doc.length;
            viewRef.current.dispatch({
                selection: { anchor: docLength, head: docLength }
            });
            viewRef.current.focus();
        },
        // クリック座標に対応する行の末尾にカーソルを移動する
        setCursorToLineEnd: (clientX: number, clientY: number) => {
            if (!viewRef.current) return;
            const view = viewRef.current;
            // CodeMirror の posAtCoords でクリック位置に対応するドキュメント位置を取得
            const pos = view.posAtCoords({ x: clientX, y: clientY }, false);
            if (pos !== null) {
                // その位置の行の末尾を取得
                const line = view.state.doc.lineAt(pos);
                view.dispatch({
                    selection: { anchor: line.to, head: line.to }
                });
            } else {
                // 範囲外（ドキュメント末尾に移動）
                const docLength = view.state.doc.length;
                view.dispatch({
                    selection: { anchor: docLength, head: docLength }
                });
            }
            view.focus();
        },
        // [NEW] クリック座標に最も近いテキスト位置に直接カーソルを移動する
        setCursorAtCoords: (clientX: number, clientY: number) => {
            if (!viewRef.current) return;
            const view = viewRef.current;
            const pos = view.posAtCoords({ x: clientX, y: clientY }, false);
            if (pos !== null) {
                view.dispatch({
                    selection: { anchor: pos, head: pos },
                    scrollIntoView: true
                });
            } else {
                const docLength = view.state.doc.length;
                view.dispatch({
                    selection: { anchor: docLength, head: docLength },
                    scrollIntoView: true
                });
            }
            view.focus();
        },
        // [NEW] クリック座標がテキスト領域（cm-content）より下（フッタ領域）かどうかを判定する
        isFooterArea: (clientY: number) => {
            if (!viewRef.current) return true;
            const contentDOM = viewRef.current.contentDOM;
            const rect = contentDOM.getBoundingClientRect();
            // contentDOMの底辺より下ならフッタ領域と判定
            return clientY > rect.bottom;
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

            view.dispatch({
                changes: { from, to, insert: text },
                // カーソルを挿入テキストの後ろへ
                selection: { anchor: from + text.length, head: from + text.length },
                scrollIntoView: true,
            });
            view.focus();
        },
        highlightQuery: (query: string) => {
            if (!viewRef.current) return;
            const view = viewRef.current;
            // CM6 の検索クエリを設定してハイライト
            const searchQuery = new SearchQuery({
                search: query,
                caseSensitive: false,
                literal: true,
            });
            view.dispatch({ effects: setSearchQuery.of(searchQuery) });
        },
        clearHighlight: () => {
            if (!viewRef.current) return;
            const view = viewRef.current;
            // 空のクエリで検索をクリア
            const emptyQuery = new SearchQuery({
                search: '',
            });
            view.dispatch({ effects: setSearchQuery.of(emptyQuery) });
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
                        // Ctrl+B: 太字トグル
                        {
                            key: 'ArrowDown',
                            shift: (view) => selectVisualLine(view, true),
                            preventDefault: true,
                        },
                        {
                            key: 'ArrowUp',
                            shift: (view) => selectVisualLine(view, false),
                            preventDefault: true,
                        },
                        {
                            key: 'ArrowRight',
                            run: (view) => moveFromImageLineEnd(view, 'right'),
                            preventDefault: true,
                        },
                        {
                            key: 'ArrowLeft',
                            run: (view) => moveFromImageLineEnd(view, 'left'),
                            preventDefault: true,
                        },
                        {
                            key: 'Mod-b',
                            run: (view) => {
                                const { state } = view;
                                const { from, to } = state.selection.main;
                                if (from === to) {
                                    view.dispatch({
                                        changes: { from, to, insert: '****' },
                                        selection: { anchor: from + 2, head: from + 2 }
                                    });
                                } else {
                                    const sel = state.doc.sliceString(from, to);
                                    const isBolded = sel.startsWith('**') && sel.endsWith('**') && sel.length > 4;
                                    const newText = isBolded ? sel.slice(2, -2) : `**${sel}**`;
                                    view.dispatch({
                                        changes: { from, to, insert: newText },
                                        selection: { anchor: from, head: from + newText.length }
                                    });
                                }
                                return true;
                            }
                        },
                        // Ctrl+H: 見出し1トグル
                        {
                            key: 'Mod-h',
                            run: (view) => {
                                const { state } = view;
                                const { from, to } = state.selection.main;
                                const { lineStart, lineEnd } = getSelectedLineRange(state, from, to);
                                const changes: { from: number; to?: number; insert?: string }[] = [];
                                let allHave = true;
                                for (let i = lineStart; i <= lineEnd; i++) {
                                    if (!state.doc.line(i).text.startsWith('# ')) { allHave = false; break; }
                                }
                                for (let i = lineStart; i <= lineEnd; i++) {
                                    const line = state.doc.line(i);
                                    // [GUARD] 画像行は絶対に変更しない
                                    if (/!\[.*?\]\(.*?\)/.test(line.text)) continue;
                                    if (allHave) {
                                        changes.push({ from: line.from, to: line.from + 2 });
                                    } else if (!line.text.startsWith('# ')) {
                                        changes.push({ from: line.from, insert: '# ' });
                                    }
                                }
                                view.dispatch({ changes });
                                return true;
                            }
                        },
                        // Ctrl+L: 箇条書きトグル
                        {
                            key: 'Mod-l',
                            run: (view) => {
                                const { state } = view;
                                const { from, to } = state.selection.main;
                                const lineStart = state.doc.lineAt(from).number;
                                const lineEnd = state.doc.lineAt(to).number;
                                const changes: { from: number; to?: number; insert?: string }[] = [];
                                let allHave = true;
                                for (let i = lineStart; i <= lineEnd; i++) {
                                    if (!state.doc.line(i).text.startsWith('- ')) { allHave = false; break; }
                                }
                                for (let i = lineStart; i <= lineEnd; i++) {
                                    const line = state.doc.line(i);
                                    // [GUARD] 画像行は絶対に変更しない
                                    if (/!\[.*?\]\(.*?\)/.test(line.text)) continue;
                                    if (allHave) {
                                        changes.push({ from: line.from, to: line.from + 2 });
                                    } else if (!line.text.startsWith('- ')) {
                                        changes.push({ from: line.from, insert: '- ' });
                                    }
                                }
                                view.dispatch({ changes });
                                return true;
                            }
                        },
                        // Ctrl+Shift+C: チェックボックストグル
                        {
                            key: 'Mod-Shift-c',
                            run: (view) => {
                                const { state } = view;
                                const { from, to } = state.selection.main;
                                const lineStart = state.doc.lineAt(from).number;
                                const lineEnd = state.doc.lineAt(to).number;
                                const changes: { from: number; to?: number; insert?: string }[] = [];
                                let allHave = true;
                                for (let i = lineStart; i <= lineEnd; i++) {
                                    const line = state.doc.line(i);
                                    if (!canApplyLinePrefix(line.text)) continue;
                                    if (!line.text.startsWith('- [ ] ')) { allHave = false; break; }
                                }
                                for (let i = lineStart; i <= lineEnd; i++) {
                                    const line = state.doc.line(i);
                                    // [GUARD] 画像行は絶対に変更しない
                                    if (/!\[.*?\]\(.*?\)/.test(line.text)) continue;
                                    if (allHave && canApplyLinePrefix(line.text)) {
                                        changes.push({ from: line.from, to: line.from + 6 });
                                    } else if (canApplyLinePrefix(line.text) && !line.text.startsWith('- [ ] ')) {
                                        changes.push({ from: line.from, insert: '- [ ] ' });
                                    }
                                }
                                view.dispatch({ changes });
                                return true;
                            }
                        },
                        {
                            // Tab: 選択なし→カーソル位置にスペース2個、選択あり→行インデント
                            key: 'Tab',
                            run: (view) => {
                                const { state } = view;
                                const { from, to } = state.selection.main;
                                if (from === to) {
                                    view.dispatch({ changes: { from, insert: '  ' }, selection: { anchor: from + 2 } });
                                    return true;
                                }
                                const lineStart = state.doc.lineAt(from).number;
                                const toLine = state.doc.lineAt(to);
                                const lineEnd = (to > from && toLine.from === to)
                                    ? toLine.number - 1
                                    : toLine.number;
                                const changes: { from: number; insert: string }[] = [];
                                for (let i = lineStart; i <= lineEnd; i++) {
                                    changes.push({ from: state.doc.line(i).from, insert: '  ' });
                                }
                                view.dispatch({ changes });
                                return true;
                            }
                        },
                        {
                            // Shift+Tab: 選択行の字下げを1段戻す
                            key: 'Shift-Tab',
                            run: (view) => {
                                const { state } = view;
                                const { from, to } = state.selection.main;
                                const lineStart = state.doc.lineAt(from).number;
                                const toLine = state.doc.lineAt(to);
                                const lineEnd = (to > from && toLine.from === to)
                                    ? toLine.number - 1
                                    : toLine.number;
                                const changes: { from: number; to: number }[] = [];
                                for (let i = lineStart; i <= lineEnd; i++) {
                                    const line = state.doc.line(i);
                                    if (line.text.startsWith('  ')) {
                                        changes.push({ from: line.from, to: line.from + 2 });
                                    } else if (line.text.startsWith(' ')) {
                                        changes.push({ from: line.from, to: line.from + 1 });
                                    }
                                }
                                if (changes.length > 0) view.dispatch({ changes });
                                return true;
                            }
                        },
                        // Mod-d: defaultKeymap の selectNextOccurrence を無効化（Ctrl+D は StickyNote の削除で使用）
                        {
                            key: 'Mod-d',
                            run: () => true,  // Handle event but don't select next occurrence
                        },
                        ...defaultKeymap,
                        ...historyKeymap
                    ]),
                    // Blurハンドラ
                    EditorView.domEventHandlers({
                        blur: (event, _view) => {
                            if (!isReadyRef.current) {
                                return;
                            }
                            if (latestOnBlurRef.current) {
                                latestOnBlurRef.current(event);
                            }
                        }
                    }),
                    // Markdown装飾
                    markdownDecorations,
                    // [NEW] Placeholder for new notes
                    // NOTE: 新規判定はState生成時にのみ注入する
                    placeholderFlagField,
                    placeholderDecorationField,
                    linkDecorationField, // [New]
                    linkEventHandler,    // [New]
                    imagePreviewPlugin,  // [NEW]
                    EditorView.lineWrapping,
                    highlightSelectionMatches(), // [NEW] 選択テキストのハイライト
                    search({ top: false }), // [NEW] 検索ハイライト用（パネル非表示）
                    filePathCompartment.current.of(filePathFacet.of(filePath)), // [NEW] Inject filePath (compartment for dynamic updates)
                    ...(isNewNote ? [
                        // 新規付箋の場合のみinit()でtrueを注入
                        placeholderFlagField.init(() => true),
                    ] : []),
                    // 変更検知・選択変化検知
                    EditorView.updateListener.of((update: ViewUpdate) => {
                        if (update.docChanged) {
                            latestOnChangeRef.current(update.state.doc.toString());
                            // [NEW] Pool 窓用: 0→1 文字遷移を検出して onFirstChar を 1 回だけ呼ぶ
                            // IME 未確定中の docChanged も発火対象（CONTEXT.md「IME 未確定中含む」）
                            if (update.startState.doc.length === 0 && update.state.doc.length > 0) {
                                latestOnFirstCharRef.current?.();
                            }
                        }
                        if ((update.selectionSet || update.docChanged) && latestOnSelectionChangeRef.current) {
                            const sel = update.state.selection.main;
                            if (Date.now() < suppressFormatBarUntilRef.current) {
                                latestOnSelectionChangeRef.current(null);
                                return;
                            }
                            if (!sel.empty) {
                                const coords = update.view.coordsAtPos(sel.from);
                                latestOnSelectionChangeRef.current(coords ? { top: coords.top, left: coords.left, bottom: coords.bottom } : null);
                            } else {
                                latestOnSelectionChangeRef.current(null);
                            }
                        }
                    }),
                    // イベントハンドラ
                    EditorView.domEventHandlers({
                        // フォーカスが外れた時の処理: 削除（上で定義済み）
                        keydown: (e) => {
                            if (e.shiftKey && ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                                suppressFormatBarUntilRef.current = Date.now() + 1200;
                                latestOnSelectionChangeRef.current?.(null);
                            }
                            if (e.key === 'Escape' && latestOnKeyDownRef.current) {
                                latestOnKeyDownRef.current(e as any);
                            }
                        },
                        // [FIX] Pasteハンドラの追加：カーソル位置への画像挿入
                        paste: (e, view) => {
                            const items = e.clipboardData?.items;
                            if (!items) return;

                            for (const item of items) {
                                if (item.type.startsWith('image/')) {
                                    e.preventDefault(); // デフォルト挙動（末尾追加など）を阻止

                                    const file = item.getAsFile();
                                    if (!file) {
                                        continue;
                                    }

                                    // カーソル位置の取得
                                    const currentPos = view.state.selection.main.from;

                                    // Invoke backend command to save image from clipboard.
                                    // Ctrl+N の高速付箋は最初の文字まで実ファイルが無いので、
                                    // 画像貼り付けでも先に保存先ファイルを確保する。
                                    (async () => {
                                        const targetFilePath =
                                            view.state.facet(filePathFacet) ||
                                            latestFilePathRef.current ||
                                            await latestOnEnsureFilePathRef.current?.();
                                        if (!targetFilePath) {
                                            throw new Error('No note path available for image paste');
                                        }
                                        const { invoke } = await import('@tauri-apps/api/core');
                                        return invoke<string>('fusen_get_image_from_clipboard', { path: targetFilePath });
                                    })()
                                            .then((savedPath) => {
                                                // Insert markdown: ![image](path)
                                                // Use "image" as alt text, can be changed later
                                                const markdown = `![image](${savedPath})`;

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
                                            })
                                            .catch((err) => {
                                                console.error('[EDITOR] Failed to paste image:', err);
                                                // Optional: Show error to user?
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
                                if (dropPos === null) {
                                    console.error('[DRAG] Failed to calculate drop position from coords');
                                    return;
                                }

                                // Widgetから送られてきた正確な「元位置」を取得
                                const posString = e.dataTransfer.getData('application/x-fusen-pos');
                                const draggedMarkdown = e.dataTransfer.getData('application/x-fusen-markdown');

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
                                    return;
                                }

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
                    // テーマ (動的更新用Compartment) - 初期は空。useEffect で設定される。
                    themeCompartment.current.of(EditorView.theme({}))
                ]
            }),
            parent: editorRef.current
        });

        viewRef.current = view;

        // [NEW] 初期選択処理（作成直後に一度だけ予約）
        if (isNewNote) {
            // [FIX] rAF x2 でレイアウト確定後に「1回だけ」フォーカス＆カーソル先頭配置する。
            // 以前は setTimeout 50ms / 150ms / 300ms の繰り返しがあり、
            // ユーザーが入力開始後（300ms以内）にもカーソルを先頭にリセットし続けるバグがあった。
            const doFocus = () => {
                const currentView = viewRef.current;
                if (!currentView) return;
                currentView.focus();
                if (currentView.state.doc.lines > 0) {
                    currentView.dispatch({
                        selection: { anchor: 0, head: 0 },
                        scrollIntoView: true
                    });
                }
            };
            requestAnimationFrame(() => requestAnimationFrame(doFocus));
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // 起動時に一度だけ作成

    // [New] Ready flag initialization
    useEffect(() => {
        // 起動直後はフォーカスが外れても無視し、少し待ってから有効化
        // これによりダブルクリック時の誤動作や起動時のフォーカス移動での誤検知を防ぐ
        isReadyRef.current = false; // 明示的にリセット
        const timer = setTimeout(() => {
            isReadyRef.current = true;
        }, 300); // 300ms待機（十分な余裕を持たせる）
        return () => clearTimeout(timer);
    }, []);


    // Keep the editor document current before applying a resumed cursor position.
    useEffect(() => {
        if (!viewRef.current) return;
        const currentValue = viewRef.current.state.doc.toString();
        if (currentValue !== value) {
            const selection = viewRef.current.state.selection.main;

            viewRef.current.dispatch({
                changes: {
                    from: 0,
                    to: currentValue.length,
                    insert: value
                },
                selection: {
                    anchor: Math.min(selection.anchor, value.length),
                    head: Math.min(selection.head, value.length)
                }
            });
        }
    }, [value]);


    // [New] cursorPosition change handler
    useEffect(() => {
        if (cursorPosition === undefined || cursorPosition === null) return;
        if (!viewRef.current) return;

        const view = viewRef.current;
        const docLength = view.state.doc.length;
        const safePos = Math.min(Math.max(0, cursorPosition), docLength);

        // Apply the resumed cursor before the next typed key can arrive.
        view.dispatch({ selection: { anchor: safePos, head: safePos }, scrollIntoView: true });
        view.focus();
        requestAnimationFrame(() => {
            if (viewRef.current === view) {
                view.focus();
            }
        });
    }, [cursorPosition]);

    // [New] initialCoords change handler
    useEffect(() => {
        if (!initialCoords) return;
        if (!viewRef.current) return;

        const view = viewRef.current;
        const pos = view.posAtCoords({ x: initialCoords.x, y: initialCoords.y }, false);
        if (pos !== null) {
            view.dispatch({ selection: { anchor: pos, head: pos }, scrollIntoView: true });
        } else {
            const docLength = view.state.doc.length;
            view.dispatch({ selection: { anchor: docLength, head: docLength }, scrollIntoView: true });
        }
        view.focus();
        requestAnimationFrame(() => {
            if (viewRef.current === view) {
                view.focus();
            }
        });
    }, [initialCoords]);

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
                    outline: 'none !important',
                    padding: '0 !important',
                },
                '.cm-editor': {
                    // height: 100% 等を削除し、テキスト量にフィットさせる
                },
                '.cm-scroller': {
                    overflow: 'visible',
                    paddingBottom: '0 !important',
                },
                '.cm-content': {
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '0 !important',
                    caretColor: '#333',
                    cursor: 'text',
                },
                '.cm-line': {
                    padding: '0 !important',
                    width: '100%',
                    boxSizing: 'border-box',
                },
                '.cm-content, .cm-content *': {
                    fontFamily: '"BIZ UDPGothic", "Meiryo", "Yu Gothic UI", sans-serif !important',
                    fontSize: `${fontSize}px`,
                    lineHeight: '1.4',
                    letterSpacing: '0.01em',
                },
                '.cm-md-h1': {
                    fontWeight: '700',
                    fontSize: '1.1em',
                },
                '.cm-md-bold': {
                    fontWeight: '700',
                    color: 'red',
                },
                '.cm-md-marker': {
                    color: '#ff8c00',
                    opacity: 0.6,
                },
                '.cm-placeholder-line': {
                    color: '#999',
                    opacity: 0.6,
                }
            })) // カンマを追加すべき箇所と閉じ括弧の整理
        });
    }, [fontSize, backgroundColor]);

    return (
        <div
            ref={editorRef}
            className="rich-text-editor-container"
            style={{
                // レイアウトは globals.css の .rich-text-editor-container で管理
                // ここでは動的な値のみ設定
                backgroundColor: backgroundColor,
                overflow: 'hidden',
            }}
        />
    );
});

RichTextEditor.displayName = 'RichTextEditor';

export default RichTextEditor;
