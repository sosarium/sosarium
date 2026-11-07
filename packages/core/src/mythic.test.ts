import { unzlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { mythicDecompress, peekMythicDecompressedLength, tryMythicDecompress } from './mythic';
import { hasAssets, loadAsset } from './testing';
import { entryByIdentifier, readUopContainer, readUopEntryData, uopEntryName } from './uop';

describe('peekMythicDecompressedLength', () => {
  it('reads the XOR-obfuscated little-endian length', () => {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, 123456 ^ 0x8e2c9a3d, true);
    expect(peekMythicDecompressedLength(bytes)).toBe(123456);
  });

  it('returns 0 for short input', () => {
    expect(peekMythicDecompressedLength(new Uint8Array(2))).toBe(0);
  });
});

describe('tryMythicDecompress', () => {
  it('fails on input shorter than the header', () => {
    expect(tryMythicDecompress(new Uint8Array(2), new Uint8Array(16))).toBe(-1);
  });

  it('fails when the destination is too small', () => {
    const source = new Uint8Array(8);
    new DataView(source.buffer).setUint32(0, 4096 ^ 0x8e2c9a3d, true);
    expect(tryMythicDecompress(source, new Uint8Array(16))).toBe(-1);
  });
});

describe.skipIf(!hasAssets())('mythicDecompress (real client data)', () => {
  it('decodes a compressed gump identically through both APIs', async () => {
    const source = loadAsset('gumpartLegacyMUL.uop');
    const container = await readUopContainer(source);
    const entry = entryByIdentifier(container, uopEntryName('gumpartlegacymul', 1, 'tga'));
    expect(entry).toBeDefined();
    expect(entry?.compressionFlag).toBe(3);

    const payload = await source.read(
      (entry as NonNullable<typeof entry>).offset + (entry as NonNullable<typeof entry>).headerLength,
      (entry as NonNullable<typeof entry>).size
    );
    const mythicStream = unzlibSync(payload);
    expect(mythicStream.byteLength).toBe(entry?.decompressedSize);

    const viaModule = mythicDecompress(mythicStream);
    const viaUop = await readUopEntryData(source, entry as NonNullable<typeof entry>);
    expect(viaModule.byteLength).toBe(viaUop.byteLength);
    expect(Buffer.from(viaModule).equals(Buffer.from(viaUop))).toBe(true);

    const view = new DataView(viaModule.buffer, viaModule.byteOffset);
    expect(view.getInt32(0, true)).toBeGreaterThan(0);
    expect(view.getInt32(4, true)).toBeGreaterThan(0);
  });
});
