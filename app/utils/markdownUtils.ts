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

function resolvePathFromDirectory(baseDir: string, relativePath: string): string {
    const normalizedBaseDir = baseDir.replace(/[\\/]+$/, '');
    return `${normalizedBaseDir}/${relativePath}`.replace(/\//g, '\\').replace(/\\\\+/g, '\\');
}

export function buildImagePathCandidates(baseFile: string, relativePath: string, basePath?: string | null): string[] {
    if (isAbsoluteOrExternalPath(relativePath)) {
        return [relativePath];
    }

    const candidates = [resolvePath(baseFile, relativePath)];
    if (basePath) {
        candidates.push(resolvePathFromDirectory(basePath, relativePath));
    }

    return Array.from(new Set(candidates));
}

const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*\]\([^)]+\)/g;
const MARKDOWN_IMAGE_AT_START_PATTERN = /^!\[[^\]]*\]\([^)]+\)/;

/** 折りたたみ時、先頭が画像なら画像の存在と直後の識別用テキストを1行にまとめる。 */
export function buildFoldedPreview(content: string): string {
    const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const firstLine = lines[0];
    if (!firstLine || !MARKDOWN_IMAGE_AT_START_PATTERN.test(firstLine)) {
        return content;
    }

    for (const line of lines) {
        const text = line.replace(MARKDOWN_IMAGE_PATTERN, '').trim();
        if (text) {
            return `[画像] ${text}`;
        }
    }

    return '[画像]';
}
