/**
 * パス操作ユーティリティ
 *
 * 責務:
 * - Windows/Unix パスの正規化（バックスラッシュの統一など）
 * - 大文字小文字を区別しないパス比較
 * - 末尾スラッシュの除去による一貫性確保
 */

/**
 * Normalize a file path for comparison
 * - Converts backslashes to forward slashes
 * - Converts to lowercase for case-insensitive comparison
 * - Removes trailing slashes
 * 
 * @param path - The path to normalize
 * @returns Normalized path
 */
export function normalizePath(path: string): string {
    let normalized = path.trim();
    normalized = normalized.normalize('NFC');
    normalized = normalized.replace(/\\/g, '/');
    normalized = normalized.toLowerCase();
    normalized = normalized.replace(/\/+/g, '/'); // Collapse multiple slashes
    normalized = normalized.replace(/\/$/, ''); // Remove trailing slashes
    return normalized;
}

/**
 * Compare two paths for equality
 * - Normalizes both paths before comparison
 * - Platform-independent comparison
 * 
 * @param path1 - First path
 * @param path2 - Second path
 * @returns true if paths are equal after normalization
 */
export function pathsEqual(path1: string, path2: string): boolean {
    return normalizePath(path1) === normalizePath(path2);
}

export function encodeNotePathForUrl(path: string): string {
    return encodeURIComponent(path);
}

export function decodeNotePathFromUrl(path: string): string {
    const decoded = path;
    if (/^[a-zA-Z]:\//.test(decoded)) {
        return decoded.replace(/\//g, '\\');
    }
    return decoded;
}

/**
 * 絶対パスまたは外部リソースかどうかを判定する
 * - Windows drive paths: C:\foo, C:/foo
 * - UNC paths: \\server\share, //server/share
 * - External URLs / data URIs
 */
export function isAbsoluteOrExternalPath(path: string): boolean {
    return /^(?:[a-zA-Z]:[\\/]|\\\\|\/\/|https?:\/\/|data:)/i.test(path);
}

/**
 * 本文中でクリック可能にするリンク対象を検出する正規表現を作る。
 * RegExp の lastIndex 共有を避けるため、利用箇所ごとに生成する。
 */
export function createLinkTargetRegex(): RegExp {
    return /((?:https?:\/\/[^\s]+)|(?:[a-zA-Z]:[\\/][^:<>"?*|\r\n]+)|(?:\\\\[^:<>"\/?*|\r\n]+))/g;
}

/**
 * 文字列全体がクリック可能リンク対象かどうかを判定する。
 */
export function isLinkTarget(text: string): boolean {
    return /^(?:https?:\/\/[^\s]+)$|^(?:[a-zA-Z]:[\\/][^:<>"?*|\r\n]+)$|^(?:\\\\[^:<>"\/?*|\r\n]+)$/.test(text);
}

/**
 * パスからファイル名を取得する
 * Windows / Unix 両対応
 * 
 * @param path - ファイルパス
 * @returns ファイル名
 */
export function getFileName(path: string): string {
    return path.split(/[\\/]/).pop() || path;
}
