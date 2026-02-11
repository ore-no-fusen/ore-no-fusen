/**
 * スクリーンキャプチャ機能カスタムHook
 *
 * 責務:
 * - キャプチャ実行
 * - ウィンドウ制御（hide/show）
 * - 画像パス解決（相対パス変換）
 * - Markdown挿入
 */

import { useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

export type UseScreenCaptureOptions = {
    currentFilePath: string | null;
    noteSeq: number;
    onInsertMarkdown: (markdown: string) => void;
};

export type UseScreenCaptureReturn = {
    isCapturing: boolean;
    captureScreen: () => Promise<void>;
};

export function useScreenCapture({
    currentFilePath,
    noteSeq,
    onInsertMarkdown
}: UseScreenCaptureOptions): UseScreenCaptureReturn {
    const isCapturingRef = useRef(false);

    /**
     * スクリーンキャプチャを実行する
     */
    const captureScreen = useCallback(async () => {
        if (isCapturingRef.current) {
            console.log('[useScreenCapture] Already capturing, skipping');
            return;
        }

        try {
            isCapturingRef.current = true;
            console.log('[useScreenCapture] Starting capture flow');

            const currentWin = getCurrentWindow();

            // アクティブな要素からフォーカスを外す
            if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
            }

            // ウィンドウを隠す
            console.log('[useScreenCapture] Hiding window...');
            await currentWin.hide();

            // アニメーション完了を待つ
            await new Promise(resolve => setTimeout(resolve, 300));

            // キャプチャ実行（タイムアウト30秒）
            console.log('[useScreenCapture] Invoking backend capture, seq:', noteSeq);
            const capturePromise = invoke<string>('fusen_capture_screen', { noteSeq });
            const timeoutPromise = new Promise<string>((_, reject) =>
                setTimeout(() => reject(new Error('Capture timed out (30s)')), 30000)
            );

            const imagePath = await Promise.race([capturePromise, timeoutPromise]);
            console.log('[useScreenCapture] Backend returned image path:', imagePath);

            // ウィンドウを表示
            console.log('[useScreenCapture] Showing window again...');
            await currentWin.show();
            await currentWin.setFocus();

            // フォーカス復帰を待つ
            await new Promise(r => setTimeout(r, 400));

            // 相対パスに変換
            let storedPath = imagePath;
            if (currentFilePath) {
                const lastSlash = Math.max(
                    currentFilePath.lastIndexOf('\\'),
                    currentFilePath.lastIndexOf('/')
                );
                const currentDir = lastSlash >= 0 ? currentFilePath.substring(0, lastSlash) : '';

                const normImagePath = imagePath.replace(/\//g, '\\');
                const normCurrentDir = currentDir.replace(/\//g, '\\');

                if (normImagePath.startsWith(normCurrentDir)) {
                    let rel = normImagePath.substring(normCurrentDir.length);
                    if (rel.startsWith('\\')) rel = rel.substring(1);
                    storedPath = rel.replace(/\\/g, '/');
                }
            }

            console.log('[useScreenCapture] Relative path for markdown:', storedPath);

            // Markdown生成
            const filename = imagePath.split('\\').pop() || 'screenshot';
            const imageMarkdown = `\n![${filename}](${storedPath})\n`;

            console.log('[useScreenCapture] Markdown to insert:', imageMarkdown);
            onInsertMarkdown(imageMarkdown);
        } catch (e) {
            console.error('[useScreenCapture] Capture failed:', e);
            // エラー時もウィンドウを表示
            await getCurrentWindow().show();
            throw e;
        } finally {
            isCapturingRef.current = false;
            console.log('[useScreenCapture] Capture flow completed');
        }
    }, [currentFilePath, noteSeq, onInsertMarkdown]);

    return {
        isCapturing: isCapturingRef.current,
        captureScreen
    };
}
