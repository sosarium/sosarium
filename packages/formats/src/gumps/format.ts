import type { ArtTile } from '../art/land';

export function decodeGumpPayload(payload: Uint8Array, width: number, height: number): ArtTile | null {
  if (width <= 0 || height <= 0 || width > 4096 || height > 4096) {
    return null;
  }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const ushorts = payload.byteLength >> 1;
  if (ushorts < height * 2) {
    throw new RangeError(`gump payload too small: ${payload.byteLength} bytes for ${width}x${height}`);
  }

  const pixels = new Uint16Array(width * height);

  for (let y = 0; y < height; y++) {
    let count = view.getUint32(y * 4, true) * 2;
    let cur = y * width;
    const lineEnd = cur + width;

    while (cur < lineEnd) {
      if (count + 1 >= ushorts) {
        throw new RangeError(`gump row ${y} reads past the payload`);
      }
      const color = view.getUint16(count * 2, true);
      const run = view.getUint16(count * 2 + 2, true);
      count += 2;

      const next = Math.min(cur + run, lineEnd);
      if (color !== 0) {
        const value = color ^ 0x8000;
        while (cur < next) {
          pixels[cur++] = value;
        }
      } else {
        cur = next;
      }
      if (run === 0) {
        break;
      }
    }
  }

  return { width, height, pixels };
}

export function encodeGumpPayload(tile: ArtTile): Uint8Array {
  const { width, height, pixels } = tile;
  if (width <= 0 || height <= 0 || width > 4096 || height > 4096) {
    throw new Error(`invalid gump dimensions ${width}x${height}`);
  }
  if (pixels.length < width * height) {
    throw new Error(`pixel buffer too small: ${pixels.length} for ${width}x${height}`);
  }

  const body: number[] = [];
  const offsets: number[] = new Array(height);

  for (let y = 0; y < height; y++) {
    offsets[y] = body.length * 2;
    const line = y * width;
    let x = 0;
    while (x < width) {
      const color = pixels[line + x] as number;
      let run = 1;
      while (x + run < width && (pixels[line + x + run] as number) === color) {
        run++;
      }
      body.push(color === 0 ? 0 : color ^ 0x8000, run);
      x += run;
    }
  }

  const tableBytes = height * 4;
  const bytes = new Uint8Array(tableBytes + body.length * 2);
  const view = new DataView(bytes.buffer);
  for (let y = 0; y < height; y++) {
    view.setUint32(y * 4, ((tableBytes + (offsets[y] as number)) / 4) >>> 0, true);
  }
  for (let i = 0; i < body.length; i++) {
    view.setUint16(tableBytes + i * 2, body[i] as number, true);
  }
  return bytes;
}

export function decodeUopGumpEntry(payload: Uint8Array): ArtTile | null {
  if (payload.byteLength < 8) {
    return null;
  }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const width = view.getUint32(0, true);
  const height = view.getUint32(4, true);
  return decodeGumpPayload(payload.subarray(8), width, height);
}

export function encodeUopGumpEntry(tile: ArtTile): Uint8Array {
  const body = encodeGumpPayload(tile);
  const bytes = new Uint8Array(8 + body.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, tile.width, true);
  view.setUint32(4, tile.height, true);
  bytes.set(body, 8);
  return bytes;
}

export function gumpDimensions(extra: number): { width: number; height: number } {
  return { width: (extra >>> 16) & 0xffff, height: extra & 0xffff };
}

export function gumpExtra(width: number, height: number): number {
  return ((width & 0xffff) << 16) | (height & 0xffff);
}
