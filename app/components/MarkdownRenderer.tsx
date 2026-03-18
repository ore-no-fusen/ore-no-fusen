/**
 * Markdown表示コンポーネント
 *
 * 責務:
 * - Markdownのレンダリング
 * - 見出し、リスト、チェックボックス、画像の表示
 * - リンクとインラインスタイル（太字）の処理
 */

'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-shell';
import ResizableImage from './ResizableImage';

/**
 * Mermaid図ブロックコンポーネント
 * mermaid.jsを動的インポートして初回のみロードする
 */
let mermaidIdCounter = 0;
function MermaidBlock({ code }: { code: string }) {
    const [svg, setSvg] = useState<string>('');
    const [error, setError] = useState<string>('');
    const idRef = useRef(`mermaid-${++mermaidIdCounter}`);

    useEffect(() => {
        let cancelled = false;
        setError('');
        setSvg('');
        import('mermaid').then(({ default: mermaid }) => {
            mermaid.initialize({
                startOnLoad: false,
                theme: 'neutral',
                securityLevel: 'loose',
            });
            mermaid.render(idRef.current, code)
                .then(({ svg: rendered }) => {
                    if (!cancelled) setSvg(rendered);
                })
                .catch((err: unknown) => {
                    if (!cancelled) setError(String(err));
                });
        }).catch((err: unknown) => {
            if (!cancelled) setError(`mermaidロード失敗: ${String(err)}`);
        });
        return () => { cancelled = true; };
    }, [code]);

    if (error) {
        return (
            <div style={{
                border: '1px solid #f5a623',
                borderRadius: '4px',
                padding: '6px 8px',
                color: '#c0392b',
                fontSize: '0.85em',
                fontFamily: 'monospace',
                background: '#fff8f0',
                margin: '4px 0',
            }}>
                ⚠️ Mermaid構文エラー: {error}
            </div>
        );
    }
    if (!svg) {
        return <div style={{ color: '#999', fontSize: '0.85em', margin: '4px 0' }}>レンダリング中...</div>;
    }
    return (
        <div
            style={{ overflowX: 'auto', margin: '4px 0', maxWidth: '100%' }}
            dangerouslySetInnerHTML={{ __html: svg }}
        />
    );
}

/**
 * インラインスタイル（太字）をパースする
 */
const parseInlineStyles = (text: string, baseOffset: number) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    let currentOffset = 0;

    return (
        <>
            {parts.map((part, k) => {
                if (part === '') return null;

                const partStart = baseOffset + currentOffset;
                currentOffset += part.length;

                if (part.startsWith('**') && part.endsWith('**')) {
                    const innerText = part.slice(2, -2);
                    return (
                        <strong
                            key={k}
                            style={{ color: 'red', fontWeight: 'bold' }}
                            data-src-start={partStart + 2}
                        >
                            {innerText}
                        </strong>
                    );
                }
                return (
                    <span key={k} data-src-start={partStart}>
                        {part}
                    </span>
                );
            })}
        </>
    );
};

/**
 * リンクをパースする
 */
const parseLinks = (text: string, baseOffset: number) => {
    const regex = /((?:https?:\/\/[^\s]+)|(?:[a-zA-Z]:\\[^:<>"\/?*|\r\n]+)|(?:\\\\[^:<>"\/?*|\r\n]+))/g;
    const parts = text.split(regex);
    let currentOffset = 0;

    return (
        <>
            {parts.map((part, k) => {
                if (part === '') return null;

                const partStart = baseOffset + currentOffset;
                currentOffset += part.length;

                // regexの状態をリセットするため、新しくマッチ判定
                const isLink = /^(?:https?:\/\/[^\s]+)|^(?:[a-zA-Z]:\\[^:<>"\/?*|\r\n]+)|^(?:\\\\[^:<>"\/?*|\r\n]+)$/.test(part);
                if (isLink) {
                    return (
                        <span
                            key={k}
                            style={{
                                color: 'blue',
                                textDecoration: 'underline',
                                cursor: 'pointer'
                            }}
                            data-src-start={partStart}
                            data-tauri-drag-region="false"
                            onClick={async (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                console.log('[OpenLink]', part);
                                try {
                                    if (/^https?:\/\//i.test(part)) {
                                        await open(part);
                                    } else {
                                        await invoke('fusen_open_file', { path: part });
                                    }
                                } catch (err) {
                                    console.error('Failed to open link:', err);
                                }
                            }}
                        >
                            {part}
                        </span>
                    );
                }

                return <React.Fragment key={k}>{parseInlineStyles(part, partStart)}</React.Fragment>;
            })}
        </>
    );
};

