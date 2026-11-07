import {
  entryByIdentifier,
  hashFileName,
  MemoryByteSource,
  MemoryWriteSink,
  parseMulIndex,
  readUopContainer,
  readUopEntryData,
  serializeMulIndex,
  UopContainerWriter,
  uopEntryName
} from '@sosarium/core';
import { hasAssets, loadAsset } from '@sosarium/core/testing';
import { describe, expect, it } from 'vitest';

import type { WritableFile } from '../writable';
import {
  decodeGumpPayload,
  decodeUopGumpEntry,
  encodeGumpPayload,
  encodeUopGumpEntry,
  gumpDimensions,
  gumpExtra
} from './format';
import { GUMP_UOP_PATTERN, MulGumpSource, UopGumpSource } from './source';

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

function patternTile(width: number, height: number, seed: number) {
  const pixels = new Uint16Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const band = (x * 3 + y * 5 + seed) % 17;
      if (band < 4) {
        continue;
      }
      pixels[y * width + x] = 0x8000 | ((x * 511 + y * 287 + seed * 13) & 0x7fff);
    }
  }
  return { width, height, pixels };
}

function pixelSignature(pixels: Uint16Array): number[] {
  return Array.from(pixels);
}

describe('gump format', () => {
  it('round-trips the RLE payload with transparent gaps', () => {
    const tile = patternTile(48, 21, 3);
    const payload = encodeGumpPayload(tile);
    const decoded = decodeGumpPayload(payload, tile.width, tile.height);
    expect(decoded).not.toBeNull();
    expect(pixelSignature((decoded as NonNullable<typeof decoded>).pixels)).toEqual(pixelSignature(tile.pixels));
  });

  it('round-trips a solid row and a fully transparent row', () => {
    const width = 10;
    const height = 2;
    const pixels = new Uint16Array(width * height).fill(0x8c00, 0, width);
    const tile = { width, height, pixels };
    const decoded = decodeGumpPayload(encodeGumpPayload(tile), width, height);
    expect(pixelSignature((decoded as NonNullable<typeof decoded>).pixels)).toEqual(pixelSignature(pixels));
  });

  it('round-trips gump dimensions through the extra word', () => {
    expect(gumpDimensions(gumpExtra(640, 480))).toEqual({ width: 640, height: 480 });
    expect(gumpExtra(80, 40)).toBe((80 << 16) | 40);
  });

  it('round-trips a uop entry with the dimension prefix', () => {
    const tile = patternTile(30, 12, 9);
    const decoded = decodeUopGumpEntry(encodeUopGumpEntry(tile));
    expect(decoded?.width).toBe(30);
    expect(decoded?.height).toBe(12);
    expect(pixelSignature((decoded as NonNullable<typeof decoded>).pixels)).toEqual(pixelSignature(tile.pixels));
  });

  it('rejects malformed payloads', () => {
    expect(() => decodeGumpPayload(new Uint8Array(4), 10, 10)).toThrow(RangeError);
    expect(decodeGumpPayload(new Uint8Array(0), 0, 0)).toBeNull();
    expect(decodeUopGumpEntry(new Uint8Array(4))).toBeNull();
  });
});

describe.skipIf(!hasAssets())('gumps (real client file)', () => {
  const loadSource = async () => {
    const source = loadAsset('gumpartLegacyMUL.uop');
    const container = await readUopContainer(source);
    const gumps = new UopGumpSource({
      container,
      readEntry: (entry) => readUopEntryData(source, entry),
      file: new MemoryWritableFile(),
      layout: 'v4'
    });
    return gumps;
  };

  it('decodes real gumps 0 and 1 with known dimensions', async () => {
    const gumps = await loadSource();
    const first = await gumps.read(0);
    expect(first?.width).toBe(640);
    expect(first?.height).toBe(480);
    const second = await gumps.read(1);
    expect(second?.width).toBe(80);
    expect(second?.height).toBe(40);

    const opaque = (tile: { pixels: Uint16Array }) =>
      tile.pixels.reduce((count, value) => count + (value & 0x8000 ? 1 : 0), 0);
    expect(opaque(first as NonNullable<typeof first>)).toBeGreaterThan(1000);
    expect(opaque(second as NonNullable<typeof second>)).toBeGreaterThan(100);
  });

  it('re-encodes a real mythic-compressed gump to equivalent pixels', async () => {
    const gumps = await loadSource();
    const original = await gumps.read(1);
    expect(original).not.toBeNull();
    const roundTripped = decodeUopGumpEntry(encodeUopGumpEntry(original as NonNullable<typeof original>));
    expect(roundTripped).not.toBeNull();
    expect(pixelSignature((roundTripped as NonNullable<typeof roundTripped>).pixels)).toEqual(
      pixelSignature((original as NonNullable<typeof original>).pixels)
    );
  });
});

