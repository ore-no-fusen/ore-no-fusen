import type { FileAttachment, DraftFileAttachment } from './types';

export function buildFileName(): string {
  return `fusen_file_${Date.now()}_${crypto.randomUUID()}`;
}

export function fileMetadata(file: DraftFileAttachment): FileAttachment {
  return { fileName: file.fileName, originalFileName: file.originalFileName, mimeType: file.mimeType, size: file.size };
}

// ArrayBuffers survive iOS IndexedDB serialization; metadata alone represents sent files.
export async function serializeFiles(files: DraftFileAttachment[]) {
  return Promise.all(files.map(async (file) => ({
    ...fileMetadata(file),
    ...(file.blob ? { data: await file.blob.arrayBuffer() } : {}),
  })));
}

export function deserializeFiles(files: Array<FileAttachment & { data?: ArrayBuffer; blob?: Blob }> = []): DraftFileAttachment[] {
  return files.map(({ data, blob, ...meta }) => ({
    ...meta,
    ...(data instanceof ArrayBuffer ? { blob: new Blob([data], { type: meta.mimeType }) } : blob ? { blob } : {}),
  }));
}
