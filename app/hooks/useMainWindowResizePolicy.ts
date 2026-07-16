/**
 * メインウィンドウ リサイズポリシー Hook
 *
 * 責務:
 * - 設定画面・セットアップ画面の開閉に応じてウィンドウサイズを自動切替
 *   - 設定/セットアップ表示中: 画面に合わせて適応（横は内容が切れないように、縦はスクロール前提でほどよく）
 *   - 通常のダッシュボード: 240x300（中央）
 *   - 検索オーバーレイ表示中: リサイズしない（SearchOverlayのサイズを保護）
 *   - アップデートダイアログ表示中: リサイズしない（useUpdateCheckが420x280に設定済み）
 *
 * 元コード: page.tsx 178〜200行目 と 269〜294行目 の重複を統合
 */

import { useEffect } from 'react';

/**
 * モニタサイズに応じて設定ウィンドウのサイズを決める。
 * 横: モニタの 90%、ただし [1280, 1600] に収める（内容が切れないよう最低 1280）
 * 縦: モニタの 85%、ただし [720, 1000] に収める（スクロール前提のためそこまで大きくしない）
 * モニタ取得に失敗した場合は安全側のデフォルト 1280x860 にフォールバック。
 */
export async function calcSettingsWindowSize(): Promise<{ width: number; height: number }> {
    try {
        const { currentMonitor } = await import('@tauri-apps/api/window');
        const monitor = await currentMonitor();
        if (monitor) {
            const sf = monitor.scaleFactor ?? 1;
            const logicalW = monitor.size.width / sf;
            const logicalH = monitor.size.height / sf;
            const width = Math.round(Math.min(1600, Math.max(1280, logicalW * 0.9)));
            const height = Math.round(Math.min(1000, Math.max(720, logicalH * 0.85)));
            return { width, height };
        }
    } catch (e) {
        console.warn('[calcSettingsWindowSize] currentMonitor failed, falling back:', e);
    }
    return { width: 1280, height: 860 };
}

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
        let cancelled = false;
        const resize = async () => {
            let debug: (message: string) => void = console.log;
            try {
                const { getCurrentWindow } = await import('@tauri-apps/api/window');
                const { LogicalSize } = await import('@tauri-apps/api/dpi');
                const { invoke } = await import('@tauri-apps/api/core');
                const win = getCurrentWindow();
                debug = (message: string) => {
                    console.log(message);
                    invoke('fusen_debug_log', { message }).catch(() => {});
                };

                // メインウィンドウ以外（付箋・プールウィンドウなど）はリサイズしない
                if (win.label !== 'main') return;

                const settingsVisible = !isCheckingSetup && (setupRequired || isSettingsOpen);
                debug(`[WINDOW_SIZE] policy start settings=${isSettingsOpen} setup=${setupRequired} checking=${isCheckingSetup} search=${isSearchOpen} update=${showUpdateDialog} settingsVisible=${settingsVisible}`);
                if (cancelled) {
                    debug('[WINDOW_SIZE] policy cancelled before resize');
                    return;
                }

                // 検索オーバーレイ表示中はリサイズしない（setSize(600,450)を上書きしないよう）
                if (isSearchOpen) return;

                // アップデートダイアログ表示中はリサイズしない（useUpdateCheckが制御済み）
                if (showUpdateDialog) return;

                if (settingsVisible) {
                    // セットアップ中 or 設定画面表示中 → モニタに合わせて大きく
                    const { width, height } = await calcSettingsWindowSize();
                    if (cancelled) {
                        debug('[WINDOW_SIZE] policy expand cancelled');
                        return;
                    }
                    debug(`[WINDOW_SIZE] policy expand request=${width}x${height}`);
                    await win.show();
                    await win.unminimize();
                    if (cancelled) {
                        debug('[WINDOW_SIZE] policy expand cancelled after show');
                        return;
                    }
                    await win.setSize(new LogicalSize(width, height));
                    await win.center();
                    await win.setFocus();
                    const actual = await win.outerSize();
                    debug(`[WINDOW_SIZE] policy expand actual=${actual.width}x${actual.height}`);
                } else if (!isCheckingSetup && !isSettingsOpen) {
                    // 通常のダッシュボード → 小さく表示
                    if (cancelled) {
                        debug('[WINDOW_SIZE] policy compact cancelled');
                        return;
                    }
                    debug('[WINDOW_SIZE] policy compact request=240x300');
                    await win.setSize(new LogicalSize(240, 300));
                    await win.center();
                    const actual = await win.outerSize();
                    debug(`[WINDOW_SIZE] policy compact actual=${actual.width}x${actual.height}`);
                }
            } catch (e) {
                console.error('[useMainWindowResizePolicy] failed:', e);
                debug(`[WINDOW_SIZE] policy error=${e instanceof Error ? e.message : String(e)}`);
            }
        };
        resize();
        return () => {
            cancelled = true;
        };
    }, [setupRequired, isSettingsOpen, isCheckingSetup, showUpdateDialog, isSearchOpen]);
}
