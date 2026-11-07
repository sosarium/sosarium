import type { ArtTile } from './land';

export function decodeStaticArt(bytes: Uint8Array): ArtTile | null {
  if (bytes.byteLength < 8) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ushorts = bytes.byteLength >> 1;
  const read = (index: number): number => {
    if (index >= ushorts) {
      throw new RangeError(`static art read past end at ushort ${index}`);
    }
    return view.getUint16(index * 2, true);
  };

  let cursor = 2;
  const width = read(cursor++);
  const height = read(cursor++);
  if (width <= 0 || height <= 0 || width > 2048 || height > 2048) {
    return null;
  }

  const start = height + 4;
  const lookups: number[] = new Array(height);
  for (let i = 0; i < height; i++) {
    lookups[i] = start + read(cursor++);
  }

  const pixels = new Uint16Array(width * height);

  for (let y = 0; y < height; y++) {
    let position = lookups[y] as number;
    let current = y * width;
    const lineEnd = current + width;

    for (;;) {
      const xOffset = read(position++);
      const xRun = read(position++);
      if (xOffset + xRun === 0) {
        break;
      }
      if (xOffset > width) {
        break;
      }
      current += xOffset;
      if (xOffset + xRun > width) {
        break;
      }
      const end = current + xRun;
      while (current < end && current < lineEnd) {
        pixels[current++] = read(position++) ^ 0x8000;
      }
    }
  }

  return { width, height, pixels };
}

export function encodeStaticArt(tile: ArtTile): Uint8Array {
  const { width, height, pixels } = tile;
  if (width <= 0 || height <= 0 || width > 2048 || height > 2048) {
    throw new Error(`invalid static art dimensions ${width}x${height}`);
  }
  if (pixels.length < width * height) {
    throw new Error(`pixel buffer too small: ${pixels.length} for ${width}x${height}`);
  }

  const headerBytes = 8 + height * 2;
  const body: number[] = [];
  const offsets: number[] = new Array(height);

  for (let y = 0; y < height; y++) {
    offsets[y] = body.length;
    const line = y * width;
    let x = 0;
    while (x < width) {
      let i = x;
      while (i < width && !((pixels[line + i] as number) & 0x8000)) {
        i++;
      }
      if (i >= width) {
        break;
      }
      let j = i + 1;
      while (j < width && (pixels[line + j] as number) & 0x8000) {
        j++;
      }
      body.push(i - x, j - i);
      for (let p = i; p < j; p++) {
        body.push((pixels[line + p] as number) ^ 0x8000);
      }
      x = j;
    }
    body.push(0, 0);
  }

  const totalBytes = headerBytes + body.length * 2;
  const bytes = new Uint8Array(totalBytes);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 1234, true);
  view.setUint16(4, width, true);
  view.setUint16(6, height, true);

  for (let y = 0; y < height; y++) {
    view.setUint16(8 + y * 2, offsets[y] as number, true);
  }
  for (let i = 0; i < body.length; i++) {
    view.setUint16(headerBytes + i * 2, body[i] as number, true);
  }

  return bytes;
}
