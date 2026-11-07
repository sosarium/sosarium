import { hashFileName, readUopContainer, readUopEntryData, uopEntryName } from '@sosarium/core';
import { hasAssets, loadAsset } from '@sosarium/core/testing';
import { describe, expect, it } from 'vitest';

import { decodeLandTile, decodeStaticArt, LAND_COUNT } from './art';
import { decodeUopGumpEntry } from './gumps';
import { deriveFacetDimensions, MAP_BLOCK_SIZE, MapReader, mapUopTable } from './map';
import { packArtMul, packGumpMul, packMapMul, unpackArtUop, unpackGumpUop } from './uop-packer';

const ART_PATTERN = 'artlegacymul';
const GUMP_PATTERN = 'gumpartlegacymul';

describe.skipIf(!hasAssets())('uop packer (real client)', () => {
  it('round-trips art through unpack -> pack', async () => {
    const source = loadAsset('artLegacyMUL.uop');
    const container = await readUopContainer(source);
    const unpacked = await unpackArtUop(container, (entry) => readUopEntryData(source, entry));
    expect(unpacked.idx.byteLength).toBeGreaterThan(1000);
    expect(unpacked.mul.byteLength).toBeGreaterThan(1000);

    const packed = await packArtMul(unpacked);
    const packedContainer = await readUopContainer(loadAssetFromBytes(packed));
    const packedSource = loadAssetFromBytes(packed);

    const indices = [0, 1, 5, LAND_COUNT, LAND_COUNT + 1, LAND_COUNT + 100];
    for (const index of indices) {
      const name = uopEntryName(ART_PATTERN, index, 'tga');
      const originalEntry = container.byIdentifier.get(hashFileName(name));
      const packedEntry = packedContainer.byIdentifier.get(hashFileName(name));
      if (!originalEntry) {
        continue;
      }
      expect(packedEntry).toBeDefined();
      const originalBytes = await readUopEntryData(source, originalEntry);
      const packedBytes = await readUopEntryData(packedSource, packedEntry as NonNullable<typeof packedEntry>);
      const originalTile = index < LAND_COUNT ? decodeLandTile(originalBytes) : decodeStaticArt(originalBytes);
      const packedTile = index < LAND_COUNT ? decodeLandTile(packedBytes) : decodeStaticArt(packedBytes);
      expect(packedTile?.width).toBe(originalTile?.width);
      expect(packedTile?.height).toBe(originalTile?.height);
      expect(Array.from(packedTile?.pixels ?? [])).toEqual(Array.from(originalTile?.pixels ?? []));
    }
  });

  it('round-trips gumps through unpack -> pack', async () => {
    const source = loadAsset('gumpartLegacyMUL.uop');
    const container = await readUopContainer(source);
    const unpacked = await unpackGumpUop(container, (entry) => readUopEntryData(source, entry), 32);
    const packed = await packGumpMul(unpacked);
    const packedSource = loadAssetFromBytes(packed);
    const packedContainer = await readUopContainer(packedSource);

    for (const index of [0, 1, 2, 5, 9]) {
      const name = uopEntryName(GUMP_PATTERN, index, 'tga');
      const originalEntry = container.byIdentifier.get(hashFileName(name));
      if (!originalEntry) {
        continue;
      }
      const original = decodeUopGumpEntry(await readUopEntryData(source, originalEntry));
      const packedEntry = packedContainer.byIdentifier.get(hashFileName(name));
      expect(packedEntry).toBeDefined();
      const packedTile = decodeUopGumpEntry(
        await readUopEntryData(packedSource, packedEntry as NonNullable<typeof packedEntry>)
      );
      expect(packedTile?.width).toBe(original?.width);
      expect(packedTile?.height).toBe(original?.height);
      expect(Array.from(packedTile?.pixels ?? [])).toEqual(Array.from(original?.pixels ?? []));
    }
  });

  it('packs a synthetic map mul and reads it back', async () => {
    const blocks = Array.from({ length: 512 }, (_, index) => {
      const block = new Uint8Array(MAP_BLOCK_SIZE);
      block.fill(index + 1);
      return block;
    });
    const mul = new Uint8Array(blocks.length * MAP_BLOCK_SIZE);
    blocks.forEach((block, index) => {
      mul.set(block, index * MAP_BLOCK_SIZE);
    });

    const packed = await packMapMul(mul, 0);
    const source = loadAssetFromBytes(packed);
    const container = await readUopContainer(source);
    const table = mapUopTable(container.byIdentifier, 'map0LegacyMUL', container.entryCount);
    expect(table.totalLength).toBe(mul.byteLength);
    const dimensions = deriveFacetDimensions(0, table.totalLength);
    expect(dimensions).not.toBeNull();
    const reader = new MapReader(source, dimensions as NonNullable<typeof dimensions>, table);
    for (let index = 0; index < blocks.length; index++) {
      const block = await reader.readBlockByIndex(index);
      expect(Buffer.from(block).equals(Buffer.from(blocks[index] as Uint8Array))).toBe(true);
    }
  });
});

function loadAssetFromBytes(bytes: Uint8Array) {
  return {
    byteLength: bytes.byteLength,
    read: (offset: number, length: number) => Promise.resolve(bytes.slice(offset, offset + length)),
    readAll: () => Promise.resolve(bytes)
  };
}
