/**
 * メインウィンドウ リサイズポリシー Hook
 *
 * 責務:
 * - 設定画面・セットアップ画面の開閉に応じてウィンドウサイズを自動切替
 *   - 設定/セットアップ表示中: 900x700（中央に表示）
 *   - 通常のダッシュボード: 240x300（中央）
 *   - 検索オーバーレイ表示中: リサイズしない（SearchOverlayのサイズを保護）
 *   - アップデートダイアログ表示中: リサイズしない（useUpdateCheckが420x280に設定済み）
 *
 * 元コード: page.tsx 178〜200行目 と 269〜294行目 の重複を統合
 */

import { useEffect } from 'react';

type UseMainWindowResizePolicyOptions = {
    setupRequired: boolean;
    isSettingsOpen: boolean;
    isCheckingSetup: boolean;
    showUpdateDialog: boolean;
    isSearchOpen: boolean;
};

export function useMainWindowResizePolicy({
    setupRequired,
    isSettingsOpen,
    isCheckingSetup,
    showUpdateDialog,
    isSearchOpen,
}: UseMainWindowResizePolicyOptions): void {
    useEffect(() => {
        const resize = async () => {
            try {
                const { getCurrentWindow } = await import('@tauri-apps/api/window');
                const { LogicalSize } = await import('@tauri-apps/api/dpi');
                const win = getCurrentWindow();

                // メインウィンドウ以外（付箋・プールウィンドウなど）はリサイズしない
                if (win.label !== 'main') return;

                // 検索オーバーレイ表示中はリサイズしない（setSize(600,450)を上書きしないよう）
                if (isSearchOpen) return;

                // アップデートダイアログ表示中はリサイズしない（useUpdateCheckが制御済み）
                if (showUpdateDialog) return;

                if (!isCheckingSetup && (setupRequired || isSettingsOpen)) {
                    // セットアップ中 or 設定画面表示中 → 大きく表示
                    await win.setSize(new LogicalSize(1100, 760));
                    await win.center();
                    await win.show();
                    await win.setFocus();
                } else if (!isCheckingSetup && !isSettingsOpen) {
                    // 通常のダッシュボード → 小さく表示
                    await win.setSize(new LogicalSize(240, 300));
                    await win.center();
                }
            } catch (e) {
                console.error('[useMainWindowResizePolicy] failed:', e);
            }
        };
        resize();
    }, [setupRequired, isSettingsOpen, isCheckingSetup, showUpdateDialog, isSearchOpen]);
}
