import { type BitmapFont, glyphFor, type UnicodeFont, unicodeGlyphFor } from '@sosarium/formats';
import { pixelsToRgba } from '@sosarium/render';

export function glyphToCanvas(font: BitmapFont, character: number): HTMLCanvasElement | null {
  const glyph = glyphFor(font, character);
  if (!glyph || glyph.width === 0 || glyph.height === 0) {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = glyph.width;
  canvas.height = glyph.height;
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }
  const image = context.createImageData(glyph.width, glyph.height);
  image.data.set(pixelsToRgba(glyph.pixels));
  context.putImageData(image, 0, 0);
  return canvas;
}

export function drawFontText(
  font: BitmapFont,
  text: string,
  options: { color?: string; background?: string } = {}
): HTMLCanvasElement | null {
  const glyphs = [...text].map((character) => glyphToCanvas(font, character.codePointAt(0) ?? 0));
  const width = glyphs.reduce((sum, canvas) => sum + (canvas?.width ?? 0), 0) + 2;
  const height = font.height + 2;
  if (width <= 2) {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }
  if (options.background) {
    context.fillStyle = options.background;
    context.fillRect(0, 0, width, height);
  }
  const tint = document.createElement('canvas');
  let dx = 1;
  for (const glyph of glyphs) {
    if (!glyph) {
      continue;
    }
    tint.width = glyph.width;
    tint.height = glyph.height;
    const tintContext = tint.getContext('2d');
    if (!tintContext) {
      continue;
    }
    tintContext.clearRect(0, 0, glyph.width, glyph.height);
    tintContext.drawImage(glyph, 0, 0);
    if (options.color) {
      tintContext.globalCompositeOperation = 'source-in';
      tintContext.fillStyle = options.color;
      tintContext.fillRect(0, 0, glyph.width, glyph.height);
      tintContext.globalCompositeOperation = 'source-over';
    }
    context.imageSmoothingEnabled = false;
    context.drawImage(tint, dx, height - 1 - glyph.height);
    dx += glyph.width;
  }
  return canvas;
}

export function unicodeGlyphToCanvas(font: UnicodeFont, character: number): HTMLCanvasElement | null {
  const glyph = unicodeGlyphFor(font, character);
  if (!glyph || glyph.width === 0 || glyph.height === 0) {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = glyph.width;
  canvas.height = glyph.height;
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }
  const image = context.createImageData(glyph.width, glyph.height);
  const rowBytes = Math.ceil(glyph.width / 8);
  for (let y = 0; y < glyph.height; y++) {
    for (let x = 0; x < glyph.width; x++) {
      const byte = glyph.bits[y * rowBytes + (x >> 3)] ?? 0;
      if ((byte & (1 << (7 - (x % 8)))) === 0) {
        continue;
      }
      const index = (y * glyph.width + x) * 4;
      image.data[index] = 255;
      image.data[index + 1] = 255;
      image.data[index + 2] = 255;
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

function tintGlyph(glyph: HTMLCanvasElement, color?: string): HTMLCanvasElement {
  const tint = document.createElement('canvas');
  tint.width = glyph.width;
  tint.height = glyph.height;
  const context = tint.getContext('2d');
  if (!context) {
    return glyph;
  }
  context.drawImage(glyph, 0, 0);
  if (color) {
    context.globalCompositeOperation = 'source-in';
    context.fillStyle = color;
    context.fillRect(0, 0, glyph.width, glyph.height);
  }
  return tint;
}

export function drawUnicodeText(
  font: UnicodeFont,
  text: string,
  options: { color?: string; background?: string } = {}
): HTMLCanvasElement | null {
  const entries = [...text]
    .map((character) => {
      const code = character.codePointAt(0) ?? 0;
      return { code, glyph: unicodeGlyphToCanvas(font, code), metrics: unicodeGlyphFor(font, code) };
    })
    .filter((entry) => entry.glyph !== null) as {
    code: number;
    glyph: HTMLCanvasElement;
    metrics: NonNullable<ReturnType<typeof unicodeGlyphFor>>;
  }[];
  if (entries.length === 0) {
    return null;
  }
  let width = 4;
  let height = 4;
  for (const entry of entries) {
    width += entry.metrics.xOffset + entry.glyph.width;
    height = Math.max(height, entry.glyph.height + entry.metrics.yOffset + 4);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }
  if (options.background) {
    context.fillStyle = options.background;
    context.fillRect(0, 0, width, height);
  }
  context.imageSmoothingEnabled = false;
  let dx = 2;
  for (const entry of entries) {
    dx += entry.metrics.xOffset;
    context.drawImage(tintGlyph(entry.glyph, options.color), dx, 2 + entry.metrics.yOffset);
    dx += entry.glyph.width;
  }
  return canvas;
}
