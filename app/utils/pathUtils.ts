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

