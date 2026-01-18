'use client';

import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate, keymap, lineNumbers } from '@codemirror/view';
import { EditorState, StateField } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';

interface RichTextEditorProps {
    value: string;
    onChange: (value: string) => void;

    onKeyDown?: (e: React.KeyboardEvent) => void;
    backgroundColor: string;
    cursorPosition?: number | null; // 初期カーソル位置（文字オフセット）
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

const RichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>(({
    value,
    onChange,

    onKeyDown,
    backgroundColor,
    cursorPosition
}, ref) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);

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
                scrollIntoView: true,
            });
            view.focus();
        }
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
                    // 変更検知
                    EditorView.updateListener.of((update: ViewUpdate) => {
                        if (update.docChanged) {
                            onChange(update.state.doc.toString());
                        }
                    }),
                    // イベントハンドラ
                    EditorView.domEventHandlers({
                        blur: (e, view) => {
                            // Fix: Blur does not trigger edit end.
                            // Boundaries are managed by StickyNote (click-outside, etc.)
                            console.log('[RichTextEditor] Blur ignored (managed by parent)');
                        },
                        keydown: (e) => {
                            if (e.key === 'Escape' && onKeyDown) {
                                onKeyDown(e as any);
                            }
                        }
                    }),
                    // テーマ
                    EditorView.theme({
                        '&': {
                            fontFamily: '"BIZ UDPGothic", "Meiryo", "Yu Gothic UI", sans-serif',
                            fontSize: '10.5px',
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
                            fontSize: '10.5px',
                        },
                        '.cm-md-bold': {
                            fontWeight: '700',
                            color: 'red',
                        },
                        // エディタ内の全ての文字にフォントを強制適用 (英語monospace化防止)
                        '.cm-content, .cm-content *': {
                            fontFamily: '"BIZ UDPGothic", "Meiryo", "Yu Gothic UI", sans-serif !important',
                            fontSize: '10.5px',
                            lineHeight: '1.4',
                            letterSpacing: '0.01em',
                        }
                    })
                ]
            }),
            parent: editorRef.current
        });

        viewRef.current = view;

        // 初期カーソル位置が指定されている場合は適用＆フォーカス
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
    }, []); // backgroundColorが変わっても再作成しない (Fix B)

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
