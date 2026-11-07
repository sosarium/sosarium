import { unzlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { BinaryWriter } from './binary';
import { MemoryByteSource } from './byte-source';
import { hasAssets, loadAsset } from './testing';
import {
  adler32,
  compressUopPayload,
  entryByIdentifier,
  hashFileName,
  readUopContainer,
  readUopEntryData,
  uopEntryName
} from './uop';

function buildSyntheticContainer(): Uint8Array {
  const storedPayload = new TextEncoder().encode('stored payload');
  const compressedSource = new TextEncoder().encode('compressed payload that is long enough to deflate well');
  const compressedPayload = compressUopPayload(compressedSource);

  const names = ['build/testlegacymul/00000000.dat', 'build/testlegacymul/00000001.dat'];
  const identifiers = names.map((name) => hashFileName(name));

  const capacity = 100;
  const writer = new BinaryWriter(1024, { littleEndian: true });

  writer.writeU32(0x50594d);
  writer.writeU32(4);
  writer.writeU32(0xfd23ec43);
  writer.writeU64(0x28n);
  writer.writeU32(capacity);
  writer.writeU32(2);
  writer.writeU32(0);
  writer.writeU32(0);
  writer.writeU32(0);

  const blockStart = writer.offset;
  expect(blockStart).toBe(0x28);

  writer.writeU32(2);
  writer.writeU64(0n);
  const tableStart = writer.offset;
  writer.writeBytes(new Uint8Array(capacity * 34));
  const payloadStart = writer.offset;

  const storedOffset = payloadStart;
  writer.writeBytes(storedPayload);
  const compressedOffset = writer.offset;
  writer.writeBytes(compressedPayload);

  writer.seek(tableStart);
  writer.writeU64(BigInt(storedOffset));
  writer.writeI32(0);
  writer.writeI32(storedPayload.byteLength);
  writer.writeI32(storedPayload.byteLength);
  writer.writeU64(identifiers[0] as bigint);
  writer.writeU32(adler32(storedPayload));
  writer.writeI16(0);

  writer.writeU64(BigInt(compressedOffset));
  writer.writeI32(0);
  writer.writeI32(compressedPayload.byteLength);
  writer.writeI32(compressedSource.byteLength);
  writer.writeU64(identifiers[1] as bigint);
  writer.writeU32(adler32(compressedPayload));
  writer.writeI16(1);

  return writer.toBytes();
}

describe('hashFileName (Jenkins hashlittle2 port)', () => {
  it('matches the known identifier documented in the C# reference', () => {
    expect(hashFileName('build/multicollection/housing.bin')).toBe(0x126d1e99ddedee0an);
  });

  it('matches the C# reference for art entry names', () => {
    expect(hashFileName('build/artlegacymul/00000000.tga')).toBe(0x99361f7d3a53aea8n);
    expect(hashFileName('build/artlegacymul/00008276.tga')).toBe(0xa35f573c5d562a99n);
  });

  it('returns the seed in the high word for empty input', () => {
    expect(hashFileName('')).toBe(BigInt(0xdeadbeef) << 32n);
  });

  it('produces different hashes for different names', () => {
    const a = hashFileName('build/artlegacymul/00000000.tga');
    const b = hashFileName('build/artlegacymul/00000001.tga');
    expect(a).not.toBe(b);
  });
});

describe('adler32', () => {
  it('matches the canonical test vector', () => {
    expect(adler32(new TextEncoder().encode('Wikipedia'))).toBe(0x11e60398);
  });

  it('returns 1 for empty input', () => {
    expect(adler32(new Uint8Array(0))).toBe(1);
  });
});

describe('uopEntryName', () => {
  it('formats names like the client does', () => {
    expect(uopEntryName('artlegacymul', 8276, 'tga')).toBe('build/artlegacymul/00008276.tga');
    expect(uopEntryName('multicollection', 5, 'bin', 6)).toBe('build/multicollection/000005.bin');
  });
});

describe('readUopContainer (synthetic container)', () => {
  it('reads both entries and decompresses the compressed one', async () => {
    const source = new MemoryByteSource(buildSyntheticContainer());
    const container = await readUopContainer(source);

    expect(container.version).toBe(4);
    expect(container.entryCount).toBe(2);
    expect(container.entries).toHaveLength(2);

    const stored = entryByIdentifier(container, 'build/testlegacymul/00000000.dat');
    expect(stored).toBeDefined();
    const storedData = await readUopEntryData(source, stored as NonNullable<typeof stored>);
    expect(new TextDecoder().decode(storedData)).toBe('stored payload');

    const compressed = entryByIdentifier(container, 'build/testlegacymul/00000001.dat');
    expect(compressed).toBeDefined();
    const compressedData = await readUopEntryData(source, compressed as NonNullable<typeof compressed>);
    expect(new TextDecoder().decode(compressedData)).toBe('compressed payload that is long enough to deflate well');
  });

  it('rejects files with a wrong magic', async () => {
    const source = new MemoryByteSource(new Uint8Array(0x40));
    await expect(readUopContainer(source)).rejects.toThrow('not a UOP container');
  });

  it('rejects a truncated header', async () => {
    const source = new MemoryByteSource(new Uint8Array(8));
    await expect(readUopContainer(source)).rejects.toThrow(RangeError);
  });

  it('rejects an out-of-bounds entry payload', async () => {
    const container = await readUopContainer(new MemoryByteSource(buildSyntheticContainer()));
    const first = container.entries[0];
    expect(first).toBeDefined();
    const broken = { ...(first as NonNullable<typeof first>), size: 1 << 30 };
    const source = new MemoryByteSource(buildSyntheticContainer());
    await expect(readUopEntryData(source, broken)).rejects.toThrow(RangeError);
  });
});

describe.skipIf(!hasAssets())('readUopContainer (real client files)', () => {
  it('parses the sparse artLegacyMUL.uop and resolves present entries', async () => {
    const source = loadAsset('artLegacyMUL.uop');
    const container = await readUopContainer(source);

    expect(container.version).toBe(5);
    expect(container.entryCount).toBeGreaterThan(40000);

    const land = entryByIdentifier(container, uopEntryName('artlegacymul', 0, 'tga'));
    expect(land, 'land art 0 must exist').toBeDefined();
    expect(land?.compressionFlag).toBe(0);

    const item = entryByIdentifier(container, uopEntryName('artlegacymul', 33398, 'tga'));
    expect(item, 'item art 33398 must exist').toBeDefined();
    expect(item?.compressionFlag).toBe(0);

    const data = await readUopEntryData(source, item as NonNullable<typeof item>);
    expect(data.byteLength).toBe(398);
    const width = (data[4] as number) | ((data[5] as number) << 8);
    const height = (data[6] as number) | ((data[7] as number) << 8);
    expect(width).toBe(44);
    expect(height).toBe(27);
  });

  it('parses map0LegacyMUL.uop with 4096-block chunks', async () => {
    const source = loadAsset('map0LegacyMUL.uop');
    const container = await readUopContainer(source);

    const first = entryByIdentifier(container, 'build/map0legacymul/00000000.dat');
    expect(first).toBeDefined();
    expect(first?.compressionFlag).toBe(0);
    expect(first?.size).toBe(4096 * 196);

    const totalBlocks = container.entries.reduce((sum, entry) => sum + entry.size, 0) / 196;
    expect(totalBlocks).toBe(896 * 512 + 1);

    const lastChunk = entryByIdentifier(container, 'build/map0legacymul/00000112.dat');
    expect(lastChunk).toBeDefined();
    expect(lastChunk?.size).toBe((totalBlocks - (container.entryCount - 1) * 4096) * 196);
  });

  it('decompresses compressed gumpart entries consistently with the table', async () => {
    const source = loadAsset('gumpartLegacyMUL.uop');
    const container = await readUopContainer(source);
    expect(container.entryCount).toBeGreaterThan(5000);

    let checked = 0;
    for (const entry of container.entries) {
      if (checked >= 100) {
        break;
      }
      if (entry.compressionFlag === 0) {
        continue;
      }
      checked++;

      const payload = await source.read(entry.offset + entry.headerLength, entry.size);
      const zlibStage = unzlibSync(payload);
      expect(zlibStage.byteLength, `entry ${entry.index} zlib stage length`).toBe(entry.decompressedSize);

      const data = await readUopEntryData(source, entry);
      const view = new DataView(data.buffer, data.byteOffset);
      const width = view.getInt32(0, true);
      const height = view.getInt32(4, true);
      if (data.byteLength > 8) {
        expect(width, `entry ${entry.index} width`).toBeGreaterThan(0);
        expect(height, `entry ${entry.index} height`).toBeGreaterThan(0);
        expect(width).toBeLessThanOrEqual(4096);
        expect(height).toBeLessThanOrEqual(4096);
      } else {
        expect(data.byteLength).toBe(8);
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('parses the sound container', async () => {
    const sounds = await readUopContainer(loadAsset('soundLegacyMUL.uop'));
    expect(sounds.entryCount).toBeGreaterThan(1000);
  });
});
