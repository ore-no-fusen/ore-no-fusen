/**
 * リサイズ可能な画像コンポーネント (ResizableImage)
 *
 * 責務:
 * - 付箋内での画像の表示とリサイズ機能の提供
 * - ローカル画像パスの自動変換と読み込み
 * - ドラッグ操作によるサイズ変更UI
 */

'use client';

import React, { useState, useRef, useEffect } from 'react';

export interface ResizableImageProps {
    src: string;
    alt: string;
    scale?: number; // Scale factor (e.g. 1.0 = 100%, 0.5 = 50%)
    onResizeEnd: (newScale: number) => void;
    onDragStart?: (e: React.DragEvent) => void;
    baseOffset: number;
    contentReadOnly?: boolean;
    onAnnotationClick?: (absolutePath: string) => void;
}

export default function ResizableImage({ src, alt, scale = 1.0, onResizeEnd, onDragStart, baseOffset, contentReadOnly = false, onAnnotationClick }: ResizableImageProps) {
    const [currentWidth, setCurrentWidth] = useState<number | undefined>(undefined);
    const [isResizing, setIsResizing] = useState(false);
    const imgRef = useRef<HTMLImageElement>(null);
    const startXRef = useRef<number>(0);
    const startWidthRef = useRef<number>(0);

    // Store natural dimensions
    const naturalWidthRef = useRef<number>(0);

    // Sync prop changes (if scale changes externally, update width if we know natural width)
    useEffect(() => {
        if (naturalWidthRef.current > 0) {
            setCurrentWidth(naturalWidthRef.current * scale);
        }
    }, [scale]);

    // Handle Image Source (Async Convert if needed)
    const [displaySrc, setDisplaySrc] = useState(() => {
        // [FIX] Avoid setting 'file://' or absolute paths initially to prevent browser blocking
        const isLocalPath = /^[a-zA-Z]:[\\\/]|^\\\\/.test(src);
        return isLocalPath ? 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' : src;
    });

    useEffect(() => {
        let active = true;

        const loadSrc = async () => {
            const isLocalPath = /^[a-zA-Z]:[\\\/]|^\\\\/.test(src);
            if (isLocalPath) {
                try {
                    const { convertFileSrc } = await import('@tauri-apps/api/core');
                    const assetUrl = convertFileSrc(src);
                    if (active) {
                        setDisplaySrc(prev => prev !== assetUrl ? assetUrl : prev);
                    }
                } catch (e) {
                    console.error('[IMAGE] Failed to convert src', e);
                }
            } else {
                if (active) setDisplaySrc(src);
            }
        };
        loadSrc();
        return () => { active = false; };
    }, [src]);

    const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
        const img = e.currentTarget;
        const nw = img.naturalWidth;
        if (nw > 0) {
            naturalWidthRef.current = nw;
            // Initialize width based on scale
            // If currentWidth is already set (e.g. during resize), don't overwrite? 
            // Actually usually we want to sync with prop if not resizing.
            if (!isResizing) {
                setCurrentWidth(nw * scale);
            }
        }
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        if (contentReadOnly) return;

        e.preventDefault();
        e.stopPropagation();

        setIsResizing(true);
        startXRef.current = e.clientX;
        const rect = imgRef.current?.getBoundingClientRect();
        startWidthRef.current = rect ? rect.width : (currentWidth || 200);

        (e.target as Element).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isResizing) return;
        e.preventDefault();

        const deltaX = e.clientX - startXRef.current;
        const newWidth = Math.max(50, startWidthRef.current + deltaX);
        setCurrentWidth(newWidth);
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (!isResizing) return;
        e.preventDefault();
        setIsResizing(false);
        (e.target as Element).releasePointerCapture(e.pointerId);

        // Commit change as scale
        if (currentWidth && naturalWidthRef.current > 0) {
            const rawScale = currentWidth / naturalWidthRef.current;
            // Round to 2 decimals for cleanliness
            const roundedScale = Math.round(rawScale * 100) / 100;
            // [GUARD] 極端な値を防ぐ: スケールは 0.1〜5.0 の範囲に制限
            const clampedScale = Math.min(5.0, Math.max(0.1, roundedScale));
            if (clampedScale !== scale) {
                onResizeEnd(clampedScale);
            }
        }
        // naturalWidthRef が 0 の場合は書き込みをスキップ（画像未ロード状態）
    };

    return (
        <span
            className="resizable-image-container"
            style={{
                display: 'inline-block',
                position: 'relative',
                maxWidth: '100%',
                verticalAlign: 'bottom',
                margin: '4px 0',
                userSelect: 'none'
            }}
            contentEditable={false}
            data-src-start={baseOffset}
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                ref={imgRef}
                src={displaySrc}
                alt={alt}
                title={alt}
                onLoad={handleImageLoad}
                style={{
                    width: currentWidth ? `${currentWidth}px` : 'auto',
                    maxWidth: '100%',
                    height: 'auto',
                    display: 'block',
                    borderRadius: '4px',
                    border: isResizing ? '2px solid #2196f3' : '1px solid transparent',
                    cursor: contentReadOnly ? 'default' : 'grab'
                }}
                draggable={false}
                onDragStart={(e) => {
                    if (contentReadOnly) return;

                    // 【重要修正】CodeMirrorにドラッグ処理を邪魔させないためのバリア
                    e.stopPropagation();

                    console.log('[DRAG] Image drag start');
                    e.dataTransfer.setData('application/x-fusen-image', 'true');
                    e.dataTransfer.effectAllowed = 'move'; // 移動のみ許可

                    // フォールバック用のテキスト
                    e.dataTransfer.setData('text/plain', alt);

                    if (onDragStart) onDragStart(e);
                }}
            />

            {!contentReadOnly && (
                <div
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    style={{
                        position: 'absolute',
                        bottom: '0',
                        right: '0',
                        width: '16px',
                        height: '16px',
                        cursor: 'ew-resize',
                        backgroundColor: isResizing ? '#2196f3' : 'rgba(0,0,0,0.3)',
                        borderTopLeftRadius: '4px',
                        borderBottomRightRadius: '4px',
                        zIndex: 10,
                        opacity: 0,
                        transition: 'opacity 0.2s',
                    }}
                    className="resize-handle"
                />
            )}
            {!contentReadOnly && onAnnotationClick && /^[a-zA-Z]:[\\\/]|^\\\\/.test(src) && (
                <div
                    style={{
                        position: 'absolute',
                        top: '4px',
                        right: '4px',
                        width: '24px',
                        height: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'rgba(0,0,0,0.5)',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        opacity: 0,
                        transition: 'opacity 0.2s',
                        zIndex: 11,
                    }}
                    className="annotation-hint"
                    title="描き込む"
                    onPointerDown={(e) => {
                        e.stopPropagation();
                        onAnnotationClick(src);
                    }}
                >
                    ✏️
                </div>
            )}
            <style jsx>{`
                .resizable-image-container:hover .resize-handle {
                    opacity: 1 !important;
                }
                .resize-handle:hover {
                    opacity: 1 !important;
                    background-color: #2196f3 !important;
                }
                .resizable-image-container:hover .annotation-hint {
                    opacity: 1 !important;
                }
            `}</style>
        </span>
    );
}
