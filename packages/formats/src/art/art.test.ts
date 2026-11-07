import { entryByIdentifier, readUopContainer, readUopEntryData, uopEntryName } from '@sosarium/core';
import { hasAssets, loadAsset } from '@sosarium/core/testing';
import { describe, expect, it } from 'vitest';

import { decodeLandTile, encodeLandTile, encodeUopLandEntry, LAND_TILE_SIZE } from './land';
import { decodeStaticArt, encodeStaticArt } from './static';

describe('land tiles', () => {
  it('round-trips opaque diamond pixels through mul encoding', () => {
    const tile = {
      width: LAND_TILE_SIZE,
      height: LAND_TILE_SIZE,
      pixels: new Uint16Array(LAND_TILE_SIZE * LAND_TILE_SIZE)
    };
    let seed = 1;
    for (let y = 0; y < 22; y++) {
      const offset = 21 - y;
      const run = 2 + y * 2;
      for (let n = 0; n < run; n++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        tile.pixels[y * LAND_TILE_SIZE + offset + n] = 0x8000 | (seed & 0x7fff);
      }
    }
    for (let y = 22; y < 44; y++) {
      const offset = y - 22;
      const run = 44 - (y - 22) * 2;
      for (let n = 0; n < run; n++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        tile.pixels[y * LAND_TILE_SIZE + offset + n] = 0x8000 | (seed & 0x7fff);
      }
    }

    const encoded = encodeLandTile(tile);
    expect(encoded.byteLength).toBe(2024);

    const decoded = decodeLandTile(encoded);
    expect(decoded).not.toBeNull();
    expect(Array.from((decoded as NonNullable<typeof decoded>).pixels)).toEqual(Array.from(tile.pixels));
  });

  it('rejects images that are not 44x44', () => {
    expect(() => encodeLandTile({ width: 43, height: 44, pixels: new Uint16Array(44 * 44) })).toThrow('44x44');
  });

  it('rejects short buffers on decode', () => {
    expect(decodeLandTile(new Uint8Array(100))).toBeNull();
  });
});

describe('static art', () => {
  it('round-trips sparse opaque runs', () => {
    const width = 33;
    const height = 17;
    const pixels = new Uint16Array(width * height);
    let seed = 7;
    for (let i = 0; i < pixels.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      if (seed % 3 !== 0) {
        pixels[i] = 0x8000 | (seed & 0x7fff);
      }
    }

    const encoded = encodeStaticArt({ width, height, pixels });
    const decoded = decodeStaticArt(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded?.width).toBe(width);
    expect(decoded?.height).toBe(height);
    expect(Array.from((decoded as NonNullable<typeof decoded>).pixels)).toEqual(Array.from(pixels));
  });

  it('round-trips a fully transparent image and a single pixel', () => {
    const blank = decodeStaticArt(encodeStaticArt({ width: 5, height: 4, pixels: new Uint16Array(20) }));
    expect(Array.from((blank as NonNullable<typeof blank>).pixels)).toEqual(new Array(20).fill(0));

    const pixels = new Uint16Array(9);
    pixels[4] = 0x8001;
    const single = decodeStaticArt(encodeStaticArt({ width: 3, height: 3, pixels }));
    expect(Array.from((single as NonNullable<typeof single>).pixels)).toEqual(Array.from(pixels));
  });

  it('rejects degenerate dimensions', () => {
    expect(() => encodeStaticArt({ width: 0, height: 4, pixels: new Uint16Array(0) })).toThrow('invalid');
    expect(decodeStaticArt(new Uint8Array(4))).toBeNull();
  });

  it('rejects short pixel buffers', () => {
    expect(() => encodeStaticArt({ width: 10, height: 10, pixels: new Uint16Array(50) })).toThrow('too small');
  });
});

describe.skipIf(!hasAssets())('art decoders (real client files)', () => {
  const loadEntries = async (indices: number[]) => {
    const source = loadAsset('artLegacyMUL.uop');
    const container = await readUopContainer(source);
    const results = new Map<number, Uint8Array>();
    for (const index of indices) {
      const entry = entryByIdentifier(container, uopEntryName('artlegacymul', index, 'tga'));
      expect(entry, `entry ${index} must exist`).toBeDefined();
      results.set(index, await readUopEntryData(source, entry as NonNullable<typeof entry>));
    }
    return results;
  };

  it('decodes real land tiles with the full diamond opaque', async () => {
    const entries = await loadEntries([3]);
    const tile = decodeLandTile(entries.get(3) as Uint8Array);
    expect(tile).not.toBeNull();
    const opaque = (tile as NonNullable<typeof tile>).pixels.reduce((n, v) => n + (v & 0x8000 ? 1 : 0), 0);
    expect(opaque).toBe(1012);
    expect((tile as NonNullable<typeof tile>).pixels[0]).toBe(0);
    expect((tile as NonNullable<typeof tile>).pixels[43]).toBe(0);
  });

  it('decodes real static art with measured dimensions and pixel counts', async () => {
    const entries = await loadEntries([16384, 16385, 33398, 33399]);
    const measured: [number, number, number, number][] = [
      [16384, 44, 42, 635],
      [16385, 44, 44, 1012],
      [33398, 44, 27, 72],
      [33399, 46, 119, 2223]
    ];
    for (const [index, width, height, opaque] of measured) {
      const tile = decodeStaticArt(entries.get(index) as Uint8Array);
      expect(tile, `entry ${index} decodes`).not.toBeNull();
      expect(tile?.width, `entry ${index} width`).toBe(width);
      expect(tile?.height, `entry ${index} height`).toBe(height);
      const pixels = (tile as NonNullable<typeof tile>).pixels;
      const count = pixels.reduce((n, v) => n + (v & 0x8000 ? 1 : 0), 0);
      expect(count, `entry ${index} opaque`).toBe(opaque);
    }
  });

  it('re-encodes real static art to an equivalent tile', async () => {
    const entries = await loadEntries([33398, 33399]);
    for (const index of [33398, 33399]) {
      const original = decodeStaticArt(entries.get(index) as Uint8Array);
      const encoded = encodeStaticArt(original as NonNullable<typeof original>);
      const roundTripped = decodeStaticArt(encoded);
      expect(roundTripped?.width, `entry ${index} width`).toBe(original?.width);
      expect(roundTripped?.height, `entry ${index} height`).toBe(original?.height);
      expect(Array.from((roundTripped as NonNullable<typeof roundTripped>).pixels)).toEqual(
        Array.from((original as NonNullable<typeof original>).pixels)
      );
    }
  });

  it('encodes land tiles into 2048-byte uop entries with zero padding', async () => {
    const entries = await loadEntries([3]);
    const tile = decodeLandTile(entries.get(3) as Uint8Array);
    const encoded = encodeUopLandEntry(tile as NonNullable<typeof tile>);
    expect(encoded.byteLength).toBe(2048);
    expect(Array.from(encoded.subarray(2024))).toEqual(new Array(24).fill(0));
  });
});
