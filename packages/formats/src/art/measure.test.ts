import { entryByIdentifier, readUopContainer, readUopEntryData, uopEntryName } from '@sosarium/core';
import { hasAssets, loadAsset } from '@sosarium/core/testing';
import { describe, expect, it } from 'vitest';

import { measureArtBounds } from './measure';
import { decodeStaticArt } from './static';

describe('measureArtBounds', () => {
  it('returns the inclusive bounds of opaque pixels', () => {
    const width = 10;
    const height = 8;
    const pixels = new Uint16Array(width * height);
    pixels[2 * width + 3] = 0x8001;
    pixels[5 * width + 9] = 0x8002;
    pixels[3 * width + 4] = 0x8003;

    expect(measureArtBounds({ width, height, pixels })).toEqual({ xMin: 3, yMin: 2, xMax: 9, yMax: 5 });
  });

  it('returns null for a fully transparent tile', () => {
    expect(measureArtBounds({ width: 4, height: 4, pixels: new Uint16Array(16) })).toBeNull();
  });

  it('bounds a single pixel to itself', () => {
    const pixels = new Uint16Array(25);
    pixels[12] = 0xffff;
    expect(measureArtBounds({ width: 5, height: 5, pixels })).toEqual({ xMin: 2, yMin: 2, xMax: 2, yMax: 2 });
  });
});

describe.skipIf(!hasAssets())('measureArtBounds (real client files)', () => {
  it('matches reference bounds for item 0x0002 "arkh"', async () => {
    const source = loadAsset('artLegacyMUL.uop');
    const container = await readUopContainer(source);
    const entry = entryByIdentifier(container, uopEntryName('artlegacymul', 0x4002, 'tga'));
    expect(entry).toBeDefined();

    const tile = decodeStaticArt(await readUopEntryData(source, entry as NonNullable<typeof entry>));
    expect(tile).not.toBeNull();
    const decoded = tile as NonNullable<typeof tile>;
    expect(decoded.width).toBe(44);
    expect(decoded.height).toBe(89);
    expect(measureArtBounds(decoded)).toEqual({ xMin: 20, yMin: 1, xMax: 43, yMax: 72 });
  });
});
