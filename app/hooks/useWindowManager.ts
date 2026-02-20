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
};

export type UseWindowManagerReturn = {
    isMinimized: boolean;
    toggleMinimize: () => Promise<void>;
    saveWindowState: () => Promise<void>;
    setOriginalSize: (width: number, height: number) => void; // [New]
    setIsMinimized: (value: boolean) => void; // [New] Only for initial sync
};

export function useWindowManager({ onGeometryChange }: UseWindowManagerOptions): UseWindowManagerReturn {
    const [isMinimized, setIsMinimized] = useState(false);
    const originalSizeRef = useRef<{ width: number; height: number } | null>(null);

    const setOriginalSize = useCallback((width: number, height: number) => {
        originalSizeRef.current = { width, height };
    }, []);

    /**
     * ウィンドウの座標とサイズを保存する
     */
    const saveWindowState = useCallback(async () => {
        if (isMinimized) {
            console.log('[useWindowManager] Skipping saveWindowState because isMinimized is true');
            return;
        }
        try {
            const geometry = await getWindowGeometry();
            console.log('[useWindowManager] Saving geometry:', geometry);
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
            console.log('[useWindowManager] Restored to original size');
        } else {
            // 現在のサイズを記憶してからミニマイズ
            const size = await win.innerSize();
            originalSizeRef.current = { width: size.width, height: size.height };

            // DPIスケールファクターを考慮して1行分のサイズに縮小
            const factor = await win.scaleFactor();
            const targetHeight = Math.round(40 * factor); // 40px論理 → 物理

            await win.setSize(new PhysicalSize(size.width, targetHeight));
            setIsMinimized(true);
            console.log('[useWindowManager] Minimized to 1 line');
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
        let unlistenMove: (() => void) | undefined;
        let unlistenResize: (() => void) | undefined;

        const setupListeners = async () => {
            const win = getCurrentWindow();

            unlistenMove = await win.listen('tauri://move', () => {
                saveWindowState();
            });

            unlistenResize = await win.listen('tauri://resize', () => {
                saveWindowState();
            });

            console.log('[useWindowManager] Event listeners setup complete');
        };

        setupListeners();

        return () => {
            if (unlistenMove) unlistenMove();
            if (unlistenResize) unlistenResize();
            console.log('[useWindowManager] Event listeners cleaned up');
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
