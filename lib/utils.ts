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

/**
 * Markdown の1行目をタイトル、残りをbodyとして分離する。
 * 1行目の # プレフィックスは除去する。
 */
export function extractTitleBody(text: string): { title: string; body: string } {
  const lines = text.split('\n');
  const firstLine = lines[0].replace(/^#\s*/, '').trim();
  const rest = lines.slice(1).join('\n').replace(/^\n+/, '');
  return { title: firstLine, body: rest };
}