export type ImageCrop = { x: number; y: number; width: number; height: number };

export function selectedImageCrop(start: { x: number; y: number }, end: { x: number; y: number }, width: number, height: number): ImageCrop | null {
    const left = Math.max(0, Math.min(width, Math.min(start.x, end.x)));
    const top = Math.max(0, Math.min(height, Math.min(start.y, end.y)));
    const right = Math.max(0, Math.min(width, Math.max(start.x, end.x)));
    const bottom = Math.max(0, Math.min(height, Math.max(start.y, end.y)));
    return right - left >= 2 && bottom - top >= 2 ? { x: left, y: top, width: right - left, height: bottom - top } : null;
}

export function cropToOriginal(crop: ImageCrop, stage: { w: number; h: number }, image: { w: number; h: number }): ImageCrop {
    const x = Math.floor(crop.x * image.w / stage.w);
    const y = Math.floor(crop.y * image.h / stage.h);
    const right = Math.min(image.w, Math.ceil((crop.x + crop.width) * image.w / stage.w));
    const bottom = Math.min(image.h, Math.ceil((crop.y + crop.height) * image.h / stage.h));
    return { x, y, width: right - x, height: bottom - y };
}
