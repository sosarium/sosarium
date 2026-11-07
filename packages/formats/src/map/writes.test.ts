import { MemoryByteSource, parseMulIndex, readUopContainer } from '@sosarium/core';
import { hasAssets, loadAsset } from '@sosarium/core/testing';
import { describe, expect, it } from 'vitest';

import { MAP_BLOCK_SIZE, MapReader, mapUopTable, StaticReader, type StaticTile } from './mapread';
import { buildMapUop, CHUNK_BLOCKS, copyRegion, dedupeStatics, rebuildStatics } from './writes';

function makeLandBlock(id: number, z: number): Uint8Array {
  const bytes = new Uint8Array(MAP_BLOCK_SIZE);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < 64; i++) {
    view.setUint16(4 + i * 3, id + (i % 4), true);
    view.setInt8(4 + i * 3 + 2, z);
  }
  return bytes;
}

function staticsBytes(tiles: StaticTile[]): Uint8Array {
  const bytes = new Uint8Array(tiles.length * 7);
  const view = new DataView(bytes.buffer);
  tiles.forEach((tile, i) => {
    const base = i * 7;
    view.setUint16(base, tile.id, true);
    bytes[base + 2] = tile.x;
    bytes[base + 3] = tile.y;
    view.setInt8(base + 4, tile.z);
    view.setInt16(base + 5, tile.hue, true);
  });
  return bytes;
}

function indexBytes(entries: ({ lookup: number; length: number; extra: number } | null)[]): Uint8Array {
  const bytes = new Uint8Array(entries.length * 12);
  const view = new DataView(bytes.buffer);
  entries.forEach((entry, i) => {
    view.setInt32(i * 12, entry ? entry.lookup : -1, true);
    view.setInt32(i * 12 + 4, entry ? entry.length : -1, true);
    view.setInt32(i * 12 + 8, entry ? entry.extra : -1, true);
  });
  return bytes;
}

describe('map uop writer', () => {
  it('writes blocks, applies edits and splits into 4096-block chunks', async () => {
    const blockCount = CHUNK_BLOCKS + 5;
    const original = Array.from({ length: blockCount }, (_, i) => makeLandBlock(i % 500, i % 7));
    const edited = new Map([[3, makeLandBlock(999, 42)]]);
    const trailing = makeLandBlock(1, 1);

    const bytes = await buildMapUop({
      mapId: 0,
      blockCount,
      readBlock: (index) => Promise.resolve(original[index] as Uint8Array),
      edits: edited,
      trailingBlock: trailing
    });

    const container = await readUopContainer(new MemoryByteSource(bytes));
    expect(container.entryCount).toBe(2);
    const table = mapUopTable(container.byIdentifier, 'map0LegacyMUL', container.entryCount);
    expect(table.totalLength).toBe((blockCount + 1) * MAP_BLOCK_SIZE);

    const reader = new MapReader(new MemoryByteSource(bytes), deriveFixtures(blockCount), table);
    const editedRead = await reader.readLandBlock(3, 0);
    expect(editedRead[0]?.id).toBe(999);
    expect(editedRead[0]?.z).toBe(42);
    const untouched = await reader.readLandBlock(1, 0);
    expect(untouched[0]?.id).toBe(1);
    const lastIndex = blockCount - 1;
    expect(lastIndex).toBeGreaterThan(0);
  });
});

function deriveFixtures(blockCount: number) {
  return { width: 8, height: 8, blockWidth: blockCount, blockHeight: 1 };
}

describe('statics rebuild', () => {
  it('compacts blocks, clears edited ones and preserves the rest', async () => {
    const blockA = staticsBytes([
      { id: 0x100, x: 1, y: 1, z: 0, hue: 0 },
      { id: 0x101, x: 2, y: 2, z: 1, hue: 5 }
    ]);
    const blockB = staticsBytes([{ id: 0x200, x: 7, y: 7, z: -3, hue: 0 }]);
    const statics = new Uint8Array(blockA.byteLength + 40 + blockB.byteLength);
    statics.set(blockA, 0);
    statics.set(blockB, blockA.byteLength + 40);

    const entries = parseMulIndex(
      indexBytes([
        { lookup: 0, length: blockA.byteLength, extra: 7 },
        null,
        { lookup: blockA.byteLength + 40, length: blockB.byteLength, extra: 0 }
      ])
    );

    const result = await rebuildStatics({
      blockWidth: 3,
      blockHeight: 1,
      entries,
      readStatics: (offset, length) => Promise.resolve(statics.slice(offset, offset + length)),
      edits: new Map([[2, [{ id: 0x300, x: 0, y: 0, z: 9, hue: 0 }]]]),
      preserveExtra: true
    });

    const index = new DataView(result.index.buffer);
    expect(index.getInt32(0, true)).toBe(0);
    expect(index.getInt32(4, true)).toBe(blockA.byteLength);
    expect(index.getInt32(8, true)).toBe(7);
    expect(index.getInt32(12, true)).toBe(-1);
    expect(index.getInt32(24, true)).toBe(blockA.byteLength);

    const rebuiltStatics = new MemoryByteSource(result.statics);
    const reader = new StaticReader(new MemoryByteSource(result.index), rebuiltStatics, {
      width: 24,
      height: 8,
      blockWidth: 3,
      blockHeight: 1
    });
    const blockAE = await reader.readStaticBlock(0, 0);
    expect(blockAE[1]?.[1]?.[0]?.id).toBe(0x100);
    expect(blockAE[2]?.[2]?.[0]?.hue).toBe(5);
    const blockC = await reader.readStaticBlock(2, 0);
    expect(blockC[0]?.[0]?.[0]?.z).toBe(9);
    expect(result.blocksWithStatics).toBe(2);
    expect(result.tilesWritten).toBe(3);
  });

  it('drops duplicate statics ignoring hue', () => {
    const deduped = dedupeStatics([
      { id: 1, x: 0, y: 0, z: 0, hue: 0 },
      { id: 1, x: 0, y: 0, z: 0, hue: 99 },
      { id: 1, x: 0, y: 0, z: 1, hue: 0 }
    ]);
    expect(deduped).toHaveLength(2);
  });
});

