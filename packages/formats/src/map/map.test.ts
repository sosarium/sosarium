import { MemoryByteSource, readUopContainer } from '@sosarium/core';
import { hasAssets, loadAsset } from '@sosarium/core/testing';
import { describe, expect, it } from 'vitest';

import {
  deriveFacetDimensions,
  MAP_BLOCK_SIZE,
  MapReader,
  mapUopTable,
  StaticReader,
  type StaticTile
} from './mapread';
import { parseRadarCol, radarItemColor, radarLandColor } from './radarcol';
import { renderRadarBlock } from './render';

function buildLandBlock(tiles: { id: number; z: number }[]): Uint8Array {
  const bytes = new Uint8Array(MAP_BLOCK_SIZE);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < 64; i++) {
    const tile = tiles[i] ?? { id: 0, z: 0 };
    view.setUint16(4 + i * 3, tile.id, true);
    view.setInt8(4 + i * 3 + 2, tile.z);
  }
  return bytes;
}

function buildStatics(entries: { id: number; x: number; y: number; z: number; hue: number }[]): Uint8Array {
  const bytes = new Uint8Array(entries.length * 7);
  const view = new DataView(bytes.buffer);
  entries.forEach((entry, i) => {
    const base = i * 7;
    view.setUint16(base, entry.id, true);
    view.setUint8(base + 2, entry.x);
    view.setUint8(base + 3, entry.y);
    view.setInt8(base + 4, entry.z);
    view.setInt16(base + 5, entry.hue, true);
  });
  return bytes;
}

describe('map block decoding', () => {
  it('reads a synthetic land block from a plain mul', async () => {
    const tiles = Array.from({ length: 64 }, (_, i) => ({ id: 100 + i, z: i % 5 }));
    const data = new MemoryByteSource(buildLandBlock(tiles));
    const dimensions = { width: 8, height: 8, blockWidth: 1, blockHeight: 1 };
    const reader = new MapReader(data, dimensions, null);
    const block = await reader.readLandBlock(0, 0);
    expect(block).toHaveLength(64);
    expect(block[0]).toEqual({ id: 100, z: 0 });
    expect(block[63]).toEqual({ id: 163, z: 3 });
  });

  it('maps virtual offsets through uop chunks', async () => {
    const tiles = Array.from({ length: 64 }, () => ({ id: 7, z: 1 }));
    const landBlock = buildLandBlock(tiles);
    // Real map uop chunks are block-aligned (802,816 = 4096 x 196), so a block never straddles
    // two chunks; a filler chunk in front of the block reproduces the offset math.
    const filler = new Uint8Array(MAP_BLOCK_SIZE * 2);
    const byIdentifier = new Map<
      bigint,
      { offset: number; headerLength: number; size: number; compressionFlag: number }
    >();
    const { hashFileName } = await import('@sosarium/core');
    byIdentifier.set(hashFileName('build/map0legacymul/00000000.dat'), {
      offset: 1000,
      headerLength: 10,
      size: filler.byteLength,
      compressionFlag: 0
    });
    byIdentifier.set(hashFileName('build/map0legacymul/00000001.dat'), {
      offset: 2000,
      headerLength: 10,
      size: landBlock.byteLength,
      compressionFlag: 0
    });
    const table = mapUopTable(byIdentifier, 'map0LegacyMUL', 2);
    expect(table.totalLength).toBe(MAP_BLOCK_SIZE * 3);
    expect(table.chunks).toHaveLength(2);

    const backing = new Uint8Array(4000);
    backing.set(filler, 1010);
    backing.set(landBlock, 2010);
    const reader = new MapReader(
      new MemoryByteSource(backing),
      { width: 24, height: 8, blockWidth: 3, blockHeight: 1 },
      table
    );
    const block = await reader.readLandBlock(2, 0);
    expect(block[0]?.id).toBe(7);
    expect(block[63]?.z).toBe(1);
  });

  it('decodes a synthetic static block into 8x8 lists', async () => {
    const statics = buildStatics([
      { id: 0x1000, x: 3, y: 5, z: 2, hue: 0 },
      { id: 0x2000, x: 3, y: 5, z: 4, hue: 0 },
      { id: 0x3000, x: 7, y: 0, z: -1, hue: 12 }
    ]);
    const index = new Uint8Array(12);
    const indexView = new DataView(index.buffer);
    indexView.setInt32(0, 0, true);
    indexView.setInt32(4, statics.byteLength, true);
    indexView.setInt32(8, 0, true);

    const reader = new StaticReader(new MemoryByteSource(index), new MemoryByteSource(statics), {
      width: 8,
      height: 8,
      blockWidth: 1,
      blockHeight: 1
    });
    const block = await reader.readStaticBlock(0, 0);
    expect(block[3]?.[5]).toHaveLength(2);
    expect(block[7]?.[0]?.[0]).toEqual({ id: 0x3000, x: 7, y: 0, z: -1, hue: 12 });
    expect(block[0]?.[0]).toHaveLength(0);
  });
});

