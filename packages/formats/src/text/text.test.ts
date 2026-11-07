import { clilocCompressedLength, mythicCompress, mythicDecompress, wrapCompressedCliloc } from '@sosarium/core';
import { hasAssets, loadAsset } from '@sosarium/core/testing';
import { describe, expect, it } from 'vitest';

import { clilocIsCompressed, parseCliloc, serializeCliloc } from './cliloc';
import { FONT_COUNT, GLYPH_COUNT, parseFonts, serializeFonts } from './fonts';
import { parseSpeech, serializeSpeech } from './speech';

describe('cliloc', () => {
  it('round-trips a synthetic plain file', () => {
    const payload = serializeCliloc({
      language: 'enu',
      compressed: false,
      header1: 2,
      header2: 0,
      entries: [
        { number: 3, flag: 0, text: 'third' },
        { number: 1, flag: 1, text: 'first' }
      ]
    });
    const parsed = parseCliloc(payload, 'enu');
    expect(parsed.entries.map((entry) => entry.number)).toEqual([1, 3]);
    expect(parsed.entries[0]?.text).toBe('first');
    expect(parsed.entries[0]?.flag).toBe(1);
  });

  it('wraps the compressed variant with the xor-tagged length', () => {
    const payload = new TextEncoder().encode('hello mythic world hello mythic world');
    const compressed = wrapCompressedCliloc(payload);
    expect(clilocCompressedLength(compressed)).toBe(payload.byteLength);
    expect(Buffer.from(mythicDecompress(compressed)).equals(Buffer.from(payload))).toBe(true);
  });

  it('compresses deterministically', () => {
    const payload = new TextEncoder().encode('abcabcabcabcabcabcabcabcabcabcabcabc');
    const once = mythicCompress(payload);
    const twice = mythicCompress(payload);
    expect(Buffer.from(once).equals(Buffer.from(twice))).toBe(true);
  });
});

describe('speech', () => {
  it('round-trips a synthetic list', () => {
    const bytes = serializeSpeech([
      { id: 2, keyword: 'vendor' },
      { id: 300, keyword: 'bank' }
    ]);
    const parsed = parseSpeech(bytes);
    expect(parsed).toEqual([
      { id: 2, keyword: 'vendor' },
      { id: 300, keyword: 'bank' }
    ]);
  });
});

describe.skipIf(!hasAssets())('text files (real client)', () => {
  // The shipping compressed files carry ~15 KB of extra wrapper bytes after the mythic
  // stream (the vendor tool emits a longer wrapper than the algorithm needs; readers ignore
  // it). Ours regenerates a canonical wrapper, so the assertion is payload-level equality:
  // re-parsing our output must reproduce the original decompressed payload byte-for-byte.
  it('round-trips the real Cliloc.enu payload byte-for-byte', async () => {
    const bytes = await loadAsset('Cliloc.enu').readAll();
    expect(clilocIsCompressed(bytes)).toBe(true);
    const parsed = parseCliloc(bytes, 'enu');
    expect(parsed.compressed).toBe(true);
    expect(parsed.entries.length).toBeGreaterThan(50_000);
    const withBritain = parsed.entries.find((entry) => entry.text.includes('Britain'));
    expect(withBritain).toBeDefined();
    const reserialized = serializeCliloc(parsed);
    const original = mythicDecompress(bytes);
    const rebuilt = mythicDecompress(reserialized);
    expect(rebuilt.byteLength).toBe(original.byteLength);
    expect(Buffer.from(rebuilt).equals(Buffer.from(original))).toBe(true);
    const reparsed = parseCliloc(reserialized, 'enu');
    expect(reparsed.entries.length).toBe(parsed.entries.length);
    expect(reparsed.entries[1000]).toEqual(parsed.entries[1000]);
  });

  it('round-trips the real speech.mul byte-for-byte', async () => {
    const bytes = await loadAsset('speech.mul').readAll();
    const parsed = parseSpeech(bytes);
    expect(parsed.length).toBeGreaterThan(500);
    const reserialized = serializeSpeech(parsed);
    expect(Buffer.from(reserialized).equals(Buffer.from(bytes))).toBe(true);
  });

  it('round-trips the real fonts.mul byte-for-byte', async () => {
    const bytes = await loadAsset('fonts.mul').readAll();
    const parsed = parseFonts(bytes);
    expect(parsed.fonts).toHaveLength(FONT_COUNT);
    const font0 = parsed.fonts[0];
    expect(font0?.height).toBeGreaterThan(0);
    const glyphA = font0?.glyphs[('A'.charCodeAt(0) - 0x20) % GLYPH_COUNT];
    expect(glyphA?.width).toBeGreaterThan(0);
    const opaque = (glyphA?.pixels ?? new Uint16Array(0)).reduce((count, pixel) => count + (pixel & 0x8000 ? 1 : 0), 0);
    expect(opaque).toBeGreaterThan(0);
    const reserialized = serializeFonts(parsed);
    expect(Buffer.from(reserialized).equals(Buffer.from(bytes))).toBe(true);
  });
});
