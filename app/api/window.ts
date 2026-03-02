/**
 * ウィンドウ操作API (Tauri Wrapper)
 *
 * 責務:
 * - ウィンドウの座標・サイズ・フォーカス管理
 * - DPIスケーリングを考慮した座標変換 (物理⇔論理)
 */

import { getCurrentWindow } from '@tauri-apps/api/window';

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

