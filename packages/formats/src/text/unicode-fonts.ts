export const UNICODE_CHAR_COUNT = 0x10000;

export const UNICODE_FONT_FILES = [
  'unifont.mul',
  'unifont1.mul',
  'unifont2.mul',
  'unifont3.mul',
  'unifont4.mul',
  'unifont5.mul',
  'unifont6.mul',
  'unifont7.mul',
  'unifont8.mul',
  'unifont9.mul',
  'unifont10.mul',
  'unifont11.mul',
  'unifont12.mul'
] as const;

export interface UnicodeGlyph {
  xOffset: number;
  yOffset: number;
  width: number;
  height: number;
  bits: Uint8Array;
}

export interface UnicodeFont {
  glyphs: (UnicodeGlyph | null)[];
}

export function parseUnicodeFont(bytes: Uint8Array): UnicodeFont {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const glyphs: (UnicodeGlyph | null)[] = new Array(UNICODE_CHAR_COUNT).fill(null);

  for (let character = 0; character < UNICODE_CHAR_COUNT; character++) {
    const entry = character * 4;
    if (entry + 4 > bytes.byteLength) {
      break;
    }
    const offset = view.getInt32(entry, true);
    if (offset <= 0 || offset + 4 > bytes.byteLength) {
      continue;
    }
    const xOffset = view.getInt8(offset);
    const yOffset = view.getInt8(offset + 1);
    const width = bytes[offset + 2] as number;
    const height = bytes[offset + 3] as number;
    if (width === 0 || height === 0) {
      glyphs[character] = { bits: new Uint8Array(0), height, width, xOffset, yOffset };
      continue;
    }
    const length = height * Math.ceil(width / 8);
    if (offset + 4 + length > bytes.byteLength) {
      continue;
    }
    glyphs[character] = {
      bits: bytes.slice(offset + 4, offset + 4 + length),
      height,
      width,
      xOffset,
      yOffset
    };
  }

  return { glyphs };
}

export function unicodeGlyphFor(font: UnicodeFont, character: number): UnicodeGlyph | null {
  return font.glyphs[character & 0xffff] ?? null;
}

export function unicodeCharIsSet(glyph: UnicodeGlyph, x: number, y: number): boolean {
  const rowBytes = Math.ceil(glyph.width / 8);
  const offset = y * rowBytes + (x >> 3);
  if (offset >= glyph.bits.byteLength) {
    return false;
  }
  return ((glyph.bits[offset] as number) & (1 << (7 - (x % 8)))) !== 0;
}
