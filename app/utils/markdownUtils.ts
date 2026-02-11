/**
 * Markdown処理ユーティリティ
 *
 * このモジュールは、付箋アプリでのMarkdown表示に関する処理を提供します。
 * - パス解決（相対パス→絶対パス）
 * - リンク解析
 * - インラインスタイル（太字）解析
 * - 画像Markdown抽出
 */

/**
 * 相対パスを絶対パスに解決する（Windows対応）
 *
 * @param baseFile - 基準となるファイルの絶対パス
 * @param relativePath - 相対パス
 * @returns 絶対パス
 */
export function resolvePath(baseFile: string, relativePath: string): string {
    // 既に絶対パスまたはURLの場合はそのまま返す
    if (/^[a-zA-Z]:\\|^\\\\|^http/.test(relativePath)) {
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

/**
 * 画像Markdownを抽出する
 *
 * @param text - 解析対象のテキスト
 * @returns 画像情報の配列
 */
export function extractImageMarkdown(text: string): Array<{
    fullMatch: string;
    alt: string;
    url: string;
    scale?: number;
}> {
    const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const results: Array<{
        fullMatch: string;
        alt: string;
        url: string;
        scale?: number;
    }> = [];
    let match;

    while ((match = imgRegex.exec(text)) !== null) {
        const altRaw = match[1];
        const url = match[2];
        const altParts = altRaw.split('|');
        const alt = altParts[0];

        // スケール解析: ![alt|1.5](url) 形式
        let scale: number | undefined = undefined;
        if (altParts.length > 1) {
            const s = parseFloat(altParts[1]);
            if (!isNaN(s)) {
                scale = s;
            }
        }

        results.push({
            fullMatch: match[0],
            alt,
            url,
            scale
        });
    }

    return results;
}

/**
 * リンク・パス検出用の正規表現
 * - HTTP/HTTPS URL
 * - Windowsドライブパス（C:\...）
 * - UNCパス（\\Server\...）
 */
export const LINK_REGEX = /((?:https?:\/\/[^\s]+)|(?:[a-zA-Z]:\\[^:<>"\/?*|\r\n]+)|(?:\\\\[^:<>"\/?*|\r\n]+))/g;

/**
 * テキスト内のリンクやファイルパスを検出する
 *
 * @param text - 解析対象のテキスト
 * @returns リンク情報の配列
 */
export function extractLinks(text: string): Array<{
    text: string;
    start: number;
    end: number;
    isUrl: boolean;
}> {
    const links: Array<{
        text: string;
        start: number;
        end: number;
        isUrl: boolean;
    }> = [];

    const regex = new RegExp(LINK_REGEX);
    let match;

    while ((match = regex.exec(text)) !== null) {
        const linkText = match[0];
        const isUrl = /^https?:\/\//i.test(linkText);

        links.push({
            text: linkText,
            start: match.index,
            end: match.index + linkText.length,
            isUrl
        });
    }

    return links;
}
