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
import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalSize, PhysicalSize } from '@tauri-apps/api/dpi';
import { AnnotationHistory } from '../utils/annotationHistory';
import type { Language } from '@/lib/i18n';

type Tool = 'pen' | 'highlight' | 'arrow' | 'rect' | 'callout';
type AnnotationNode = import('konva/lib/Shape').Shape | import('konva/lib/Group').Group;

export const DEFAULT_ANNOTATION_SETTINGS = {
    tool: 'highlight' as Tool,
    color: '#00FF00',
    strokeWidth: 15,
    highlightOpacity: 0.5,
} as const;

interface Props {
    absolutePath: string;
    displayUrl: string;
    onSaved: () => void;
    onCancel: () => void;
    language: Language;
}

type PngExportStage = Pick<import('konva/lib/Stage').Stage, 'draw' | 'toDataURL'>;

export function exportStageAsPng(stage: PngExportStage, pixelRatio: number): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        stage.draw();
        stage.toDataURL({
            mimeType: 'image/png',
            pixelRatio,
            callback: (dataUrl: string) => {
                if (!dataUrl.startsWith('data:image/png;base64,') || dataUrl.length <= 'data:image/png;base64,'.length) {
                    reject(new Error('PNG Data URLを生成できませんでした。元画像は変更しません。'));
                    return;
                }
                resolve(dataUrl);
            },
        });
    });
}

const PEN_COLORS = [
    { value: '#ef4444', ja: '赤', en: 'Red' },
    { value: '#3b82f6', ja: '青', en: 'Blue' },
    { value: '#22c55e', ja: '緑', en: 'Green' },
    { value: '#eab308', ja: '黄', en: 'Yellow' },
];

const HIGHLIGHT_COLORS = [
    { value: '#FFFF00', ja: '黄', en: 'Yellow' },
    { value: '#00FF00', ja: '緑', en: 'Green' },
    { value: '#00FFFF', ja: '水色', en: 'Cyan' },
    { value: '#FF69B4', ja: 'ピンク', en: 'Pink' },
];

const TOOLS: { value: Tool; ja: string; en: string }[] = [
    { value: 'pen', ja: 'ペン', en: 'Pen' },
    { value: 'highlight', ja: '蛍光ペン', en: 'Highlighter' },
    { value: 'arrow', ja: '矢印', en: 'Arrow' },
    { value: 'rect', ja: '四角', en: 'Rectangle' },
    { value: 'callout', ja: '吹き出し', en: 'Callout' },
];

