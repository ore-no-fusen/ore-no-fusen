'use client';

/**
 * 画像アノテーションモーダル
 *
 * 責務:
 * - Konva.js を使い画像に矢印・吹き出し・四角・ペンで描き込み
 * - 描き込み後 PNG を上書き保存 (fusen_save_annotated_image)
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

type Tool = 'pen' | 'highlight' | 'arrow' | 'rect' | 'callout';

interface Props {
    absolutePath: string;
    displayUrl: string;
    onSaved: () => void;
    onCancel: () => void;
}

// 通常ツール用カラー
const PEN_COLORS = [
    { value: '#ef4444', label: '赤' },
    { value: '#3b82f6', label: '青' },
    { value: '#22c55e', label: '緑' },
    { value: '#eab308', label: '黄' },
];

// 蛍光ペン用: Excelと同等のビビッドカラー
const HIGHLIGHT_COLORS = [
    { value: '#FFFF00', label: '黄' },
    { value: '#00FF00', label: '緑' },
    { value: '#00FFFF', label: '水色' },
    { value: '#FF69B4', label: 'ピンク' },
];

const TOOLS: { value: Tool; label: string }[] = [
    { value: 'pen',       label: 'ペン' },
    { value: 'highlight', label: '蛍光ペン' },
    { value: 'arrow',     label: '矢印' },
    { value: 'rect',      label: '四角' },
    { value: 'callout',   label: '吹き出し' },
];

export default function ImageAnnotationModal({ absolutePath, displayUrl, onSaved, onCancel }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const stageRef = useRef<import('konva/lib/Stage').Stage | null>(null);
    const drawLayerRef = useRef<import('konva/lib/Layer').Layer | null>(null);
    // Refs for current drawing state (avoid stale closures)
    const toolRef = useRef<Tool>('pen');
    const colorRef = useRef<string>('#ef4444');
    const strokeWidthRef = useRef<number>(3);
    const isDrawingRef = useRef(false);
    const currentShapeRef = useRef<import('konva/lib/Shape').Shape | null>(null);
    const pointsRef = useRef<number[]>([]);
    const originRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    // UI state (for toolbar rendering)
    const [tool, setTool] = useState<Tool>('pen');
    const [color, setColor] = useState<string>('#ef4444');
    const [strokeWidth, setStrokeWidth] = useState<number>(3);
    const [isSaving, setIsSaving] = useState(false);
    const [historyCount, setHistoryCount] = useState(0); // for undo button enable

    // natural dimensions of the image (for pixelRatio on export)
    const naturalSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
    const stageSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

    // Keep refs in sync with state
    useEffect(() => { toolRef.current = tool; }, [tool]);
    useEffect(() => { colorRef.current = color; }, [color]);
    useEffect(() => { strokeWidthRef.current = strokeWidth; }, [strokeWidth]);

    // ─── Init Konva Stage ────────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        let blobUrl: string | null = null;
        let stage: import('konva/lib/Stage').Stage;
        let layer: import('konva/lib/Layer').Layer;
        let imgLayer: import('konva/lib/Layer').Layer;

        const init = async () => {
            const Konva = (await import('konva')).default;
            if (cancelled || !containerRef.current) return;

            // Load image to get natural size.
            // asset:// URL をそのまま img.src に使うと canvas が tainted になり
            // toDataURL() が黒い画像を返すため、blob URL に変換してから使う。
            const img = new window.Image();
            try {
                const resp = await fetch(displayUrl);
                const blob = await resp.blob();
                blobUrl = URL.createObjectURL(blob);
                img.src = blobUrl;
            } catch {
                img.src = displayUrl; // fallback
            }
            await new Promise<void>((res) => {
                img.onload = () => res();
                img.onerror = () => res();
            });
            if (cancelled) return;

            const nw = img.naturalWidth || img.width || 800;
            const nh = img.naturalHeight || img.height || 600;
            naturalSizeRef.current = { w: nw, h: nh };

            // Scale to fit 80% viewport
            const maxW = window.innerWidth * 0.8;
            const maxH = (window.innerHeight - 160) * 0.9; // leave room for toolbars
            const scaleW = maxW / nw;
            const scaleH = maxH / nh;
            const sc = Math.min(scaleW, scaleH, 1); // don't upscale
            const stageW = Math.round(nw * sc);
            const stageH = Math.round(nh * sc);
            stageSizeRef.current = { w: stageW, h: stageH };

            // Create stage
            stage = new Konva.Stage({
                container: containerRef.current!,
                width: stageW,
                height: stageH,
            });

            // Background image layer
            imgLayer = new Konva.Layer();
            const kImg = new Konva.Image({
                image: img,
                x: 0,
                y: 0,
                width: stageW,
                height: stageH,
            });
            imgLayer.add(kImg);
            stage.add(imgLayer);

            // Drawing layer
            layer = new Konva.Layer();
            stage.add(layer);

            stageRef.current = stage;
            drawLayerRef.current = layer;

            // ─── Mouse events ────────────────────────────────────────────
            stage.on('mousedown touchstart', (e) => {
                const pos = stage.getPointerPosition();
                if (!pos) return;

                const t = toolRef.current;
                const c = colorRef.current;

                if (t === 'callout') {
                    // Callout: prompt for text then place
                    const text = window.prompt('吹き出しのテキストを入力してください', '注目！');
                    if (text === null) return; // cancelled
                    const label = new Konva.Label({ x: pos.x, y: pos.y, draggable: true });
                    label.add(new Konva.Tag({
                        fill: c,
                        stroke: c,
                        strokeWidth: 2,
                        pointerDirection: 'down',
                        pointerWidth: 16,
                        pointerHeight: 12,
                        cornerRadius: 6,
                    }));
                    label.add(new Konva.Text({
                        text: text || '注目！',
                        fontSize: 14,
                        fontFamily: '"BIZ UDPGothic", Meiryo, sans-serif',
                        fill: '#ffffff',
                        padding: 8,
                    }));
                    layer.add(label);
                    layer.batchDraw();
                    setHistoryCount(layer.children.length);
                    return;
                }

                isDrawingRef.current = true;
                originRef.current = { x: pos.x, y: pos.y };

                if (t === 'pen' || t === 'highlight') {
                    pointsRef.current = [pos.x, pos.y];
                    const sw = strokeWidthRef.current;
                    const line = new Konva.Line({
                        points: [pos.x, pos.y],
                        stroke: c,
                        strokeWidth: sw,
                        opacity: t === 'highlight' ? 0.45 : 1,
                        lineCap: 'round',
                        lineJoin: 'round',
                        tension: t === 'highlight' ? 0 : 0.5,
                        globalCompositeOperation: t === 'highlight' ? 'multiply' : 'source-over',
                    });
                    layer.add(line);
                    currentShapeRef.current = line as unknown as import('konva/lib/Shape').Shape;
                } else if (t === 'arrow') {
                    const arrow = new Konva.Arrow({
                        points: [pos.x, pos.y, pos.x, pos.y],
                        stroke: c,
                        fill: c,
                        strokeWidth: 3,
                        pointerLength: 12,
                        pointerWidth: 10,
                        lineCap: 'round',
                    });
                    layer.add(arrow);
                    currentShapeRef.current = arrow as unknown as import('konva/lib/Shape').Shape;
                } else if (t === 'rect') {
                    const rect = new Konva.Rect({
                        x: pos.x,
                        y: pos.y,
                        width: 0,
                        height: 0,
                        stroke: c,
                        strokeWidth: 3,
                        fill: 'transparent',
                    });
                    layer.add(rect);
                    currentShapeRef.current = rect as unknown as import('konva/lib/Shape').Shape;
                }
            });

            stage.on('mousemove touchmove', () => {
                if (!isDrawingRef.current) return;
                const pos = stage.getPointerPosition();
                if (!pos) return;

                const t = toolRef.current;
                const shape = currentShapeRef.current;
                if (!shape) return;

                if (t === 'pen' || t === 'highlight') {
                    const line = shape as unknown as import('konva/lib/shapes/Line').Line;
                    const newPoints = [...pointsRef.current, pos.x, pos.y];
                    pointsRef.current = newPoints;
                    line.points(newPoints);
                } else if (t === 'arrow') {
                    const arrow = shape as unknown as import('konva/lib/shapes/Arrow').Arrow;
                    arrow.points([originRef.current.x, originRef.current.y, pos.x, pos.y]);
                } else if (t === 'rect') {
                    const rect = shape as unknown as import('konva/lib/shapes/Rect').Rect;
                    const ox = originRef.current.x;
                    const oy = originRef.current.y;
                    rect.setAttrs({
                        x: Math.min(ox, pos.x),
                        y: Math.min(oy, pos.y),
                        width: Math.abs(pos.x - ox),
                        height: Math.abs(pos.y - oy),
                    });
                }
                layer.batchDraw();
            });

            stage.on('mouseup touchend', () => {
                if (!isDrawingRef.current) return;
                isDrawingRef.current = false;
                currentShapeRef.current = null;
                pointsRef.current = [];
                setHistoryCount(layer.children.length);
            });
        };

        init();
        return () => {
            cancelled = true;
            if (blobUrl) URL.revokeObjectURL(blobUrl);
            stageRef.current?.destroy();
            stageRef.current = null;
            drawLayerRef.current = null;
        };
    }, [displayUrl]);

    // ─── Undo ────────────────────────────────────────────────────────────
    const handleToolChange = useCallback((t: Tool) => {
        setTool(t);
        if (t === 'highlight') {
            setColor('#FFFF00');
            setStrokeWidth(24);
        } else if (t === 'pen') {
            setColor('#ef4444');
            setStrokeWidth(3);
        }
    }, []);

    const handleUndo = useCallback(() => {
        const layer = drawLayerRef.current;
        if (!layer) return;
        const children = layer.children;
        if (children.length === 0) return;
        children[children.length - 1].destroy();
        layer.batchDraw();
        setHistoryCount(layer.children.length);
    }, []);

    // ─── Save ────────────────────────────────────────────────────────────
    const handleSave = useCallback(async () => {
        const stage = stageRef.current;
        if (!stage) return;
        setIsSaving(true);
        try {
            const { w: nw, h: nh } = naturalSizeRef.current;
            const { w: sw, h: sh } = stageSizeRef.current;
            const pixelRatio = sw > 0 ? nw / sw : 1;
            const dataUrl = stage.toDataURL({ mimeType: 'image/png', pixelRatio });
            await invoke('fusen_save_annotated_image', { path: absolutePath, data: dataUrl });
            onSaved();
        } catch (err) {
            console.error('[ANNOTATION] save error', err);
            alert(`保存に失敗しました: ${err}`);
        } finally {
            setIsSaving(false);
        }
    }, [absolutePath, onSaved]);

    // ─── Keyboard shortcut (Escape = cancel) ─────────────────────────────
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onCancel();
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') handleUndo();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onCancel, handleUndo]);

    return (
        <div
            className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onPointerDown={(e) => e.stopPropagation()}
        >
            <div
                className="bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden"
                style={{ maxWidth: '92vw', maxHeight: '92vh' }}
                onPointerDown={(e) => e.stopPropagation()}
            >
                {/* ── Toolbar ── */}
                <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 bg-gray-50 flex-wrap">
                    {/* Tool buttons */}
                    <div className="flex gap-1">
                        {TOOLS.map(({ value, label }) => (
                            <button
                                key={value}
                                onClick={() => handleToolChange(value)}
                                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                                    tool === value
                                        ? 'bg-blue-500 text-white'
                                        : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    <div className="w-px h-6 bg-gray-300" />

                    {/* Color buttons: 蛍光ペン時はビビッドカラー、それ以外は通常色 */}
                    <div className="flex gap-1 items-center">
                        {(tool === 'highlight' ? HIGHLIGHT_COLORS : PEN_COLORS).map(({ value, label }) => (
                            <button
                                key={value}
                                title={label}
                                onClick={() => setColor(value)}
                                className="w-7 h-7 rounded-full border-2 transition-transform"
                                style={{
                                    backgroundColor: value,
                                    borderColor: color === value ? '#1d4ed8' : 'rgba(0,0,0,0.2)',
                                    transform: color === value ? 'scale(1.2)' : 'scale(1)',
                                }}
                            />
                        ))}
                    </div>

                    {/* 太さスライダー: ペン・蛍光ペンのみ表示 */}
                    {(tool === 'pen' || tool === 'highlight') && (
                        <>
                            <div className="w-px h-6 bg-gray-300" />
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500">太さ</span>
                                <input
                                    type="range"
                                    min={tool === 'highlight' ? 10 : 1}
                                    max={tool === 'highlight' ? 50 : 20}
                                    value={strokeWidth}
                                    onChange={(e) => setStrokeWidth(Number(e.target.value))}
                                    className="w-24 accent-blue-500"
                                />
                                <span className="text-xs text-gray-500 w-5 text-right">{strokeWidth}</span>
                            </div>
                        </>
                    )}
                </div>

                {/* ── Canvas ── */}
                <div className="overflow-auto flex-1 flex items-center justify-center bg-gray-100 p-4">
                    <div
                        ref={containerRef}
                        style={{ cursor: tool === 'callout' ? 'crosshair' : 'crosshair', lineHeight: 0 }}
                    />
                </div>

                {/* ── Footer buttons ── */}
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                    <button
                        onClick={handleUndo}
                        disabled={historyCount === 0}
                        className="px-4 py-1.5 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        元に戻す
                    </button>
                    <div className="flex gap-2">
                        <button
                            onClick={onCancel}
                            className="px-4 py-1.5 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-100"
                        >
                            キャンセル
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="px-5 py-1.5 rounded bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSaving ? '保存中…' : '保存'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
