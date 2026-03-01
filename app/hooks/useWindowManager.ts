/**
 * ウィンドウ管理カスタムHook
 *
 * 責務:
 * - ウィンドウ座標/サイズの保存
 * - ミニマイズ機能
 * - ウィンドウイベントリスナー（move, resize）
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getWindowGeometry, setWindowSize } from '@/app/api/window';
import { PhysicalSize } from '@tauri-apps/api/dpi';

export type UseWindowManagerOptions = {
    onGeometryChange: (geometry: { x: number; y: number; width: number; height: number }) => void;
    onAutoExpand?: () => void; // [New] リサイズ操作により自動展開された際に呼ばれるコールバック
    getMinimizedHeight?: () => number; // [New] ミニマイズ時のウィンドウ高さを動的に計算するコールバック
};

export type UseWindowManagerReturn = {
    isMinimized: boolean;
    toggleMinimize: () => Promise<void>;
    saveWindowState: () => Promise<void>;
    setOriginalSize: (width: number, height: number) => void; // [New]
    setIsMinimized: (value: boolean) => void; // [New] Only for initial sync
};

export function useWindowManager({ onGeometryChange, onAutoExpand, getMinimizedHeight }: UseWindowManagerOptions): UseWindowManagerReturn {
    const [isMinimized, setIsMinimized] = useState(false);
    const originalSizeRef = useRef<{ width: number; height: number } | null>(null);

    // [New] イベントリスナー内で最新のステート/コールバックを参照するためのRef
    const isMinimizedRef = useRef(isMinimized);
    const onAutoExpandRef = useRef(onAutoExpand);
    const getMinimizedHeightRef = useRef(getMinimizedHeight);

    useEffect(() => {
        isMinimizedRef.current = isMinimized;
    }, [isMinimized]);

    useEffect(() => {
        onAutoExpandRef.current = onAutoExpand;
    }, [onAutoExpand]);

    useEffect(() => {
        getMinimizedHeightRef.current = getMinimizedHeight;
    }, [getMinimizedHeight]);

    const setOriginalSize = useCallback((width: number, height: number) => {
        originalSizeRef.current = { width, height };
    }, []);

    /**
     * ウィンドウの座標とサイズを保存する
     */
    const saveWindowState = useCallback(async () => {
        if (isMinimized) {
            return;
        }
        try {
            const geometry = await getWindowGeometry();
            onGeometryChange(geometry);
        } catch (e) {
            console.error('[useWindowManager] Failed to save window state:', e);
        }
    }, [onGeometryChange, isMinimized]);

    /**
     * ミニマイズモードをトグルする
     */
    const toggleMinimize = useCallback(async () => {
        const win = getCurrentWindow();

        if (isMinimized) {
            // 元のサイズに復元
            if (originalSizeRef.current) {
                await win.setSize(
                    new PhysicalSize(
                        originalSizeRef.current.width,
                        originalSizeRef.current.height
                    )
                );
            }
            setIsMinimized(false);
        } else {
            // 現在のサイズを記憶してからミニマイズ
            const size = await win.innerSize();
            originalSizeRef.current = { width: size.width, height: size.height };

            // DPIスケールファクターを考慮して高さを設定
            const factor = await win.scaleFactor();
            // 呼び出し元の計算式があればそれを使用し、なければデフォルト40px
            const logicalHeight = getMinimizedHeightRef.current ? getMinimizedHeightRef.current() : 40;
            const targetHeight = Math.round(logicalHeight * factor);

            await win.setSize(new PhysicalSize(size.width, targetHeight));
            setIsMinimized(true);
        }
    }, [isMinimized]);

    // [New] 初期化時にfolded状態だった場合、現在のサイズを「展開時サイズ」として保持するのではなく
    // 明示的に展開時のデフォルトサイズ（またはメタデータからのサイズ）をセットすべきだが
    // ここでは簡易的に「現在のサイズ」を保存しないようにガードする。
    // 実際の展開サイズ復元は StickyNote.tsx 側で folded 判定時に行う。

    /**
     * ウィンドウイベントリスナーをセットアップ
     */
    useEffect(() => {
        let isMounted = true;
        let unlistenMove: (() => void) | null = null;
        let unlistenResize: (() => void) | null = null;

        const setupListeners = async () => {
            try {
                const win = getCurrentWindow();

                // unlisten関数自体がPromiseを返すTauri v2仕様への対策ラッパー
                const wrapUnlisten = (u: any) => () => {
                    try {
                        const p = u?.();
                        if (p && p.catch) p.catch(() => { });
                    } catch (e) { }
                };

                const uMove = await win.listen('tauri://move', () => {
                    saveWindowState();
                });
                const safeMove = wrapUnlisten(uMove);
                if (isMounted) unlistenMove = safeMove; else safeMove();

                const uResize = await win.listen('tauri://resize', async () => {
                    if (isMinimizedRef.current) {
                        // ミニマイズ中にリサイズされた場合、高さが一定以上増えていたら「自動展開」とする
                        const size = await win.innerSize();
                        const factor = await win.scaleFactor();
                        const logicalHeight = getMinimizedHeightRef.current ? getMinimizedHeightRef.current() : 40;
                        const targetHeight = Math.round(logicalHeight * factor);

                        // 10px(物理ピクセル)以上広げられたら自動展開
                        if (size.height > targetHeight + 10) {
                            setIsMinimized(false);
                            // 手動で広げたサイズを新たな「展開サイズ」として記憶しておく
                            originalSizeRef.current = { width: size.width, height: size.height };

                            if (onAutoExpandRef.current) {
                                onAutoExpandRef.current();
                            }
                        }
                    } else {
                        saveWindowState();
                    }
                });
                const safeResize = wrapUnlisten(uResize);
                if (isMounted) unlistenResize = safeResize; else safeResize();

            } catch (err) {
                // setup failed silently
            }
        };

        setupListeners();

        return () => {
            isMounted = false;
            const safeUnlisten = (u: any) => {
                try {
                    const p = u?.();
                    if (p && p.catch) p.catch(() => { });
                } catch (e) { }
            };
            safeUnlisten(unlistenMove);
            safeUnlisten(unlistenResize);
        };
    }, [saveWindowState]);

    return {
        isMinimized,
        toggleMinimize,
        saveWindowState,
        setOriginalSize,
        setIsMinimized
    };
}
