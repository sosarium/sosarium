import type { ArtTile } from '../art/land';

export const HUE_COUNT = 3000;
export const HUES_PER_BLOCK = 8;
export const HUE_RECORD_SIZE = 88;
export const HUE_BLOCK_SIZE = 4 + HUES_PER_BLOCK * HUE_RECORD_SIZE;

export interface HueGroup {
  name: string;
  colors: Uint16Array;
  tableStart: number;
  tableEnd: number;
}

export interface HueFile {
  headers: number[];
  hues: HueGroup[];
}

function defaultHue(index: number): HueGroup {
  void index;
  return { name: 'Null', colors: new Uint16Array(32), tableStart: 0, tableEnd: 0 };
}

export function parseHues(bytes: Uint8Array): HueFile {
  if (bytes.byteLength < HUE_BLOCK_SIZE) {
    throw new Error(`not a hues.mul file: ${bytes.byteLength} bytes`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const blocks = Math.min(Math.floor(bytes.byteLength / HUE_BLOCK_SIZE), HUE_COUNT / HUES_PER_BLOCK);
  if (bytes.byteLength % HUE_BLOCK_SIZE !== 0 && blocks === 0) {
    throw new Error(`not a hues.mul file: ${bytes.byteLength} bytes`);
  }

  const headers: number[] = new Array(blocks);
  const hues: HueGroup[] = new Array(HUE_COUNT);

  let cursor = 0;
  for (let block = 0; block < blocks; block++) {
    headers[block] = view.getInt32(cursor, true);
    cursor += 4;
    for (let slot = 0; slot < HUES_PER_BLOCK; slot++) {
      const index = block * HUES_PER_BLOCK + slot;
      const colors = new Uint16Array(32);
      for (let i = 0; i < 32; i++) {
        const value = view.getUint16(cursor + i * 2, true);
        colors[i] = value === 0 || value > 0x7fff ? 1 : value;
      }
      const tableStart = view.getUint16(cursor + 64, true);
      const tableEnd = view.getUint16(cursor + 66, true);
      let name = '';
      for (let i = 0; i < 20; i++) {
        const byte = bytes[cursor + 68 + i] as number;
        if (byte === 0) {
          break;
        }
        name += String.fromCharCode(byte);
      }
      hues[index] = { name: name.replace(/\n/g, ' '), colors, tableStart, tableEnd };
      cursor += HUE_RECORD_SIZE;
    }
  }

  for (let index = blocks * HUES_PER_BLOCK; index < HUE_COUNT; index++) {
    hues[index] = defaultHue(index);
  }

  return { headers, hues };
}

export function serializeHues(file: HueFile): Uint8Array {
  const blocks = file.headers.length;
  const bytes = new Uint8Array(blocks * HUE_BLOCK_SIZE);
  const view = new DataView(bytes.buffer);

  let cursor = 0;
  for (let block = 0; block < blocks; block++) {
    view.setInt32(cursor, file.headers[block] ?? 0, true);
    cursor += 4;
    for (let slot = 0; slot < HUES_PER_BLOCK; slot++) {
      const hue = file.hues[block * HUES_PER_BLOCK + slot] ?? defaultHue(0);
      for (let i = 0; i < 32; i++) {
        view.setUint16(cursor + i * 2, (hue.colors[i] as number) & 0xffff, true);
      }
      view.setUint16(cursor + 64, hue.tableStart & 0xffff, true);
      view.setUint16(cursor + 66, hue.tableEnd & 0xffff, true);
      for (let i = 0; i < 20; i++) {
        bytes[cursor + 68 + i] = i < hue.name.length ? hue.name.charCodeAt(i) & 0xff : 0;
      }
      cursor += HUE_RECORD_SIZE;
    }
  }

  return bytes;
}

export function applyHue(tile: ArtTile, hue: HueGroup, onlyGrayPixels = false): ArtTile {
  const pixels = new Uint16Array(tile.pixels.length);
  for (let i = 0; i < tile.pixels.length; i++) {
    const value = tile.pixels[i] as number;
    if (value === 0) {
      continue;
    }
    const r = (value >> 10) & 0x1f;
    if (onlyGrayPixels) {
      const g = (value >> 5) & 0x1f;
      const b = value & 0x1f;
      if (r !== g || r !== b) {
        pixels[i] = value;
        continue;
      }
    }
    pixels[i] = ((hue.colors[r] as number) & 0x7fff) | 0x8000;
  }
  return { width: tile.width, height: tile.height, pixels };
}

export function expand5To8(value: number): number {
  return ((value & 0x1f) << 3) | ((value & 0x1f) >> 2);
}

export function hueColorToCss(color: number): string {
  const r = expand5To8((color >> 10) & 0x1f);
  const g = expand5To8((color >> 5) & 0x1f);
  const b = expand5To8(color & 0x1f);
  return `rgb(${r} ${g} ${b})`;
}

export function rgb8ToHue5(r: number, g: number, b: number): number {
  if ((r | g | b) === 0) {
    return 0;
  }
  const r5 = (r & 0xff) >> 3;
  const g5 = (g & 0xff) >> 3;
  const b5 = (b & 0xff) >> 3;
  if (r5 === 0 && g5 === 0 && b5 === 0) {
    return 1;
  }
  return (r5 << 10) | (g5 << 5) | b5;
}
