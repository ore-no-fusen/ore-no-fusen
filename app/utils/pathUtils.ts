/**
 * Path normalization utilities for Windows/Unix compatibility
 * 
 * Windows uses backslash (\) while Unix uses forward slash (/)
 * This utility ensures consistent path comparison across platforms
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
    return path
        .replace(/\\/g, '/')
        .toLowerCase()
        .replace(/\/+$/, ''); // Remove trailing slashes
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

/**
 * Check if a path is in a list of paths
 * - Uses normalized path comparison
 * 
 * @param path - Path to check
 * @param pathList - List of paths
 * @returns true if path is in the list
 */
export function pathInList(path: string, pathList: string[]): boolean {
    const normalizedPath = normalizePath(path);
    return pathList.some(p => normalizePath(p) === normalizedPath);
}
