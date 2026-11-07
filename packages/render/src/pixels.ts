export function pixelsToRgba(pixels: Uint16Array): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(pixels.length * 4);
  for (let i = 0; i < pixels.length; i++) {
    const value = pixels[i] as number;
    const offset = i * 4;
    rgba[offset] = ((value >> 10) & 0x1f) << 3;
    rgba[offset + 1] = ((value >> 5) & 0x1f) << 3;
    rgba[offset + 2] = (value & 0x1f) << 3;
    rgba[offset + 3] = value & 0x8000 ? 255 : 0;
  }
  return rgba;
}

export function rgb555ToRgba(pixels: Uint16Array): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(pixels.length * 4);
  for (let i = 0; i < pixels.length; i++) {
    const value = pixels[i] as number;
    const offset = i * 4;
    rgba[offset] = ((value >> 10) & 0x1f) << 3;
    rgba[offset + 1] = ((value >> 5) & 0x1f) << 3;
    rgba[offset + 2] = (value & 0x1f) << 3;
    rgba[offset + 3] = 255;
  }
  return rgba;
}

export function rgbaToPixels(rgba: Uint8ClampedArray | Uint8Array): Uint16Array {
  const count = Math.floor(rgba.length / 4);
  const pixels = new Uint16Array(count);
  for (let i = 0; i < count; i++) {
    const offset = i * 4;
    const alpha = rgba[offset + 3] as number;
    if (alpha < 128) {
      continue;
    }
    const r = (rgba[offset] as number) >> 3;
    const g = (rgba[offset + 1] as number) >> 3;
    const b = (rgba[offset + 2] as number) >> 3;
    pixels[i] = 0x8000 | (r << 10) | (g << 5) | b;
  }
  return pixels;
}
