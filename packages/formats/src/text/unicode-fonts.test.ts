import { describe, expect, test } from 'vitest';

import { parseUnicodeFont, unicodeCharIsSet, unicodeGlyphFor } from './unicode-fonts';

function buildFont(): Uint8Array {
  const tableSize = 0x10000 * 4;
  const glyph = [3, -2, 8, 2] as const;
  const bits = [0b10100000, 0b01000000];
  const extra = 16;
  const bytes = new Uint8Array(tableSize + extra + glyph.length + bits.length);
  const view = new DataView(bytes.buffer);
  view.setInt32(0x41 * 4, tableSize + extra, true);
  view.setInt32(0x42 * 4, 0, true);
  bytes.set(glyph, tableSize + extra);
  bytes.set(bits, tableSize + extra + glyph.length);
  return bytes;
}

describe('parseUnicodeFont', () => {
  test('reads offsets, metrics, and 1bpp rows', () => {
    const font = parseUnicodeFont(buildFont());
    const glyph = unicodeGlyphFor(font, 0x41);
    expect(glyph).not.toBeNull();
    expect(glyph?.xOffset).toBe(3);
    expect(glyph?.yOffset).toBe(-2);
    expect(glyph?.width).toBe(8);
    expect(glyph?.height).toBe(2);
    expect(glyph?.bits.byteLength).toBe(2);
    expect(unicodeGlyphFor(font, 0x42)).toBeNull();
    expect(unicodeGlyphFor(font, 0x43)).toBeNull();
  });

  test('reads pixels most significant bit first', () => {
    const glyph = unicodeGlyphFor(parseUnicodeFont(buildFont()), 0x41);
    expect(glyph).not.toBeNull();
    if (!glyph) {
      return;
    }
    expect(unicodeCharIsSet(glyph, 0, 0)).toBe(true);
    expect(unicodeCharIsSet(glyph, 1, 0)).toBe(false);
    expect(unicodeCharIsSet(glyph, 2, 0)).toBe(true);
    expect(unicodeCharIsSet(glyph, 1, 1)).toBe(true);
    expect(unicodeCharIsSet(glyph, 7, 1)).toBe(false);
  });

  test('ignores offsets outside the file and empty glyphs', () => {
    const bytes = new Uint8Array(0x10000 * 4 + 8);
    const view = new DataView(bytes.buffer);
    view.setInt32(0x41 * 4, bytes.byteLength - 4 + 1, true);
    view.setInt32(0x42 * 4, bytes.byteLength - 8, true);
    const font = parseUnicodeFont(bytes);
    expect(unicodeGlyphFor(font, 0x41)).toBeNull();
    expect(unicodeGlyphFor(font, 0x42)?.width).toBe(0);
    expect(unicodeGlyphFor(font, 0x43)).toBeNull();
  });
});
