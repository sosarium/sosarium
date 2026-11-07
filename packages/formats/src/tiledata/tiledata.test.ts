import { hasAssets, loadAsset } from '@sosarium/core/testing';
import { describe, expect, it } from 'vitest';

import type { WritableFile } from '../writable';
import { decodeFlags, encodeFlagNames, TILE_FLAGS } from './flags';
import {
  detectTileDataFormat,
  type ItemTileData,
  LAND_TILE_COUNT,
  type LandTileData,
  parseTileData,
  serializeTileData
} from './formats';
import { TileDataSource } from './source';

class MemoryWritableFile implements WritableFile {
  bytes: Uint8Array;
  opened = 0;

  constructor(initial: Uint8Array = new Uint8Array(0)) {
    this.bytes = initial.slice();
  }

  async open(keepExistingData: boolean): Promise<void> {
    this.opened++;
    if (!keepExistingData) {
      this.bytes = new Uint8Array(0);
    }
  }

  async writeAt(position: number, data: Uint8Array): Promise<void> {
    const end = position + data.byteLength;
    if (end > this.bytes.byteLength) {
      const next = new Uint8Array(Math.max(end, this.bytes.byteLength * 2, 64));
      next.set(this.bytes);
      this.bytes = next;
    }
    this.bytes.set(data, position);
  }

  async close(): Promise<void> {}
}

function makeLand(name: string, flags = 0n, textureId = 0): LandTileData {
  return { name, flags, textureId };
}

function makeItem(name: string, overrides: Partial<ItemTileData> = {}): ItemTileData {
  return {
    name,
    flags: 0n,
    weight: 1,
    quality: 0,
    miscData: 0,
    unk2: 0,
    quantity: 1,
    animation: 0,
    unk3: 0,
    hue: 0,
    stackingOffset: 0,
    value: 0,
    height: 0,
    ...overrides
  };
}

function makeSynthetic(format: 'old' | 'new'): {
  land: LandTileData[];
  items: ItemTileData[];
  landHeaders: number[];
  itemHeaders: number[];
} {
  const land = new Array(LAND_TILE_COUNT)
    .fill(null)
    .map((_, i) => makeLand(`land-${i}`, BigInt(i) & 0xffffn, i & 0xffff));
  const items = [
    makeItem('first', { weight: 7, height: 12, animation: -3, flags: 0x40n | 0x40000000n }),
    makeItem(''), // empty name entry
    makeItem('third', { hue: 5, value: 9, stackingOffset: 2 }),
    ...new Array(29).fill(null).map((_, i) => makeItem(`bulk-${i}`))
  ];
  items.push(...new Array(32).fill(null).map((_, i) => makeItem(`block2-${i}`, { height: i })));
  const landHeaders = new Array(512).fill(0).map((_, i) => i * 2);
  const itemHeaders = [11, 22];
  return { format, land, items, landHeaders, itemHeaders } as unknown as {
    land: LandTileData[];
    items: ItemTileData[];
    landHeaders: number[];
    itemHeaders: number[];
  };
}

describe('tile flags', () => {
  it('decodes the flags from the reference screenshot', () => {
    const flags = encodeFlagNames(['Impassable', 'NoShoot', 'ArticleA', 'NoDiagonal']);
    expect(decodeFlags(flags)).toEqual(['Impassable', 'NoShoot', 'ArticleA', 'NoDiagonal']);
  });

  it('round-trips all named flags', () => {
    const all = TILE_FLAGS.map((flag) => flag.name);
    const encoded = encodeFlagNames(all);
    expect(decodeFlags(encoded)).toEqual(all);
  });

  it('keeps 64-bit flags intact', () => {
    const flags = encodeFlagNames(['Unused32', 'Background']);
    expect(flags).toBe(0x8000000000000001n);
    expect(decodeFlags(flags)).toEqual(['Background', 'Unused32']);
  });
});

