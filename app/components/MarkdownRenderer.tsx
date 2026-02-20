/**
 * Markdown表示コンポーネント
 *
 * 責務:
 * - Markdownのレンダリング
 * - 見出し、リスト、チェックボックス、画像の表示
 * - リンクとインラインスタイル（太字）の処理
 */

'use client';

import React, { useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-shell';
import ResizableImage from './ResizableImage';

/**
 * インラインスタイル（太字）をパースする
 */
export const parseInlineStyles = (text: string, baseOffset: number) => {
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
export const parseLinks = (text: string, baseOffset: number) => {
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
    onCheckboxToggle: (lineIndex: number) => void;
    onImageResize: (newScale: number, baseOffset: number, originalText: string) => void;
    onDoubleClick: (e: React.MouseEvent) => void;
    onPointerDown?: (e: React.PointerEvent) => void;
    selectedFilePath?: string;
    resolvePath: (baseFile: string, relativePath: string) => string;
};

export default function MarkdownRenderer({
    content,
    backgroundColor,
    fontSize,
    isDraggableArea = false,
    onCheckboxToggle,
    onImageResize,
    onDoubleClick,
    onPointerDown,
    selectedFilePath = '',
    resolvePath
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

            parts.push(
                <ResizableImage
                    key={baseOffset + index}
                    src={url}
                    alt={alt}
                    scale={scale}
                    baseOffset={baseOffset + index}
                    onResizeEnd={(s) => onImageResize(s, baseOffset + index, fullMatch)}
                    contentReadOnly={false}
                />
            );

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
            className="notePaper max-w-none"
            style={{
                backgroundColor,
                whiteSpace: 'pre-wrap',
                cursor: isDraggableArea ? 'grab' : 'text',
                userSelect: 'none',
                padding: 0,
                fontSize: `${fontSize}px`,
                fontFamily: '"BIZ UDPGothic", "Meiryo", "Yu Gothic UI", sans-serif',
                lineHeight: '1.4',
                letterSpacing: '0.01em',
                flex: 1, // 親要素(main)いっぱいに広げる
                display: 'flex',
                flexDirection: 'column'
            }}
            onPointerDown={onPointerDown}
            onDoubleClick={(e) => {
                e.stopPropagation();
                onDoubleClick(e);
            }}
        >
            {content ? (
                <div style={{ whiteSpace: 'pre-wrap', flex: 1 }}>
                    {content.split('\n').map((line, i) => {
                        const lineStyle: React.CSSProperties = {
                            margin: 0,
                            padding: 0,
                            lineHeight: '1.4',
                            minHeight: '1.4em',
                            display: 'flex',
                            alignItems: 'flex-start'
                        };

                        const baseOffset = lineOffsets[i] || 0;

                        // 空行
                        if (line.trim() === '') {
                            return (
                                <div
                                    key={i}
                                    data-line-index={i}
                                    style={lineStyle}
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
                                    style={{ ...lineStyle, fontWeight: 700, fontSize: '1.1em' }}
                                >
                                    <span data-src-start={baseOffset + 2}>
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
                                <div key={i} data-line-index={i} style={lineStyle}>
                                    <span
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onCheckboxToggle(i);
                                        }}
                                        data-interactable="true"
                                        style={{
                                            marginRight: '6px',
                                            color: isChecked ? '#4caf50' : '#888',
                                            flexShrink: 0,
                                            display: 'inline-block',
                                            width: '1em',
                                            textAlign: 'center',
                                            cursor: 'pointer',
                                            userSelect: 'none'
                                        }}
                                        title={isChecked ? '未完了にする' : '完了にする'}
                                        data-src-start={baseOffset}
                                    >
                                        {isChecked ? '☑' : '☐'}
                                    </span>
                                    <span
                                        style={{
                                            textDecoration: isChecked ? 'line-through' : 'none',
                                            opacity: isChecked ? 0.6 : 1
                                        }}
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
                                <div key={i} data-line-index={i} style={lineStyle}>
                                    <span
                                        style={{
                                            marginRight: '8px',
                                            flexShrink: 0,
                                            display: 'inline-block',
                                            width: '1em',
                                            textAlign: 'center'
                                        }}
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
                            <div key={i} data-line-index={i} style={lineStyle}>
                                <span data-src-start={baseOffset}>
                                    {renderLineContent(line, baseOffset)}
                                </span>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div style={{ color: '#999', padding: '8px' }}>
                    （空のメモ）
                </div>
            )}
        </article>
    );
}