export default function ImageAnnotationModal({ absolutePath, displayUrl, onSaved, onCancel, language }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const stageRef = useRef<import('konva/lib/Stage').Stage | null>(null);
    const drawLayerRef = useRef<import('konva/lib/Layer').Layer | null>(null);
    const historyRef = useRef(new AnnotationHistory<AnnotationNode>());
    const toolRef = useRef<Tool>(DEFAULT_ANNOTATION_SETTINGS.tool);
    const colorRef = useRef<string>(DEFAULT_ANNOTATION_SETTINGS.color);
    const strokeWidthRef = useRef<number>(DEFAULT_ANNOTATION_SETTINGS.strokeWidth);
    const isDrawingRef = useRef(false);
    const currentShapeRef = useRef<import('konva/lib/Shape').Shape | null>(null);
    const pointsRef = useRef<number[]>([]);
    const originRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    const [tool, setTool] = useState<Tool>(DEFAULT_ANNOTATION_SETTINGS.tool);
    const [color, setColor] = useState<string>(DEFAULT_ANNOTATION_SETTINGS.color);
    const [strokeWidth, setStrokeWidth] = useState<number>(DEFAULT_ANNOTATION_SETTINGS.strokeWidth);
    const [highlightOpacity, setHighlightOpacity] = useState<number>(DEFAULT_ANNOTATION_SETTINGS.highlightOpacity);
    const highlightOpacityRef = useRef<number>(DEFAULT_ANNOTATION_SETTINGS.highlightOpacity);
    const [isSaving, setIsSaving] = useState(false);
    const [historyCounts, setHistoryCounts] = useState({ undo: 0, redo: 0 });

    const naturalSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
    const stageSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

    useEffect(() => { toolRef.current = tool; }, [tool]);
    useEffect(() => { colorRef.current = color; }, [color]);
    useEffect(() => { strokeWidthRef.current = strokeWidth; }, [strokeWidth]);
    useEffect(() => { highlightOpacityRef.current = highlightOpacity; }, [highlightOpacity]);

    const syncHistoryCounts = useCallback(() => {
        setHistoryCounts(historyRef.current.counts);
    }, []);

    useEffect(() => {
        let cancelled = false;
        let blobUrl: string | null = null;
        let stage: import('konva/lib/Stage').Stage;
        let layer: import('konva/lib/Layer').Layer;
        let imgLayer: import('konva/lib/Layer').Layer;
        const history = historyRef.current;

        const init = async () => {
            const Konva = (await import('konva')).default;
            if (cancelled || !containerRef.current) return;

            const img = new window.Image();
            try {
                const resp = await fetch(displayUrl);
                const blob = await resp.blob();
                blobUrl = URL.createObjectURL(blob);
                img.src = blobUrl;
            } catch {
                img.src = displayUrl;
            }
            await new Promise<void>((res) => {
                img.onload = () => res();
                img.onerror = () => res();
            });
            if (cancelled) return;

            const nw = img.naturalWidth || img.width || 800;
            const nh = img.naturalHeight || img.height || 600;
            naturalSizeRef.current = { w: nw, h: nh };

            const maxW = 680 * 0.88;
            const maxH = (540 - 120) * 0.88;
            const scaleW = maxW / nw;
            const scaleH = maxH / nh;
            const sc = Math.min(scaleW, scaleH);
            const stageW = Math.round(nw * sc);
            const stageH = Math.round(nh * sc);
            stageSizeRef.current = { w: stageW, h: stageH };

            stage = new Konva.Stage({
                container: containerRef.current!,
                width: stageW,
                height: stageH,
            });

            imgLayer = new Konva.Layer();
            const kImg = new Konva.Image({ image: img, x: 0, y: 0, width: stageW, height: stageH });
            imgLayer.add(kImg);
            stage.add(imgLayer);

            layer = new Konva.Layer();
            stage.add(layer);

            stageRef.current = stage;
            drawLayerRef.current = layer;

            stage.on('mousedown touchstart', () => {
                const pos = stage.getPointerPosition();
                if (!pos) return;

                const t = toolRef.current;
                const c = colorRef.current;

                if (t === 'callout') {
                    const text = window.prompt(
                        language === 'en' ? 'Enter callout text' : '吹き出しのテキストを入力してください',
                        language === 'en' ? 'Note!' : '注目！',
                    );
                    if (text === null) return;
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
                        text: text || (language === 'en' ? 'Note!' : '注目！'),
                        fontSize: 14,
                        fontFamily: '"BIZ UDPGothic", Meiryo, sans-serif',
                        fill: '#ffffff',
                        padding: 8,
                    }));
                    layer.add(label);
                    layer.batchDraw();
                    history.record(label);
                    syncHistoryCounts();
                    return;
                }

                isDrawingRef.current = true;
                originRef.current = { x: pos.x, y: pos.y };

                if (t === 'pen' || t === 'highlight') {
                    pointsRef.current = [pos.x, pos.y];
                    const line = new Konva.Line({
                        points: [pos.x, pos.y],
                        stroke: c,
                        strokeWidth: strokeWidthRef.current,
                        opacity: t === 'highlight' ? highlightOpacityRef.current : 1,
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
                const completedShape = currentShapeRef.current;
                currentShapeRef.current = null;
                pointsRef.current = [];
                if (completedShape) history.record(completedShape);
                syncHistoryCounts();
            });
        };

        void init();
        return () => {
            cancelled = true;
            if (blobUrl) URL.revokeObjectURL(blobUrl);
            history.reset();
            stageRef.current?.destroy();
            stageRef.current = null;
            drawLayerRef.current = null;
        };
    }, [displayUrl, language, syncHistoryCounts]);

    const handleToolChange = useCallback((t: Tool) => {
        setTool(t);
        if (t === 'highlight') {
            setColor(DEFAULT_ANNOTATION_SETTINGS.color);
            setStrokeWidth(DEFAULT_ANNOTATION_SETTINGS.strokeWidth);
            setHighlightOpacity(DEFAULT_ANNOTATION_SETTINGS.highlightOpacity);
        } else if (t === 'pen') {
            setColor('#ef4444');
            setStrokeWidth(3);
        }
    }, []);

    const handleUndo = useCallback(() => {
        const layer = drawLayerRef.current;
        if (!layer) return;
        historyRef.current.undo(layer);
        syncHistoryCounts();
    }, [syncHistoryCounts]);

    const handleRedo = useCallback(() => {
        const layer = drawLayerRef.current;
        if (!layer) return;
        historyRef.current.redo(layer);
        syncHistoryCounts();
    }, [syncHistoryCounts]);

    const handleSave = useCallback(async () => {
        const stage = stageRef.current;
        if (!stage) return;
        setIsSaving(true);
        try {
            const { w: nw } = naturalSizeRef.current;
            const { w: sw } = stageSizeRef.current;
            const pixelRatio = sw > 0 && nw > 0 ? nw / sw : 1;
            const dataUrl = await exportStageAsPng(stage, pixelRatio);
            await invoke('fusen_save_annotated_image', { path: absolutePath, data: dataUrl });
            onSaved();
        } catch (err) {
            console.error('[ANNOTATION] save error', err);
            alert(`${language === 'en' ? 'Could not save: ' : '保存に失敗しました: '}${err}`);
        } finally {
            setIsSaving(false);
        }
    }, [absolutePath, language, onSaved]);

    useEffect(() => {
        const win = getCurrentWindow();
        let originalSize: { width: number; height: number } | null = null;
        win.outerSize().then((size) => {
            originalSize = { width: size.width, height: size.height };
            win.setSize(new LogicalSize(680, 540)).catch(() => {});
        }).catch(() => {});
        return () => {
            if (originalSize) {
                win.setSize(new PhysicalSize(originalSize.width, originalSize.height)).catch(() => {});
            }
        };
    }, []);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onCancel();
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) handleRedo();
                else handleUndo();
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                handleRedo();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onCancel, handleUndo, handleRedo]);

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 backdrop-blur-sm" onPointerDown={(e) => e.stopPropagation()}>
            <div className="bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden" style={{ maxWidth: '92vw', maxHeight: '92vh' }} onPointerDown={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 bg-gray-50 flex-wrap">
                    <div className="flex gap-1">
                        {TOOLS.map(({ value, ja, en }) => (
                            <button key={value} onClick={() => handleToolChange(value)} className={`px-3 py-1 rounded text-sm font-medium transition-colors ${tool === value ? 'bg-blue-500 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'}`}>
                                {language === 'en' ? en : ja}
                            </button>
                        ))}
                    </div>
                    <div className="w-px h-6 bg-gray-300" />
                    <div className="flex gap-1 items-center">
                        {(tool === 'highlight' ? HIGHLIGHT_COLORS : PEN_COLORS).map(({ value, ja, en }) => (
                            <button key={value} title={language === 'en' ? en : ja} onClick={() => setColor(value)} className="w-7 h-7 rounded-full border-2 transition-transform" style={{ backgroundColor: value, borderColor: color === value ? '#1d4ed8' : 'rgba(0,0,0,0.2)', transform: color === value ? 'scale(1.2)' : 'scale(1)' }} />
                        ))}
                    </div>
                    {(tool === 'pen' || tool === 'highlight') && (
                        <>
                            <div className="w-px h-6 bg-gray-300" />
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500">{language === 'en' ? 'Width' : '太さ'}</span>
                                <input type="range" min={tool === 'highlight' ? 10 : 1} max={tool === 'highlight' ? 50 : 20} value={strokeWidth} onChange={(e) => setStrokeWidth(Number(e.target.value))} className="w-24 accent-blue-500" />
                                <span className="text-xs text-gray-500 w-5 text-right">{strokeWidth}</span>
                            </div>
                        </>
                    )}
                    {tool === 'highlight' && (
                        <>
                            <div className="w-px h-6 bg-gray-300" />
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500">{language === 'en' ? 'Opacity' : '濃さ'}</span>
                                <input type="range" min={10} max={90} value={Math.round(highlightOpacity * 100)} onChange={(e) => setHighlightOpacity(Number(e.target.value) / 100)} className="w-24 accent-blue-500" />
                                <span className="text-xs text-gray-500 w-5 text-right">{Math.round(highlightOpacity * 100)}</span>
                            </div>
                        </>
                    )}
                </div>
                <div className="overflow-auto flex-1 flex items-center justify-center bg-gray-100 p-4">
                    <div ref={containerRef} style={{ cursor: 'crosshair', lineHeight: 0 }} />
                </div>
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                    <div className="flex gap-2">
                        <button onClick={handleUndo} disabled={historyCounts.undo === 0} className="px-4 py-1.5 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed">
                            {language === 'en' ? 'Undo' : '元に戻す'}
                        </button>
                        <button onClick={handleRedo} disabled={historyCounts.redo === 0} className="px-4 py-1.5 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed">
                            {language === 'en' ? 'Redo' : 'やり直す'}
                        </button>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={onCancel} className="px-4 py-1.5 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-100">
                            {language === 'en' ? 'Cancel' : 'キャンセル'}
                        </button>
                        <button onClick={handleSave} disabled={isSaving} className="px-5 py-1.5 rounded bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed">
                            {isSaving ? (language === 'en' ? 'Saving…' : '保存中…') : (language === 'en' ? 'Save' : '保存')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
