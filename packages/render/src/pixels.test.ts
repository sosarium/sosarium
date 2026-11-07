import { describe, expect, it } from 'vitest';

import { pixelsToRgba, rgb555ToRgba, rgbaToPixels } from './pixels';

describe('pixelsToRgba', () => {
  it('converts opaque and transparent A1R5G5B5 values', () => {
    const pixels = new Uint16Array([0x8000, 0x7fff, 0x0000, 0xfc00]);
    const rgba = pixelsToRgba(pixels);
    expect(Array.from(rgba)).toEqual([0, 0, 0, 255, 248, 248, 248, 0, 0, 0, 0, 0, 248, 0, 0, 255]);
  });

  it('round-trips through rgbaToPixels for quantized colors', () => {
    const pixels = new Uint16Array([0x83e0, 0x8001, 0xffff, 0x0000]);
    const roundTripped = rgbaToPixels(pixelsToRgba(pixels));
    for (let i = 0; i < pixels.length; i++) {
      expect(roundTripped[i]).toBe(pixels[i]);
    }
  });

  it('maps alpha below 128 to transparent', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 127, 255, 0, 0, 128]);
    const pixels = rgbaToPixels(rgba);
    expect(pixels[0]).toBe(0);
    expect(pixels[1]).toBe(0x8000 | (31 << 10));
  });
});

describe('rgb555ToRgba', () => {
  it('treats colors without an alpha bit as opaque', () => {
    const rgba = rgb555ToRgba(new Uint16Array([0x1502, 0x8000 | 0x1502, 0]));
    expect(Array.from(rgba.slice(0, 4))).toEqual([40, 64, 16, 255]);
    expect(Array.from(rgba.slice(4, 8))).toEqual([40, 64, 16, 255]);
    expect(Array.from(rgba.slice(8, 12))).toEqual([0, 0, 0, 255]);
  });
});
