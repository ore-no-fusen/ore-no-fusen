export type AnnotationImageSource = {
    blobUrl: string;
    revoke: () => void;
};

/**
 * Load an annotation source through fetch and expose it only as a same-origin
 * blob URL. This deliberately has no asset:// fallback: falling back to the
 * original Tauri asset URL can taint the Konva canvas and make PNG export
 * unsafe.
 */
export async function loadAnnotationImageSource(displayUrl: string): Promise<AnnotationImageSource> {
    const response = await fetch(displayUrl);
    if (!response.ok) {
        throw new Error(`画像を読み込めませんでした (${response.status})`);
    }

    const blob = await response.blob();
    if (blob.size === 0) {
        throw new Error('画像データが空です');
    }

    const blobUrl = URL.createObjectURL(blob);
    return {
        blobUrl,
        revoke: () => URL.revokeObjectURL(blobUrl),
    };
}
