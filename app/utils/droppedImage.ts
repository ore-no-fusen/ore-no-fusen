const SUPPORTED_DROPPED_IMAGE = /\.(?:png|jpe?g|gif|webp|bmp)$/i;

export function isSupportedDroppedImageFileName(fileName: string): boolean {
    return SUPPORTED_DROPPED_IMAGE.test(fileName);
}

export function appendDroppedImageMarkdown(body: string, savedPaths: readonly string[]): string {
    return insertDroppedImageMarkdown(body, savedPaths, body.length);
}

export function insertDroppedImageMarkdown(
    body: string,
    savedPaths: readonly string[],
    offset: number,
): string {
    if (savedPaths.length === 0) return body;
    const safeOffset = Math.min(Math.max(0, offset), body.length);
    const before = body.slice(0, safeOffset);
    const after = body.slice(safeOffset);
    const prefix = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
    const markdown = `${savedPaths.map((path) => `![image](${path})`).join('\n')}\n`;
    return `${before}${prefix}${markdown}${after}`;
}

export function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(reader.error ?? new Error('画像ファイルを読み込めませんでした。'));
        reader.readAsDataURL(file);
    });
}
