/**
 * Markdown処理ユーティリティ
 *
 * 責務:
 * - パス解決（相対パス→絶対パス）
 * - リンク解析と検出
 * - 画像Markdownの抽出と解析
 */

import { isAbsoluteOrExternalPath } from './pathUtils';

/**
 * 相対パスを絶対パスに解決する（Windows対応）
 *
 * @param baseFile - 基準となるファイルの絶対パス
 * @param relativePath - 相対パス
 * @returns 絶対パス
 */
export function resolvePath(baseFile: string, relativePath: string): string {
    // 既に絶対パスまたはURLの場合はそのまま返す
    if (isAbsoluteOrExternalPath(relativePath)) {
        return relativePath;
    }

    // ベースファイルからディレクトリを抽出（\と/の両方に対応）
    const lastSlash = Math.max(
        baseFile.lastIndexOf('\\'),
        baseFile.lastIndexOf('/')
    );
    const baseDir = lastSlash >= 0 ? baseFile.substring(0, lastSlash) : '';

    // パスを結合し、バックスラッシュに統一
    const combined = `${baseDir}/${relativePath}`.replace(/\//g, '\\');

    // 連続したバックスラッシュを1つにまとめる
    const absPath = combined.replace(/\\\\+/g, '\\');

    // UNC パス（\\Server\Share）の場合は先頭の\\を保持
    if (combined.startsWith('\\\\')) {
        return '\\\\' + absPath.substring(1).replace(/\\+/g, '\\');
    }

    return absPath;
}

