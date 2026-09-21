export const MAX_FEEDBACK_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_FEEDBACK_IMAGE_COUNT = 3;
export const MAX_FEEDBACK_IMAGE_EDGE = 2048;
const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);

export function assertFeedbackImages(files: File[]): void {
  if (files.length === 0 || files.length > MAX_FEEDBACK_IMAGE_COUNT) throw new Error('Invalid image count');
  for (const file of files) {
    if (!allowedTypes.has(file.type) || file.size < 1 || file.size > MAX_FEEDBACK_IMAGE_BYTES) {
      throw new Error('Invalid image file');
    }
  }
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error('Image compression failed')),
    'image/webp', quality,
  ));
}

export async function compressFeedbackImage(file: File): Promise<File> {
  assertFeedbackImages([file]);
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width < 1 || bitmap.height < 1 || bitmap.width * bitmap.height > 40_000_000) {
      throw new Error('Invalid image dimensions');
    }
    const scale = Math.min(1, MAX_FEEDBACK_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image compression unavailable');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const compressed = await canvasBlob(canvas, 0.88);
    if (scale === 1 && compressed.size >= file.size) return file;
    const stem = file.name.replace(/\.[^.]+$/, '') || 'image';
    return new File([compressed], `${stem}.webp`, { type: 'image/webp', lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}