describe('MulGumpSource', () => {
  it('reads, edits, and persists gumps through gumpidx.mul', async () => {
    const originalTile = patternTile(20, 6, 1);
    const payload = encodeGumpPayload(originalTile);
    const entries = new Array(4);
    entries[1] = { lookup: 0, length: payload.byteLength, extra: gumpExtra(20, 6) };
    const idxBytes = serializeMulIndex(entries);

    const gumpFile = new MemoryWritableFile(payload);
    const idxFile = new MemoryWritableFile(idxBytes);
    const source = new MulGumpSource({
      idxBytes,
      data: new MemoryByteSource(payload),
      gumpFile,
      idxFile
    });

    expect(source.count).toBe(4);
    expect(source.has(1)).toBe(true);
    expect(source.has(2)).toBe(false);

    const read = await source.read(1);
    expect(read?.width).toBe(20);
    expect(pixelSignature((read as NonNullable<typeof read>).pixels)).toEqual(pixelSignature(originalTile.pixels));

    const edited = patternTile(24, 8, 5);
    source.write(1, edited);
    source.write(2, patternTile(10, 10, 7));
    expect(source.hasChanges).toBe(true);
    await source.save();
    expect(source.hasChanges).toBe(false);

    const reloaded = new MulGumpSource({
      idxBytes: idxFile.bytes,
      data: new MemoryByteSource(gumpFile.bytes),
      gumpFile: new MemoryWritableFile(),
      idxFile: new MemoryWritableFile()
    });
    const editedRead = await reloaded.read(1);
    expect(pixelSignature((editedRead as NonNullable<typeof editedRead>).pixels)).toEqual(
      pixelSignature(edited.pixels)
    );
    const addedRead = await reloaded.read(2);
    expect(addedRead?.width).toBe(10);
    const reparsed = parseMulIndex(idxFile.bytes);
    expect(reparsed[2]).toBeDefined();
  });
});

describe('UopGumpSource', () => {
  it('reads, edits, and rebuilds a container', async () => {
    const first = patternTile(16, 8, 2);
    const sink = new MemoryWriteSink();
    const writer = new UopContainerWriter(sink, 'v4', 2);
    await writer.writeHeader();
    await writer.writeEntry(hashFileName(uopEntryName(GUMP_UOP_PATTERN, 0, 'tga')), encodeUopGumpEntry(first), 0);
    await writer.writeEntry(hashFileName(uopEntryName(GUMP_UOP_PATTERN, 5, 'tga')), encodeUopGumpEntry(first), 0);
    await writer.complete();
    const bytes = sink.toBytes();

    const file = new MemoryWritableFile(bytes);
    const source = new UopGumpSource({
      container: await readUopContainer(new MemoryByteSource(bytes)),
      readEntry: (entry) => readUopEntryData(new MemoryByteSource(bytes), entry),
      file,
      layout: 'v4'
    });

    expect(source.has(0)).toBe(true);
    expect(source.has(5)).toBe(true);
    expect(source.has(1)).toBe(false);
    const read = await source.read(5);
    expect(read?.width).toBe(16);

    const edited = patternTile(12, 12, 8);
    source.write(5, edited);
    source.write(9, edited);
    await source.save();

    const container = await readUopContainer(new MemoryByteSource(file.bytes));
    expect(container.entryCount).toBe(3);

    const entry = entryByIdentifier(container, uopEntryName(GUMP_UOP_PATTERN, 5, 'tga'));
    expect(entry).toBeDefined();
    const payload = await readUopEntryData(new MemoryByteSource(file.bytes), entry as NonNullable<typeof entry>);
    expect(payload).toEqual(encodeUopGumpEntry(edited));

    const added = entryByIdentifier(container, uopEntryName(GUMP_UOP_PATTERN, 9, 'tga'));
    expect(added).toBeDefined();
  });
});