describe('tiledata parsing', () => {
  it('serializes and reparses the old layout', () => {
    const synthetic = makeSynthetic('old');
    const bytes = serializeTileData({ ...synthetic, format: 'old' });
    expect(detectTileDataFormat(bytes)).toBe('old');
    const parsed = parseTileData(bytes);
    expect(parsed.format).toBe('old');
    expect(parsed.land.length).toBe(LAND_TILE_COUNT);
    expect(parsed.items.length).toBe(64);
    expect(parsed.landHeaders).toEqual(synthetic.landHeaders);
    expect(parsed.itemHeaders).toEqual(synthetic.itemHeaders);
    expect(parsed.land[0]).toEqual(synthetic.land[0]);
    expect(parsed.land[LAND_TILE_COUNT - 1]).toEqual(synthetic.land[LAND_TILE_COUNT - 1]);
    expect(parsed.items[0]).toEqual(synthetic.items[0]);
    expect(parsed.items[2]).toEqual(synthetic.items[2]);
    expect(parsed.items[1]?.name).toBe('');
  });

  it('serializes and reparses the new layout', () => {
    const synthetic = makeSynthetic('new');
    const bytes = serializeTileData({ ...synthetic, format: 'new' });
    expect(detectTileDataFormat(bytes)).toBe('new');
    const parsed = parseTileData(bytes);
    expect(parsed.format).toBe('new');
    expect(parsed.items[0]?.animation).toBe(-3);
    expect(parsed.items[0]?.flags).toBe(0x40n | 0x40000000n);
  });

  it('rejects files with impossible sizes', () => {
    expect(() => detectTileDataFormat(new Uint8Array(1000))).toThrow('not a tiledata.mul file');
    expect(() => parseTileData(new Uint8Array(1000))).toThrow();
  });
});

describe.skipIf(!hasAssets())('tiledata.mul (real client file)', () => {
  const load = () => loadAsset('tiledata.mul');

  it('parses the modern layout with the expected counts', async () => {
    const parsed = parseTileData(await load().readAll());
    expect(parsed.format).toBe('new');
    expect(parsed.land.length).toBe(0x4000);
    expect(parsed.items.length).toBe(0x10000);
  });

  it('matches reference bounds for item 0x0002 "ankh"', async () => {
    const parsed = parseTileData(await load().readAll());
    const item = parsed.items[0x0002];
    expect(item).toBeDefined();
    expect(item?.name).toBe('ankh');
    expect(item?.height).toBe(12);
    expect(item?.weight).toBe(255);
    expect(item?.quality).toBe(0);
    expect(item?.animation).toBe(0);
    expect(item?.quantity).toBe(0);
    expect(item?.hue).toBe(0);
    expect(item?.stackingOffset).toBe(0);
    expect(decodeFlags((item as ItemTileData).flags)).toEqual(['Impassable', 'NoShoot', 'ArticleAn', 'NoDiagonal']);
  });

  it('re-serializes the unmodified file byte for byte', async () => {
    const source = await load().readAll();
    expect(serializeTileData(parseTileData(source))).toEqual(source);
  });
});

describe('TileDataSource', () => {
  it('applies edits and persists them through save', async () => {
    const bytes = serializeTileData({ ...makeSynthetic('new'), format: 'new' });
    const writable = new MemoryWritableFile();
    const source = new TileDataSource(bytes, writable);

    expect(source.hasChanges).toBe(false);
    await source.save();
    expect(writable.opened).toBe(0);

    source.updateItem(0x0002, { weight: 13, name: 'edited' });
    source.updateLand(5, { textureId: 321, flags: encodeFlagNames(['Wet']) });
    expect(source.hasChanges).toBe(true);
    expect(source.modifiedCount).toBe(2);
    expect(source.isModified('items', 0x0002)).toBe(true);
    expect(source.isModified('land', 5)).toBe(true);

    await source.save();
    expect(source.hasChanges).toBe(false);
    expect(writable.bytes.byteLength).toBe(bytes.byteLength);

    const reparsed = parseTileData(writable.bytes);
    expect(reparsed.items[0x0002]?.weight).toBe(13);
    expect(reparsed.items[0x0002]?.name).toBe('edited');
    expect(reparsed.land[5]?.textureId).toBe(321);
    expect(decodeFlags(reparsed.land[5]?.flags as bigint)).toEqual(['Wet']);
    expect(reparsed.items[0x0003]).toEqual(parseTileData(bytes).items[0x0003]);
  });
});
