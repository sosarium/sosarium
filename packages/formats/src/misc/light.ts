export interface LightEntry {
  width: number;
  height: number;
  pixels: Uint16Array;
}

export function decodeLight(bytes: Uint8Array, extra: number): LightEntry | null {
  const width = extra & 0xffff;
  const height = (extra >>> 16) & 0xffff;
  if (width === 0 || height === 0 || bytes.byteLength < width * height) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pixels = new Uint16Array(width * height);
  for (let i = 0; i < pixels.length; i++) {
    const value = view.getInt8(i);
    const level = 0x1f + value;
    pixels[i] = ((level << 10) + (level << 5) + level) & 0xffff;
  }
  return { width, height, pixels };
}
