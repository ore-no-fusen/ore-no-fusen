import { describe, expect, it } from 'vitest';
import { calculateSharePayloadHash, type ShareHashInput } from './web-share-payload-hash';

const vector: ShareHashInput = {
  accountSubject: 'acct-1',
  noteId: 'note-1',
  generation: 4,
  kind: 'edit',
  parents: ['root-x'],
  resolvedIds: [],
  payload: { title: 'Title', markdown: 'Body', images: [] },
};

describe('calculateSharePayloadHash', () => {
  it('Rustと共有する固定ベクトルを返す', async () => {
    await expect(calculateSharePayloadHash(vector)).resolves.toBe(
      'cd61431fd0c445347a2aa80ea31f7c4480f28c52bef9285238851ac6f54fd742',
    );
  });

  it('親・解決先・画像の順序差を正規化する', async () => {
    const imageA = { imageId: '画像-A', mimeType: 'image/png', sizeBytes: 1, sha256: 'a'.repeat(64) };
    const imageB = { imageId: 'image-B', mimeType: 'image/jpeg', sizeBytes: 2, sha256: 'b'.repeat(64) };
    const first = {
      ...vector,
      kind: 'resolve' as const,
      parents: ['親-B', '親-A'],
      resolvedIds: ['親-B', '親-A'],
      payload: { ...vector.payload, images: [imageA, imageB] },
    };
    const reordered = {
      ...first,
      parents: [...first.parents].reverse(),
      resolvedIds: [...first.resolvedIds].reverse(),
      payload: { ...first.payload, images: [...first.payload.images].reverse() },
    };
    await expect(calculateSharePayloadHash(reordered)).resolves.toBe(await calculateSharePayloadHash(first));
  });

  it('壊れたmanifestとu32範囲外を拒否する', async () => {
    await expect(calculateSharePayloadHash({
      ...vector,
      payload: { ...vector.payload, images: [{ imageId: 'x', mimeType: 'image/png', sizeBytes: 1, sha256: 'A'.repeat(64) }] },
    })).rejects.toThrow('Invalid image manifest');
    await expect(calculateSharePayloadHash({ ...vector, generation: 4_294_967_296 })).rejects.toThrow('generation must be a u32');
  });

  it('壊れたUTF-16は拒否し、正しい絵文字は受け入れる', async () => {
    await expect(calculateSharePayloadHash({
      ...vector,
      payload: { ...vector.payload, markdown: '\uD800' },
    })).rejects.toThrow('markdown contains invalid UTF-16');
    await expect(calculateSharePayloadHash({
      ...vector,
      payload: { ...vector.payload, markdown: '\uDC00' },
    })).rejects.toThrow('markdown contains invalid UTF-16');
    await expect(calculateSharePayloadHash({
      ...vector,
      payload: { ...vector.payload, markdown: '絵文字 😀' },
    })).resolves.toMatch(/^[0-9a-f]{64}$/);
  });
});