describe('region copy', () => {
  it('copies land and statics to the target block', async () => {
    const land = makeLandBlock(50, 5);
    const statics = staticsBytes([{ id: 0x400, x: 3, y: 4, z: 2, hue: 1 }]);
    const index = indexBytes([{ lookup: 0, length: statics.byteLength, extra: 0 }]);

    const reader = new MapReader(
      new MemoryByteSource(land),
      { width: 24, height: 8, blockWidth: 3, blockHeight: 1 },
      null
    );
    const staticReader = new StaticReader(new MemoryByteSource(index), new MemoryByteSource(statics), {
      width: 24,
      height: 8,
      blockWidth: 3,
      blockHeight: 1
    });

    const result = await copyRegion(
      reader,
      staticReader,
      { blockWidth: 3, blockHeight: 1 },
      {
        sourceX: 0,
        sourceY: 0,
        width: 1,
        height: 1,
        targetX: 2,
        targetY: 0
      }
    );

    expect(result.landEdits.size).toBe(1);
    const copied = result.landEdits.get(2);
    expect(copied?.[0]).toBe(land[0]);
    const tiles = result.staticEdits.get(2);
    expect(tiles?.[0]?.id).toBe(0x400);
  });
});

describe.skipIf(!hasAssets())('statics defrag (real files)', () => {
  it('rewrites real staidx/statics compactly with identical per-block content', async () => {
    const staidxBytes = await loadAsset('staidx0.mul').readAll();
    const entries = parseMulIndex(staidxBytes);
    const data = loadAsset('statics0.mul');

    const blockWidth = 16;
    const blockHeight = 512;
    const slice = entries.slice(0, blockWidth * blockHeight);

    const rebuilt = await rebuildStatics({
      blockWidth,
      blockHeight,
      entries: slice,
      readStatics: (offset, length) => data.read(offset, length),
      edits: new Map(),
      preserveExtra: true,
      sortTiles: true
    });

    const dimensions = { width: blockWidth * 8, height: blockHeight * 8, blockWidth, blockHeight };
    const reader = new StaticReader(
      new MemoryByteSource(rebuilt.index),
      new MemoryByteSource(rebuilt.statics),
      dimensions
    );

    const sourceReader = new StaticReader(new MemoryByteSource(staidxBytes), data, dimensions);
    const populated: number[] = [];
    for (let index = 0; index < slice.length; index++) {
      if (slice[index]) {
        populated.push(index);
      }
    }
    const sample: number[] = [];
    for (let i = 0; i < populated.length; i += 131) {
      sample.push(populated[i] as number);
    }
    sample.push(0, 1, 2);

    let sourceTiles = 0;
    let rebuiltTiles = 0;
    for (const index of sample) {
      const blockX = Math.floor(index / blockHeight);
      const blockY = index % blockHeight;
      const source = await sourceReader.readStaticBlock(blockX, blockY);
      const after = await reader.readStaticBlock(blockX, blockY);
      const sourceList = source
        .flat()
        .flat()
        .sort((a, b) => a.id - b.id || a.x - b.x || a.y - b.y || a.z - b.z);
      const afterList = after
        .flat()
        .flat()
        .sort((a, b) => a.id - b.id || a.x - b.x || a.y - b.y || a.z - b.z);
      expect(afterList).toEqual(sourceList);
      sourceTiles += sourceList.length;
      rebuiltTiles += afterList.length;
    }
    expect(sourceTiles).toBeGreaterThan(0);
    expect(rebuiltTiles).toBe(sourceTiles);
    expect(rebuilt.index.byteLength).toBe(blockWidth * blockHeight * 12);
  });
});
