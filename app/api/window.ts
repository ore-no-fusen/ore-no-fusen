/**
 * ウィンドウ操作のTauri API呼び出しをラップ
 *
 * このモジュールは、付箋ウィンドウの座標・サイズ管理を提供します。
 * DPI対応のため、物理座標と論理座標の変換を行います。
 */

import { getCurrentWindow } from '@tauri-apps/api/window';
import { PhysicalSize } from '@tauri-apps/api/dpi';

/**
 * ウィンドウ座標・サイズの型定義（論理座標）
 */
export type WindowGeometry = {
    x: number;
    y: number;
    width: number;
    height: number;
};

/**
 * ウィンドウの座標とサイズを取得する（論理座標）
 *
 * DPIスケールファクターを考慮して、物理座標を論理座標に変換します。
 * これにより、異なるDPI環境でも一貫した座標管理が可能になります。
 *
 * @returns 論理座標でのウィンドウ座標・サイズ
 */
export async function getWindowGeometry(): Promise<WindowGeometry> {
    const win = getCurrentWindow();
    const physPos = await win.outerPosition();
    const physSize = await win.innerSize();
    const factor = await win.scaleFactor();

    // 物理座標を論理座標に変換（Physical / ScaleFactor）
    return {
        x: Math.round(physPos.x / factor),
        y: Math.round(physPos.y / factor),
        width: Math.round(physSize.width / factor),
        height: Math.round(physSize.height / factor)
    };
}

/**
 * ウィンドウのサイズを設定する
 *
 * @param width - 幅（論理座標）
 * @param height - 高さ（論理座標）
 */
export async function setWindowSize(width: number, height: number): Promise<void> {
    const win = getCurrentWindow();
    const factor = await win.scaleFactor();

    // 論理座標を物理座標に変換
    const physicalWidth = Math.round(width * factor);
    const physicalHeight = Math.round(height * factor);

    await win.setSize(new PhysicalSize(physicalWidth, physicalHeight));
}

/**
 * ウィンドウを非表示にする
 */
export async function hideWindow(): Promise<void> {
    await getCurrentWindow().hide();
}

/**
 * ウィンドウを表示する
 */
export async function showWindow(): Promise<void> {
    await getCurrentWindow().show();
}

/**
 * ウィンドウにフォーカスを設定する
 */
export async function focusWindow(): Promise<void> {
    const win = getCurrentWindow();
    await win.setFocus();
}
