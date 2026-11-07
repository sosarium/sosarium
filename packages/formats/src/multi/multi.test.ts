import { parseMulIndex, readMulEntry } from '@sosarium/core';
import { hasAssets, loadAsset } from '@sosarium/core/testing';
import { describe, expect, it } from 'vitest';

import {
  boundsFor,
  MAXIMUM_MULTI_INDEX,
  MULTI_COMPONENT_NEW,
  MULTI_COMPONENT_OLD,
  multiFormatFromLength,
  parseMultiGroup,
  serializeMultiGroup
} from './multi';
import { MULTIMAP_HEIGHT, MULTIMAP_WIDTH, parseMultiMapRle, serializeMultiMapRle } from './multimap';

const SAMPLE = [
  { id: 0x1, x: 0, y: 0, z: 0, flags: 1, unk1: 0 },
  { id: 0x2, x: 2, y: 1, z: 5, flags: 0, unk1: 1 },
  { id: 0x3, x: 4, y: 2, z: 0, flags: 1, unk1: 0 }
];

describe('multi components', () => {
  it('parses and serializes the new format symmetrically', () => {
    const bytes = serializeMultiGroup({ components: SAMPLE, ...boundsFor(SAMPLE) }, 'new');
    expect(bytes.byteLength).toBe(SAMPLE.length * MULTI_COMPONENT_NEW);
    const parsed = parseMultiGroup(bytes, 'new');
    expect(parsed.components).toEqual(SAMPLE);
    expect(parsed.width).toBe(5);
    expect(parsed.height).toBe(3);
    expect(parsed.maxHeight).toBe(5);
    expect(parsed.minX).toBe(0);
    expect(parsed.minY).toBe(0);
  });

  it('parses and serializes the old format symmetrically', () => {
    const bytes = serializeMultiGroup({ components: SAMPLE, ...boundsFor(SAMPLE) }, 'old');
    expect(bytes.byteLength).toBe(SAMPLE.length * MULTI_COMPONENT_OLD);
    const parsed = parseMultiGroup(bytes, 'old');
    expect(parsed.components[1]).toEqual({ ...SAMPLE[1], unk1: 0 });
  });

  it('detects the record format from the entry length', () => {
    expect(multiFormatFromLength(0)).toBeNull();
    expect(multiFormatFromLength(16)).toBe('new');
    expect(multiFormatFromLength(64)).toBe('new');
    expect(multiFormatFromLength(12)).toBe('old');
    expect(multiFormatFromLength(5)).toBeNull();
  });
});

describe('multimap rle', () => {
  it('round-trips a synthetic image', () => {
    const pixels = new Uint16Array(10).fill(0xffff);
    pixels[3] = 0x8000;
    pixels[4] = 0x8000;
    pixels[5] = 0x8000;
    pixels[9] = 0x8000;
    const bytes = serializeMultiMapRle({ width: 5, height: 2, pixels });
    const parsed = parseMultiMapRle(bytes);
    expect(parsed.width).toBe(5);
    expect(parsed.height).toBe(2);
    expect(Array.from(parsed.pixels)).toEqual(Array.from(pixels));
  });

  it('handles runs longer than 127 pixels', () => {
    const pixels = new Uint16Array(300).fill(0xffff);
    const parsed = parseMultiMapRle(serializeMultiMapRle({ width: 300, height: 1, pixels }));
    expect(Array.from(parsed.pixels)).toEqual(Array.from(pixels));
  });
});

describe.skipIf(!hasAssets())('multi files (real client)', () => {
  it('round-trips real multi entries byte-for-byte', async () => {
    const entries = parseMulIndex(await loadAsset('multi.idx').readAll());
    const data = loadAsset('multi.mul');
    expect(entries.length).toBeGreaterThan(8000);
    expect(MAXIMUM_MULTI_INDEX).toBeGreaterThan(entries.length);

    let checked = 0;
    for (let index = 0; index < entries.length && checked < 12; index += 97) {
      const entry = entries[index];
      if (!entry) {
        continue;
      }
      const format = multiFormatFromLength(entry.length);
      expect(format).not.toBeNull();
      const bytes = await readMulEntry(data, entry);
      const parsed = parseMultiGroup(bytes, format as 'new' | 'old');
      const reserialized = serializeMultiGroup(parsed, format as 'new' | 'old');
      expect(Buffer.from(reserialized).equals(Buffer.from(bytes))).toBe(true);
      expect(parsed.components.length).toBeGreaterThan(0);
      expect(parsed.width).toBeGreaterThan(0);
      checked++;
    }
    expect(checked).toBeGreaterThan(5);
  });

  it('reads the real Multimap.rle header', async () => {
    const image = parseMultiMapRle(await loadAsset('Multimap.rle').readAll());
    expect(image.width).toBe(MULTIMAP_WIDTH);
    expect(image.height).toBe(MULTIMAP_HEIGHT);
    const black = image.pixels.reduce((count, color) => count + (color === 0x8000 ? 1 : 0), 0);
    expect(black).toBeGreaterThan(0);
    const reserialized = serializeMultiMapRle(image);
    const reparsed = parseMultiMapRle(reserialized);
    expect(Buffer.from(reparsed.pixels).equals(Buffer.from(image.pixels))).toBe(true);
  });
});
