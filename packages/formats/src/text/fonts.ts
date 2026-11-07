export const FONT_COUNT = 10;
export const GLYPH_COUNT = 224;

export interface FontGlyph {
  width: number;
  height: number;
  unk: number;
  pixels: Uint16Array;
}

export interface BitmapFont {
  header: number;
  height: number;
  glyphs: (FontGlyph | null)[];
}

export interface FontsFile {
  fonts: BitmapFont[];
  trailing: Uint8Array;
}

export function parseFonts(bytes: Uint8Array): FontsFile {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fonts: BitmapFont[] = [];
  let cursor = 0;

  for (let fontIndex = 0; fontIndex < FONT_COUNT; fontIndex++) {
    if (cursor >= bytes.byteLength) {
      break;
    }
    const header = bytes[cursor++] as number;
    const glyphs: (FontGlyph | null)[] = new Array(GLYPH_COUNT).fill(null);
    let height = 0;

    for (let glyphIndex = 0; glyphIndex < GLYPH_COUNT; glyphIndex++) {
      const width = bytes[cursor++] as number;
      const glyphHeight = bytes[cursor++] as number;
      const unk = bytes[cursor++] as number;
      if (width === 0 || glyphHeight === 0) {
        glyphs[glyphIndex] = { width, height: glyphHeight, unk, pixels: new Uint16Array(0) };
        continue;
      }
      if (glyphHeight > height && glyphIndex < 96) {
        height = glyphHeight;
      }
      const pixels = new Uint16Array(width * glyphHeight);
      for (let i = 0; i < pixels.length; i++) {
        const raw = view.getUint16(cursor, true);
        cursor += 2;
        pixels[i] = raw === 0 ? 0 : raw ^ 0x8000;
      }
      glyphs[glyphIndex] = { width, height: glyphHeight, unk, pixels };
    }

    fonts.push({ header, height, glyphs });
  }

  return { fonts, trailing: bytes.slice(cursor) };
}

export function serializeFonts(file: FontsFile): Uint8Array {
  const pieces: Uint8Array[] = [];
  let size = 0;
  for (const font of file.fonts) {
    pieces.push(new Uint8Array([font.header]));
    size += 1;
    for (let glyphIndex = 0; glyphIndex < GLYPH_COUNT; glyphIndex++) {
      const glyph = font.glyphs[glyphIndex] ?? null;
      if (!glyph || glyph.width === 0 || glyph.height === 0) {
        pieces.push(new Uint8Array([glyph?.width ?? 0, glyph?.height ?? 0, glyph?.unk ?? 0]));
        size += 3;
        continue;
      }
      const record = new Uint8Array(3 + glyph.pixels.length * 2);
      const view = new DataView(record.buffer);
      record[0] = glyph.width;
      record[1] = glyph.height;
      record[2] = glyph.unk;
      for (let i = 0; i < glyph.pixels.length; i++) {
        const pixel = glyph.pixels[i] as number;
        view.setUint16(3 + i * 2, pixel === 0 ? 0 : pixel ^ 0x8000, true);
      }
      pieces.push(record);
      size += record.byteLength;
    }
  }

  const out = new Uint8Array(size + file.trailing.byteLength);
  let position = 0;
  for (const piece of pieces) {
    out.set(piece, position);
    position += piece.byteLength;
  }
  out.set(file.trailing, position);
  return out;
}

export function glyphFor(font: BitmapFont, character: number): FontGlyph | null {
  return font.glyphs[((character - 0x20) & 0x7fffffff) % GLYPH_COUNT] ?? null;
}
