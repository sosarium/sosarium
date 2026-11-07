import {
  entryByIdentifier,
  hashFileName,
  MemoryByteSource,
  MemoryWriteSink,
  readUopContainer,
  readUopEntryData,
  serializeMulIndex,
  UopContainerWriter,
  uopEntryName
} from '@sosarium/core';
import { describe, expect, it } from 'vitest';

import { decodeLandTile, encodeLandTile, encodeUopLandEntry, LAND_TILE_SIZE } from './land';
import { MulArtSource, UopArtSource, type WritableFile } from './source';
import { encodeStaticArt } from './static';

class MemoryWritableFile implements WritableFile {
  bytes: Uint8Array;

  constructor(initial: Uint8Array = new Uint8Array(0)) {
    this.bytes = initial.slice();
  }

  async open(keepExistingData: boolean): Promise<void> {
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

function makeLandTile(seed: number) {
  const pixels = new Uint16Array(LAND_TILE_SIZE * LAND_TILE_SIZE);
  let counter = 0;
  const fill = (index: number) => {
    counter++;
    pixels[index] = 0x8000 | ((seed * 13 + counter * (1 + (counter % 7))) & 0x7fff);
  };
  let xOffset = 21;
  let xRun = 2;
  let line = 0;
  for (let y = 0; y < 22; y++, xOffset--, xRun += 2, line += LAND_TILE_SIZE) {
    for (let n = 0; n < xRun; n++) {
      fill(line + xOffset + n);
    }
  }
  xOffset = 0;
  xRun = 44;
  for (let y = 22; y < 44; y++, xOffset++, xRun -= 2, line += LAND_TILE_SIZE) {
    for (let n = 0; n < xRun; n++) {
      fill(line + xOffset + n);
    }
  }
  expect(counter).toBe(1012);
  return { width: LAND_TILE_SIZE, height: LAND_TILE_SIZE, pixels };
}

function makeStaticTile(seed: number, width = 12, height = 9) {
  const pixels = new Uint16Array(width * height);
  for (let i = 0; i < pixels.length; i++) {
    if ((seed + i) % 3 !== 0) {
      pixels[i] = 0x8000 | ((seed * 31 + i) & 0x7fff);
    }
  }
  return { width, height, pixels };
}

describe('MulArtSource', () => {
  const land0 = makeLandTile(1);
  const static0 = makeStaticTile(2);
  const static1 = makeStaticTile(3, 5, 5);

  const landBytes = encodeLandTile(land0);
  const staticBytes = encodeStaticArt(static0);
  const static1Bytes = encodeStaticArt(static1);

  const build = () => {
    const entries = new Array(0x8000);
    entries[0] = { lookup: 0, length: landBytes.byteLength, extra: 0 };
    entries[0x4000] = { lookup: landBytes.byteLength, length: staticBytes.byteLength, extra: 0 };
    entries[0x4001] = {
      lookup: landBytes.byteLength + staticBytes.byteLength,
      length: static1Bytes.byteLength,
      extra: 0
    };
    const idxBytes = serializeMulIndex(entries);
    const dataBytes = new Uint8Array(landBytes.byteLength + staticBytes.byteLength + static1Bytes.byteLength);
    dataBytes.set(landBytes, 0);
    dataBytes.set(staticBytes, landBytes.byteLength);
    dataBytes.set(static1Bytes, landBytes.byteLength + staticBytes.byteLength);
    return { idxBytes, dataBytes };
  };

  it('reads entries and preserves unedited data through a save', async () => {
    const { idxBytes, dataBytes } = build();
    const artFile = new MemoryWritableFile(dataBytes);
    const idxFile = new MemoryWritableFile(idxBytes);
    const source = new MulArtSource({
      idxBytes,
      data: new MemoryByteSource(dataBytes),
      artFile,
      idxFile
    });

    const readLand0 = await source.readLand(0);
    expect(Array.from((readLand0 as NonNullable<typeof readLand0>).pixels)).toEqual(Array.from(land0.pixels));
    const readStatic1 = await source.readStatic(1);
    expect(Array.from((readStatic1 as NonNullable<typeof readStatic1>).pixels)).toEqual(Array.from(static1.pixels));
    expect(await source.readStatic(9)).toBeNull();
    expect(source.hasStatic(0)).toBe(true);
    expect(source.hasStatic(9)).toBe(false);

    const editedLand = makeLandTile(42);
    const editedStatic = makeStaticTile(43, 8, 8);
    source.writeLand(0, editedLand);
    source.writeStatic(0, editedStatic);
    expect(source.hasChanges).toBe(true);
    expect(source.isModified('static', 0)).toBe(true);

    await source.save();
    expect(source.hasChanges).toBe(false);

    const reloaded = new MulArtSource({
      idxBytes: idxFile.bytes,
      data: new MemoryByteSource(artFile.bytes),
      artFile: new MemoryWritableFile(),
      idxFile: new MemoryWritableFile()
    });

    const land = await reloaded.readLand(0);
    expect(Array.from((land as NonNullable<typeof land>).pixels)).toEqual(Array.from(editedLand.pixels));
    const stat = await reloaded.readStatic(0);
    expect(Array.from((stat as NonNullable<typeof stat>).pixels)).toEqual(Array.from(editedStatic.pixels));
    const untouched = await reloaded.readStatic(1);
    expect(Array.from((untouched as NonNullable<typeof untouched>).pixels)).toEqual(Array.from(static1.pixels));
  });

  it('adds new static entries for previously empty slots', async () => {
    const { idxBytes, dataBytes } = build();
    const artFile = new MemoryWritableFile(dataBytes);
    const idxFile = new MemoryWritableFile(idxBytes);
    const source = new MulArtSource({
      idxBytes,
      data: new MemoryByteSource(dataBytes),
      artFile,
      idxFile
    });

    const fresh = makeStaticTile(77, 6, 6);
    source.writeStatic(5, fresh);
    await source.save();

    const reloaded = new MulArtSource({
      idxBytes: idxFile.bytes,
      data: new MemoryByteSource(artFile.bytes),
      artFile: new MemoryWritableFile(),
      idxFile: new MemoryWritableFile()
    });
    const added = await reloaded.readStatic(5);
    expect(Array.from((added as NonNullable<typeof added>).pixels)).toEqual(Array.from(fresh.pixels));
    expect(reloaded.hasStatic(5)).toBe(true);
  });
});

describe('UopArtSource', () => {
  const landBytes = encodeUopLandEntry(makeLandTile(9));
  const staticBytes = encodeStaticArt(makeStaticTile(10, 7, 4));

  const build = async () => {
    const sink = new MemoryWriteSink();
    const writer = new UopContainerWriter(sink, 'v5', 2);
    await writer.writeHeader();
    await writer.writeEntry(hashFileName(uopEntryName('artlegacymul', 0, 'tga')), landBytes, 0);
    await writer.writeEntry(hashFileName(uopEntryName('artlegacymul', 0x4000, 'tga')), staticBytes, 0);
    await writer.complete();
    return sink.toBytes();
  };

  it('reads, edits, and saves through a container rebuild', async () => {
    const bytes = await build();
    const file = new MemoryWritableFile();
    const source = new UopArtSource({
      container: await readUopContainer(new MemoryByteSource(bytes)),
      readEntry: (entry) => readUopEntryData(new MemoryByteSource(bytes), entry),
      file,
      pattern: 'artlegacymul',
      layout: 'v5'
    });

    const land = await source.readLand(0);
    expect(Array.from((land as NonNullable<typeof land>).pixels)).toEqual(
      Array.from((decodeLandTile(landBytes) as NonNullable<ReturnType<typeof decodeLandTile>>).pixels)
    );
    expect(await source.readStatic(1)).toBeNull();
    expect(source.hasStatic(0)).toBe(true);

    const editedStatic = makeStaticTile(55, 9, 9);
    source.writeStatic(0, editedStatic);
    const editedLand = makeLandTile(56);
    source.writeLand(0, editedLand);
    const addedStatic = makeStaticTile(57, 4, 4);
    source.writeStatic(3, addedStatic);

    await source.save();
    expect(source.hasChanges).toBe(false);

    const rebuiltBytes = file.bytes;
    const container = await readUopContainer(new MemoryByteSource(rebuiltBytes));
    expect(container.entryCount).toBe(3);

    const landEntry = entryByIdentifier(container, uopEntryName('artlegacymul', 0, 'tga'));
    const landPayload = await readUopEntryData(
      new MemoryByteSource(rebuiltBytes),
      landEntry as NonNullable<typeof landEntry>
    );
    expect(Array.from(landPayload)).toEqual(Array.from(encodeUopLandEntry(editedLand)));

    const staticEntry = entryByIdentifier(container, uopEntryName('artlegacymul', 0x4000, 'tga'));
    const staticPayload = await readUopEntryData(
      new MemoryByteSource(rebuiltBytes),
      staticEntry as NonNullable<typeof staticEntry>
    );
    expect(Array.from(staticPayload)).toEqual(Array.from(encodeStaticArt(editedStatic)));

    const addedEntry = entryByIdentifier(container, uopEntryName('artlegacymul', 0x4003, 'tga'));
    expect(addedEntry).toBeDefined();
    const addedPayload = await readUopEntryData(
      new MemoryByteSource(rebuiltBytes),
      addedEntry as NonNullable<typeof addedEntry>
    );
    expect(Array.from(addedPayload)).toEqual(Array.from(encodeStaticArt(addedStatic)));
  });
});