describe('radar block rendering', () => {
  it('picks the highest static and falls back to land', () => {
    const land = Array.from({ length: 64 }, () => ({ id: 3, z: 0 }));
    const statics: StaticTile[][][] = Array.from({ length: 8 }, () =>
      Array.from({ length: 8 }, () => [] as StaticTile[])
    );
    (statics[1] as StaticTile[][])[2] = [
      { id: 0x1000, x: 1, y: 2, z: 0, hue: 0 },
      { id: 0x1001, x: 1, y: 2, z: 5, hue: 0 }
    ];
    const colors = new Uint16Array(0x8000);
    colors[3] = 0x1111;
    colors[0x1000 + 0x4000] = 0x2222;
    colors[0x1001 + 0x4000] = 0x3333;
    const radar = { colors };
    const rendered = renderRadarBlock({
      land,
      statics,
      radar,
      itemHeights: null,
      hueColors: () => null
    });
    expect(rendered[2 * 8 + 1]).toBe(0x3333);
    expect(rendered[0]).toBe(0x1111);
    expect(radarLandColor(radar, 3)).toBe(0x1111);
    expect(radarItemColor(radar, 0xffff)).toBe(0);
  });

  it('takes the hue ramp branch for hued statics', () => {
    const land = Array.from({ length: 64 }, () => ({ id: 3, z: -5 }));
    const statics: StaticTile[][][] = Array.from({ length: 8 }, () =>
      Array.from({ length: 8 }, () => [] as StaticTile[])
    );
    (statics[0] as StaticTile[][])[0] = [{ id: 0x1000, x: 0, y: 0, z: 0, hue: 2 }];
    const colors = new Uint16Array(0x8000);
    colors[0x1000 + 0x4000] = 0x0400;
    const ramp = new Uint16Array(32);
    ramp[(0x0400 >> 10) & 0x1f] = 0x7777;
    const rendered = renderRadarBlock({
      land,
      statics,
      radar: { colors },
      itemHeights: null,
      hueColors: (index) => (index === 1 ? ramp : null)
    });
    expect(rendered[0]).toBe(0x7777);
  });
});

describe.skipIf(!hasAssets())('map files (real client)', () => {
  it('derives facet dimensions from the real map0 length', async () => {
    const source = loadAsset('map0LegacyMUL.uop');
    const container = await readUopContainer(source);
    const table = mapUopTable(container.byIdentifier, 'map0LegacyMUL', container.entryCount);
    expect(table.totalLength).toBeGreaterThan(77_000_000);
    const dimensions = deriveFacetDimensions(0, table.totalLength);
    expect(dimensions).not.toBeNull();
    expect(dimensions?.blockHeight).toBe(512);
    expect(dimensions?.blockWidth).toBe(896);
    expect(dimensions?.width).toBe(7168);
    expect(dimensions?.height).toBe(4096);
  });

  it('reads a britain-area land block and its statics', async () => {
    const mapSource = loadAsset('map0LegacyMUL.uop');
    const container = await readUopContainer(mapSource);
    const table = mapUopTable(container.byIdentifier, 'map0LegacyMUL', container.entryCount);
    const dimensions = deriveFacetDimensions(0, table.totalLength);
    expect(dimensions).not.toBeNull();

    const reader = new MapReader(mapSource, dimensions as NonNullable<typeof dimensions>, table);
    const block = await reader.readLandBlock(186, 203);
    expect(block).toHaveLength(64);
    expect(block.every((tile) => tile.id >= 0 && tile.id < 0x4000)).toBe(true);

    const statics = new StaticReader(
      loadAsset('staidx0.mul'),
      loadAsset('statics0.mul'),
      dimensions as NonNullable<typeof dimensions>
    );
    const staticBlock = await statics.readStaticBlock(186, 203);
    const total = staticBlock.flat().reduce((sum, list) => sum + list.length, 0);
    expect(total).toBeGreaterThan(5);

    const radar = parseRadarCol(await loadAsset('radarcol.mul').readAll());
    expect(radar.colors.length).toBeGreaterThan(0x8000);
    const rendered = renderRadarBlock({
      land: block,
      statics: staticBlock,
      radar,
      itemHeights: null,
      hueColors: () => null
    });
    expect(rendered).toHaveLength(64);
    const nonZero = rendered.reduce((sum, color) => sum + (color !== 0 ? 1 : 0), 0);
    expect(nonZero).toBeGreaterThan(30);
  });
});
