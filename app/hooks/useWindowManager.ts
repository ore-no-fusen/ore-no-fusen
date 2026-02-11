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
};

export function useWindowManager({ onGeometryChange }: UseWindowManagerOptions): UseWindowManagerReturn {
    const [isMinimized, setIsMinimized] = useState(false);
    const originalSizeRef = useRef<{ width: number; height: number } | null>(null);

    /**
     * ウィンドウの座標とサイズを保存する
     */
    const saveWindowState = useCallback(async () => {
        try {
            const geometry = await getWindowGeometry();
            console.log('[useWindowManager] Saving geometry:', geometry);
            onGeometryChange(geometry);
        } catch (e) {
            console.error('[useWindowManager] Failed to save window state:', e);
        }
    }, [onGeometryChange]);

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
        saveWindowState
    };
}