export type MarkdownRendererProps = {
    content: string;
    backgroundColor: string;
    fontSize: number;
    isDraggableArea?: boolean;
    singleLinePreview?: boolean; // [New] ミニマイズ時用。1行のみ表示し省略するモード
    onCheckboxToggle: (lineIndex: number) => void;
    onImageResize: (newScale: number, baseOffset: number, originalText: string) => void;
    onDoubleClick: (e: React.MouseEvent) => void;
    onPointerDown?: (e: React.PointerEvent) => void;
    selectedFilePath?: string;
    resolvePath: (baseFile: string, relativePath: string) => string;
    onAnnotationClick?: (absolutePath: string) => void;
    imageVersion?: number;
};

export default function MarkdownRenderer({
    content,
    backgroundColor,
    fontSize,
    isDraggableArea = false,
    singleLinePreview = false,
    onCheckboxToggle,
    onImageResize,
    onDoubleClick,
    onPointerDown,
    selectedFilePath = '',
    resolvePath,
    onAnnotationClick,
    imageVersion = 0,
}: MarkdownRendererProps) {
    // 行オフセット計算（カーソル位置精度向上）
    const lineOffsets = useMemo(() => {
        let offset = 0;
        return (content || '').split('\n').map(line => {
            const current = offset;
            offset += line.length + 1; // +1 for newline
            return current;
        });
    }, [content]);

    /**
     * コードフェンス + テーブル行のグループ化
     * - 連続する | で始まる行 → table ブロック
     * - ``` で囲まれた複数行 → code ブロック
     */
    type LineGroup =
        | { type: 'table'; rows: string[]; startIndex: number }
        | { type: 'code'; lang: string; lines: string[]; startIndex: number }
        | { type: 'line'; line: string; index: number };

    const groupedLines = useMemo((): LineGroup[] => {
        const lines = (content || '').split('\n');
        const groups: LineGroup[] = [];
        let i = 0;
        while (i < lines.length) {
            const trimmed = lines[i].trim();

            // コードフェンス検出（``` で始まる行）
            if (trimmed.startsWith('```')) {
                const lang = trimmed.slice(3).trim().toLowerCase();
                const startIdx = i;
                i++; // 開始行を越える
                const codeLines: string[] = [];
                while (i < lines.length && !lines[i].trim().startsWith('```')) {
                    codeLines.push(lines[i]);
                    i++;
                }
                if (i < lines.length) i++; // 閉じる ``` を越える
                groups.push({ type: 'code', lang, lines: codeLines, startIndex: startIdx });
                continue;
            }

            // テーブル行検出
            if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 2) {
                const tableRows: string[] = [];
                const startIdx = i;
                while (i < lines.length) {
                    const t = lines[i].trim();
                    if (t.startsWith('|') && t.endsWith('|') && t.length > 2) {
                        tableRows.push(lines[i]);
                        i++;
                    } else {
                        break;
                    }
                }
                groups.push({ type: 'table', rows: tableRows, startIndex: startIdx });
            } else {
                groups.push({ type: 'line', line: lines[i], index: i });
                i++;
            }
        }
        return groups;
    }, [content]);


    /**
     * 行の内容をレンダリング（画像 > リンク > テキスト）
     */
    const renderLineContent = (text: string, baseOffset: number) => {
        const imgRegex = /(!\[([^\]]*)\]\(([^)]+)\))/g;
        const parts: React.ReactNode[] = [];
        let lastIndex = 0;
        let match;

        while ((match = imgRegex.exec(text)) !== null) {
            const fullMatch = match[0];
            const altTextRaw = match[2];
            const urlRaw = match[3];
            const index = match.index;

            // テキスト部分を先に追加
            if (index > lastIndex) {
                parts.push(
                    <React.Fragment key={`text-${baseOffset + lastIndex}`}>
                        {parseLinks(text.substring(lastIndex, index), baseOffset + lastIndex)}
                    </React.Fragment>
                );
            }

            // 画像URLを解決（相対パス対応）
            let url = urlRaw;
            if (selectedFilePath && !/^[a-zA-Z]:\\|^\\\\|^http/.test(urlRaw)) {
                url = resolvePath(selectedFilePath, urlRaw);
            }

            // スケール解析: ![alt|1.5](url)
            const altParts = altTextRaw.split('|');
            const alt = altParts[0];
            let scale: number | undefined = undefined;
            if (altParts.length > 1) {
                const s = parseFloat(altParts[1]);
                if (!isNaN(s)) scale = s;
            }

            // singleLinePreview 時は ResizableImage を描画しない
            // （折りたたみウィンドウで画像が高さ計算を狂わせウィンドウが消える問題を防ぐ）
            if (singleLinePreview) {
                parts.push(
                    <span
                        key={baseOffset + index}
                        style={{ color: '#999', fontSize: '0.8em', fontStyle: 'italic' }}
                    >
                        [画像]
                    </span>
                );
            } else {
                parts.push(
                    <ResizableImage
                        key={`${baseOffset + index}-${imageVersion}`}
                        src={url}
                        alt={alt}
                        scale={scale}
                        baseOffset={baseOffset + index}
                        onResizeEnd={(s) => onImageResize(s, baseOffset + index, fullMatch)}
                        contentReadOnly={false}
                        onAnnotationClick={onAnnotationClick}
                    />
                );
            }

            lastIndex = index + fullMatch.length;
        }

        // 残りのテキスト
        if (lastIndex < text.length) {
            parts.push(
                <React.Fragment key={`text-${baseOffset + lastIndex}`}>
                    {parseLinks(text.substring(lastIndex), baseOffset + lastIndex)}
                </React.Fragment>
            );
        }

        return parts;
    };

    return (
        <article
            className={`notePaper max-w-none whitespace-pre-wrap select-none p-0 flex-1 flex flex-col font-["BIZ_UDPGothic",_"Meiryo",_"Yu_Gothic_UI",_sans-serif] leading-[1.4] tracking-[0.01em] ${isDraggableArea ? 'cursor-grab' : 'cursor-text'}`}
            style={{
                backgroundColor,
                fontSize: `${fontSize}px`,
            }}
            onPointerDown={onPointerDown}
            onDoubleClick={(e) => {
                e.stopPropagation();
                onDoubleClick(e);
            }}
        >
            {content ? (
                <div className={`flex-1 ${singleLinePreview ? 'whitespace-nowrap overflow-hidden' : 'whitespace-pre-wrap overflow-visible'}`}>
                    {groupedLines.map((group, gi) => {
                        // テーブルブロック
                        if (group.type === 'table') {
                            const rows = group.rows;
                            // 区切り行（|---|---|）のインデックスを検出
                            const sepIdx = rows.findIndex(r =>
                                /^\|[-:\s|]+\|$/.test(r.trim())
                            );
                            const hasHeader = sepIdx === 1;
                            const headerRow = hasHeader ? rows[0] : null;
                            const dataRows = hasHeader ? rows.slice(2) : rows;

                            const parseRow = (row: string) =>
                                row.trim().slice(1, -1).split('|').map(c => c.trim());

                            return (
                                <div key={gi} style={{ overflowX: 'auto', margin: '4px 0' }}>
                                    <table style={{
                                        borderCollapse: 'collapse',
                                        fontSize: 'inherit',
                                        width: 'max-content',
                                        maxWidth: '100%',
                                    }}>
                                        {headerRow && (
                                            <thead>
                                                <tr>
                                                    {parseRow(headerRow).map((cell, ci) => (
                                                        <th key={ci} style={{
                                                            border: '1px solid #999',
                                                            padding: '3px 8px',
                                                            background: 'rgba(0,0,0,0.07)',
                                                            fontWeight: 'bold',
                                                            whiteSpace: 'nowrap',
                                                        }}>{cell}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                        )}
                                        <tbody>
                                            {dataRows.map((row, ri) => (
                                                <tr key={ri}>
                                                    {parseRow(row).map((cell, ci) => (
                                                        <td key={ci} style={{
                                                            border: '1px solid #bbb',
                                                            padding: '3px 8px',
                                                            whiteSpace: 'nowrap',
                                                        }}>{cell}</td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            );
                        }

                        // コードブロック（``` で囲まれたブロック）
                        if (group.type === 'code') {
                            const codeText = group.lines.join('\n');
                            if (group.lang === 'mermaid') {
                                return <MermaidBlock key={gi} code={codeText} />;
                            }
                            // 通常コードブロック → 等幅フォントで表示
                            return (
                                <pre key={gi} style={{
                                    fontFamily: 'monospace',
                                    background: 'rgba(0,0,0,0.06)',
                                    padding: '6px 8px',
                                    borderRadius: '4px',
                                    margin: '4px 0',
                                    overflowX: 'auto',
                                    whiteSpace: 'pre',
                                    fontSize: '0.9em',
                                }}>
                                    <code>{codeText}</code>
                                </pre>
                            );
                        }

                        // 通常行処理
                        const { line, index: i } = group;
                        const lineClass = `m-0 p-0 leading-[1.4] min-h-[1.4em] items-start ${singleLinePreview ? 'block overflow-hidden text-ellipsis' : 'flex overflow-visible text-clip'}`;
                        const baseOffset = lineOffsets[i] || 0;

                        // 空行
                        if (line.trim() === '') {
                            return (
                                <div
                                    key={i}
                                    data-line-index={i}
                                    className={lineClass}
                                    data-src-start={baseOffset}
                                >
                                    &nbsp;
                                </div>
                            );
                        }

                        // 見出し (# で始まる)
                        if (line.startsWith('# ')) {
                            return (
                                <div
                                    key={i}
                                    data-line-index={i}
                                    className={`${lineClass} font-bold text-[1.1em]`}
                                >
                                    <span data-src-start={baseOffset + 2} className={singleLinePreview ? 'block overflow-hidden text-ellipsis' : 'inline overflow-visible text-clip'}>
                                        {renderLineContent(line.substring(2), baseOffset + 2)}
                                    </span>
                                </div>
                            );
                        }

                        // チェックボックス (タスクリスト)
                        const taskMatch = line.match(/^([\-\*\+]\s+\[)([ xX])(\]\s+.*)$/);
                        if (taskMatch) {
                            const isChecked = taskMatch[2].toLowerCase() === 'x';
                            const text = taskMatch[3].substring(2);
                            const textStart = baseOffset + (line.length - text.length);

                            return (
                                <div key={i} data-line-index={i} className={lineClass}>
                                    <span
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onCheckboxToggle(i);
                                        }}
                                        data-interactable="true"
                                        className={`mr-[6px] shrink-0 inline-block w-[1em] text-center cursor-pointer select-none ${isChecked ? 'text-[#4caf50]' : 'text-[#888]'}`}
                                        title={isChecked ? '未完了にする' : '完了にする'}
                                        data-src-start={baseOffset}
                                    >
                                        {isChecked ? '☑' : '☐'}
                                    </span>
                                    <span
                                        className={isChecked ? 'line-through opacity-60' : 'no-underline opacity-100'}
                                        data-src-start={textStart}
                                    >
                                        {renderLineContent(text, textStart)}
                                    </span>
                                </div>
                            );
                        }

                        // 箇条書き (リスト)
                        const listMatch = line.match(/^[\-\*\+]\s+(.*)$/);
                        if (listMatch) {
                            const text = listMatch[1];
                            const textStart = baseOffset + (line.length - text.length);
                            return (
                                <div key={i} data-line-index={i} className={lineClass}>
                                    <span
                                        className="mr-[8px] shrink-0 inline-block w-[1em] text-center"
                                        data-src-start={baseOffset}
                                    >
                                        •
                                    </span>
                                    <span data-src-start={textStart}>
                                        {renderLineContent(text, textStart)}
                                    </span>
                                </div>
                            );
                        }

                        // 通常のテキスト
                        return (
                            <div key={i} data-line-index={i} className={lineClass}>
                                <span data-src-start={baseOffset} className={singleLinePreview ? 'block overflow-hidden text-ellipsis' : 'inline overflow-visible text-clip'}>
                                    {renderLineContent(line, baseOffset)}
                                </span>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="text-[#999] p-2">
                    （空のメモ）
                </div>
            )}
        </article>
    );
}
