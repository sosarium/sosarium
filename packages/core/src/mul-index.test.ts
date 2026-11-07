import { describe, expect, it } from 'vitest';

import { BinaryWriter } from './binary';
import { MemoryByteSource } from './byte-source';
import { parseMulIndex, readMulEntry, serializeMulIndex } from './mul-index';

describe('parseMulIndex / serializeMulIndex', () => {
  it('round-trips entries and treats -1 lookups as empty', () => {
    const writer = new BinaryWriter(36, { littleEndian: true });
    writer.writeI32(100);
    writer.writeI32(20);
    writer.writeI32(0);
    writer.writeI32(-1);
    writer.writeI32(-1);
    writer.writeI32(-1);
    writer.writeI32(500);
    writer.writeI32(1);
    writer.writeI32(9);

    const entries = parseMulIndex(writer.toBytes());
    expect(entries).toHaveLength(3);
    expect(entries[0]).toEqual({ lookup: 100, length: 20, extra: 0 });
    expect(entries[1]).toBeUndefined();
    expect(entries[2]).toEqual({ lookup: 500, length: 1, extra: 9 });

    const roundTripped = parseMulIndex(serializeMulIndex(entries));
    expect(roundTripped).toEqual(entries);
  });

  it('parses little-endian index bytes like the real anim.idx', () => {
    const bytes = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x68, 0xbc, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    expect(parseMulIndex(bytes)[0]).toEqual({ lookup: 0, length: 0xbc68, extra: 0 });
  });

  it('rejects byte lengths that are not a multiple of 12', () => {
    expect(() => parseMulIndex(new Uint8Array(13))).toThrow('not a multiple of 12');
  });

  it('treats zero-length entries as empty', () => {
    const writer = new BinaryWriter(12, { littleEndian: true });
    writer.writeI32(42);
    writer.writeI32(0);
    writer.writeI32(0);
    expect(parseMulIndex(writer.toBytes())[0]).toBeUndefined();
  });
});

describe('readMulEntry', () => {
  it('reads the entry payload at its lookup offset', async () => {
    const source = new MemoryByteSource(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]));
    const data = await readMulEntry(source, { lookup: 2, length: 4, extra: 0 });
    expect(Array.from(data)).toEqual([2, 3, 4, 5]);
  });

  it('throws when the entry extends past the file', async () => {
    const source = new MemoryByteSource(new Uint8Array(8));
    await expect(readMulEntry(source, { lookup: 6, length: 4, extra: 0 })).rejects.toThrow(RangeError);
  });
});
