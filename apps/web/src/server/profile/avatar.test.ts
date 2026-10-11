import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { detectImageKind, normaliseAvatar } from './avatar';

describe('avatar processing', () => {
  it('recognises the three accepted formats by magic bytes', () => {
    expect(
      detectImageKind(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0])),
    ).toMatchObject({ ext: 'png' });
    expect(detectImageKind(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]))).toMatchObject({
      ext: 'jpg',
    });
    expect(
      detectImageKind(
        Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0]),
      ),
    ).toMatchObject({ ext: 'webp' });
    expect(detectImageKind(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it('decodes, crops and strips metadata into a 256px WebP', async () => {
    const input = await sharp({
      create: { width: 400, height: 200, channels: 3, background: '#2563eb' },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const output = await normaliseAvatar(input);
    const metadata = await sharp(output).metadata();

    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBe(256);
    expect(metadata.height).toBe(256);
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
  });

  it('rejects corrupt files even when magic bytes look allowed', async () => {
    const fakeJpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0x00, 0x01, 0x02]);
    await expect(normaliseAvatar(fakeJpeg)).rejects.toThrow();
  });
});
