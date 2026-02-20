/**
 * 汎用ユーティリティ関数群
 *
 * 責務:
 * - CSSクラス名の結合 (clsx + tailwind-merge)
 * - UIコンポーネントで使用するヘルパー関数
 */

import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}