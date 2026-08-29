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
import { createLinkTargetRegex, isAbsoluteOrExternalPath, isLinkTarget } from '../utils/pathUtils';
import { renderSecureMermaid } from '../utils/mermaid';
import { buildImagePathCandidates } from '../utils/markdownUtils';
import { NOTE_COLORS } from '@/app/utils/noteAppearance';
import type { Language } from '@/lib/i18n';
import { parseOutline } from '../utils/outline';

/**
 * Mermaid図ブロックコンポーネント
 * mermaid.jsを動的インポートして初回のみロードする
 */
let mermaidIdCounter = 0;
function MermaidBlock({ code, language }: { code: string; language: Language }) {
    const [svg, setSvg] = useState<string>('');
    const [error, setError] = useState<string>('');
    const idRef = useRef(`mermaid-${++mermaidIdCounter}`);

    useEffect(() => {
        let cancelled = false;
        setError('');
        setSvg('');
        renderSecureMermaid(idRef.current, code).then((rendered) => {
            if (!cancelled) setSvg(rendered);
        }).catch((err: unknown) => {
            console.error('[Mermaid] Render failed:', err);
            if (!cancelled) setError(language === 'en'
                ? 'Could not display this diagram.'
                : String(err));
        });
        return () => { cancelled = true; };
    }, [code, language]);

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
    const regex = createLinkTargetRegex();
    const parts = text.split(regex);
    let currentOffset = 0;

    return (
        <>
            {parts.map((part, k) => {
                if (part === '') return null;

                const partStart = baseOffset + currentOffset;
                currentOffset += part.length;

                // regexの状態をリセットするため、新しくマッチ判定
                const isLink = isLinkTarget(part);
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
    recipeMode?: boolean;
    onCheckboxToggle: (lineIndex: number) => void;
    onImageResize: (newScale: number, baseOffset: number, originalText: string) => void;
    onDoubleClick: (e: React.MouseEvent) => void;
    onPointerDown?: (e: React.PointerEvent) => void;
    selectedFilePath?: string;
    basePath?: string | null;
    resolvePath: (baseFile: string, relativePath: string) => string;
    onAnnotationClick?: (absolutePath: string) => void;
    imageVersion?: number;
    language?: Language;
    collapsedOutlineLines?: number[];
    onCollapsedOutlineLinesChange?: (lines: number[]) => void;
};

export function getEmptyNotePlaceholder(backgroundColor: string, language: Language = 'ja'): string {
    if (language === 'en') {
        switch (backgroundColor.trim().toLowerCase()) {
            case NOTE_COLORS.yellow:
                return 'Note an idea, concern, or situation';
            case NOTE_COLORS.pink:
                return 'Note a task, issue, or experiment';
            case NOTE_COLORS.blue:
                return 'Note a result, decision, or next step';
            default:
                return '(Empty note)';
        }
    }
    switch (backgroundColor.trim().toLowerCase()) {
        case NOTE_COLORS.yellow:
            return 'アイデア、違和感、こんなときをメモ';
        case NOTE_COLORS.pink:
            return '課題、TODO、試したことをメモ';
        case NOTE_COLORS.blue:
            return '結果、決定事項、次回の作戦をメモ';
        default:
            return '（空のメモ）';
    }
}

export default function MarkdownRenderer({
    content,
    backgroundColor,
    fontSize,
    isDraggableArea = false,
    singleLinePreview = false,
    recipeMode = false,
    onCheckboxToggle,
    onImageResize,
    onDoubleClick,
    onPointerDown,
    selectedFilePath = '',
    basePath = null,
    resolvePath,
    onAnnotationClick,
    imageVersion = 0,
    language = 'ja',
    collapsedOutlineLines = [],
    onCollapsedOutlineLinesChange,
}: MarkdownRendererProps) {
    const outlineLines = useMemo(
        () => parseOutline(content || '', collapsedOutlineLines),
        [content, collapsedOutlineLines],
    );
    const collapsedOutlineSet = useMemo(() => new Set(collapsedOutlineLines), [collapsedOutlineLines]);
    const toggleOutline = (lineIndex: number) => {
        const next = collapsedOutlineSet.has(lineIndex)
            ? collapsedOutlineLines.filter(index => index !== lineIndex)
            : [...collapsedOutlineLines, lineIndex].sort((a, b) => a - b);
        onCollapsedOutlineLinesChange?.(next);
    };
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
            let fallbackSrcs: string[] = [];
            if (selectedFilePath && !isAbsoluteOrExternalPath(urlRaw)) {
                const candidates = buildImagePathCandidates(selectedFilePath, urlRaw, basePath);
                url = candidates[0] ?? resolvePath(selectedFilePath, urlRaw);
                fallbackSrcs = candidates.slice(1);
            }

            // スケール解析: ![alt|1.5](url)
            const altParts = altTextRaw.split('|');
            const alt = altParts[0];
            let scale: number | undefined = undefined;
            if (altParts.length > 1) {
                const s = parseFloat(altParts[1]);
                // [GUARD] 極端な値（0.1未満 or 5.0超）は表示時にもクランプ
                if (!isNaN(s) && isFinite(s)) scale = Math.min(5.0, Math.max(0.1, s));
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
                        markdownFallback={fullMatch}
                        fallbackSrcs={fallbackSrcs}
                        cacheKey={imageVersion}
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
                                return <MermaidBlock key={gi} code={codeText} language={language} />;
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
                        const outlineLine = outlineLines[i];
                        if (outlineLine?.hidden) return null;
                        const displayLine = outlineLine?.eligible ? outlineLine.content : line;
                        const indentChars = outlineLine?.eligible ? line.length - displayLine.length : 0;
                        const lineClass = `m-0 p-0 leading-[1.4] min-h-[1.4em] items-start ${singleLinePreview ? 'block overflow-hidden text-ellipsis' : 'flex overflow-visible text-clip'}`;
                        const baseOffset = (lineOffsets[i] || 0) + indentChars;
                        const outlineStyle = outlineLine?.eligible && outlineLine.depth > 0
                            ? { paddingLeft: `${outlineLine.depth * 20}px` }
                            : undefined;
                        const outlineToggle = outlineLine?.eligible && outlineLine.hasChildren ? (
                            <button
                                type="button"
                                data-interactable="true"
                                aria-label={collapsedOutlineSet.has(i) ? '開く' : '閉じる'}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    toggleOutline(i);
                                }}
                                className="outline-toggle shrink-0 w-[16px] h-[1.4em] -ml-[16px] p-0 border-0 bg-transparent text-[9px] text-[#655f4d] opacity-[0.08] hover:opacity-80 focus:opacity-80 transition-opacity cursor-pointer"
                            >
                                {collapsedOutlineSet.has(i) ? '▶' : '▼'}
                            </button>
                        ) : null;

                        // 空行
                        if (displayLine.trim() === '') {
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
                        if (displayLine.startsWith('# ')) {
                            return (
                                <div
                                    key={i}
                                    data-line-index={i}
                                    className={`${lineClass} font-bold text-[1.1em]`}
                                    style={{ ...outlineStyle, ...(recipeMode ? { color: '#d9480f' } : {}) }}
                                >
                                    {outlineToggle}
                                    <span data-src-start={baseOffset + 2} className={singleLinePreview ? 'block overflow-hidden text-ellipsis' : 'inline overflow-visible text-clip'}>
                                        {renderLineContent(displayLine.substring(2), baseOffset + 2)}
                                    </span>
                                </div>
                            );
                        }

                        // レシピ小見出し (## で始まる)
                        if (recipeMode && displayLine.startsWith('## ')) {
                            return (
                                <div
                                    key={i}
                                    data-line-index={i}
                                    className={`${lineClass} font-bold text-[1.0em]`}
                                    style={{ ...outlineStyle, color: '#d9480f' }}
                                >
                                    {outlineToggle}
                                    <span data-src-start={baseOffset + 3} className={singleLinePreview ? 'block overflow-hidden text-ellipsis' : 'inline overflow-visible text-clip'}>
                                        {renderLineContent(displayLine.substring(3), baseOffset + 3)}
                                    </span>
                                </div>
                            );
                        }

                        // チェックボックス (タスクリスト)
                        const taskMatch = displayLine.match(/^([\-\*\+]\s+\[)([ xX])(\]\s+.*)$/);
                        if (taskMatch) {
                            const isChecked = taskMatch[2].toLowerCase() === 'x';
                            const text = taskMatch[3].substring(2);
                            const textStart = baseOffset + (displayLine.length - text.length);

                            return (
                                <div key={i} data-line-index={i} className={lineClass} style={outlineStyle}>
                                    {outlineToggle}
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

                        // レシピ番号付きリスト
                        const orderedListMatch = recipeMode ? displayLine.match(/^(\d+\.\s+)(.*)$/) : null;
                        if (orderedListMatch) {
                            const marker = orderedListMatch[1];
                            const text = orderedListMatch[2];
                            const textStart = baseOffset + marker.length;
                            return (
                                <div key={i} data-line-index={i} className={lineClass} style={outlineStyle}>
                                    {outlineToggle}
                                    <span
                                        className="mr-[8px] shrink-0 inline-block text-right"
                                        style={{ color: '#1971c2' }}
                                        data-src-start={baseOffset}
                                    >
                                        {marker}
                                    </span>
                                    <span data-src-start={textStart}>
                                        {renderLineContent(text, textStart)}
                                    </span>
                                </div>
                            );
                        }

                        // 箇条書き (リスト)
                        const listMatch = displayLine.match(/^[\-\*\+]\s+(.*)$/);
                        if (listMatch) {
                            const text = listMatch[1];
                            const textStart = baseOffset + (displayLine.length - text.length);
                            return (
                                <div key={i} data-line-index={i} className={lineClass} style={outlineStyle}>
                                    {outlineToggle}
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
                            <div key={i} data-line-index={i} className={`${lineClass} group`} style={outlineStyle}>
                                {outlineToggle}
                                <span data-src-start={baseOffset} className={singleLinePreview ? 'block overflow-hidden text-ellipsis' : 'inline overflow-visible text-clip'}>
                                    {renderLineContent(displayLine, baseOffset)}
                                </span>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="text-[#999] p-2">
                    {getEmptyNotePlaceholder(backgroundColor, language)}
                </div>
            )}
        </article>
    );
}
