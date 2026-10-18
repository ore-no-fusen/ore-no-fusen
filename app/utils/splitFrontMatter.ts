/**
 * FrontMatter分離ユーティリティ
 *
 * 責務:
 * - 文字列からのYAMLフロントマター分離
 * - データ破損防止（閉じタグの確実な検出）
 * - フロントマター値の更新
 */

/**
 * splitFrontMatter: フロントマターと本文を分離するユーティリティ関数
 * 
 * 重要な仕様：
 * 1. フロントマターは先頭の `---` と最初の閉じ `---` で囲まれた部分
 * 2. 閉じ `---` は front に含まれなければならない（これが壊れるとデータ破損）
 * 3. 本文中に `---` があっても、フロントマターとして誤認しない
 */
export function splitFrontMatter(src: string) {
    const firstFenceIndex = src.indexOf('---');
    if (firstFenceIndex === -1 || src.slice(0, firstFenceIndex).replace(/\uFEFF/g, '').trim() !== '') {
        return { front: '', body: src };
    }
    const firstLineEnd = src.indexOf('\n', firstFenceIndex);
    const openingLine = src.slice(firstFenceIndex, firstLineEnd === -1 ? src.length : firstLineEnd).replace(/\r$/, '');
    if (openingLine !== '---') return { front: '', body: src };

    let offset = firstLineEnd === -1 ? src.length : firstLineEnd + 1;
    let closeStart = -1;
    let closeEnd = -1;
    for (const line of src.slice(offset).split(/(?<=\n)/)) {
        const lineEnd = offset + line.length;
        const value = line.replace(/\r?\n$/, '').replace(/\r$/, '');
        if (value === '---') {
            closeStart = offset;
            closeEnd = lineEnd;
            break;
        }
        offset = lineEnd;
    }
    if (closeStart === -1) return { front: '', body: src };

    const front = src.slice(firstFenceIndex, closeStart + 3);
    const body = src.slice(closeEnd);
    // Rust側の保存形式（frontmatter + 空行 + 本文）に合わせ、区切りの空行を本文に含めない。
    // 同期済み付箋でも同じ境界に揃えないと、通常保存のたびに先頭改行が増える。
    return { front, body: body.replace(/^\s+/, '') };
}

/**
 * フロントマター内の特定のキーの値を更新する
 * 単純な正規表現による置換を行う
 */
export function updateFrontmatterValue(frontmatter: string, key: string, value: any): string {
    const keyPattern = new RegExp(`^${key}:\\s*(.*)$`, 'm');
    const match = frontmatter.match(keyPattern);

    if (match) {
        return frontmatter.replace(keyPattern, `${key}: ${value}`);
    } else {
        // キーがない場合は、閉じ --- の前に追加する
        const closingFenceIndex = frontmatter.lastIndexOf('---');
        if (closingFenceIndex > 3) {
            return frontmatter.slice(0, closingFenceIndex) + `${key}: ${value}\n` + frontmatter.slice(closingFenceIndex);
        }
        return frontmatter;
    }
}
/**
 * フロントマターから特定のキーを削除する
 */
export function removeFrontmatterKey(frontmatter: string, key: string): string {
    // \s* allows for indentation. \r? handles Windows CRLF.
    const keyPattern = new RegExp(`^\\s*${key}:.*$\\r?\\n?`, 'gm');
    return frontmatter.replace(keyPattern, '');
}

/**
 * フロントマターのgeometry情報を更新する
 */
export function updateFrontmatterGeometry(
    front: string,
    geom: { x?: number; y?: number; width?: number; height?: number }
): string {
    let newFront = front;

    if (
        geom.x !== undefined &&
        geom.y !== undefined &&
        geom.width !== undefined &&
        geom.height !== undefined
    ) {
        const val = `{ x: ${Math.round(geom.x)}, y: ${Math.round(geom.y)}, width: ${Math.round(geom.width)}, height: ${Math.round(geom.height)} }`;
        newFront = updateFrontmatterValue(newFront, 'window', val);

        // レガシーフィールドのクリーンアップ
        newFront = removeFrontmatterKey(newFront, 'rect');
        newFront = removeFrontmatterKey(newFront, 'x');
        newFront = removeFrontmatterKey(newFront, 'y');
        newFront = removeFrontmatterKey(newFront, 'width');
        newFront = removeFrontmatterKey(newFront, 'height');
        newFront = removeFrontmatterKey(newFront, 'fontFamily');
        newFront = removeFrontmatterKey(newFront, 'lineHeight');
        newFront = removeFrontmatterKey(newFront, 'context');
    }

    return newFront;
}
