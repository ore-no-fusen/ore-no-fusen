
/**
 * splitFrontMatter: フロントマターと本文を分離するユーティリティ関数
 * 
 * 重要な仕様：
 * 1. フロントマターは先頭の `---` と最初の閉じ `---` で囲まれた部分
 * 2. 閉じ `---` は front に含まれなければならない（これが壊れるとデータ破損）
 * 3. 本文中に `---` があっても、フロントマターとして誤認しない
 */
export function splitFrontMatter(src: string) {
    // 先頭の空白やBOMを除去してからチェック
    const trimmedSrc = src.replace(/^\uFEFF/, '').trimStart();
    if (!trimmedSrc.startsWith('---')) return { front: '', body: src };

    // 元の文字列で位置を計算
    const firstFenceIndex = src.indexOf('---');
    if (firstFenceIndex === -1) return { front: '', body: src };

    // Skip the first '---'
    const nextFence = src.indexOf('---', firstFenceIndex + 3);
    if (nextFence === -1) return { front: '', body: src };

    // 閉じ `---` を含むようにする (nextFence + 3)
    const closingFenceEnd = nextFence + 3;
    const front = src.slice(firstFenceIndex, closingFenceEnd);

    // Find the end of '---' and potential trailing newline
    let bodyStart = closingFenceEnd;
    if (src[bodyStart] === '\n') bodyStart += 1;
    else if (src[bodyStart] === '\r' && src[bodyStart + 1] === '\n') bodyStart += 2;

    const body = src.slice(bodyStart).replace(/^\s+/, '');
    return { front, body };
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
