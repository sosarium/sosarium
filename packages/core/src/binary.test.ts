import { describe, expect, it } from 'vitest';

import { BinaryReader, BinaryWriter } from './binary';

describe('BinaryWriter / BinaryReader round trips', () => {
  it('round-trips big-endian values', () => {
    const writer = new BinaryWriter();
    writer.writeU8(0xab);
    writer.writeI8(-5);
    writer.writeU16(0xbeef);
    writer.writeI16(-300);
    writer.writeU32(0xdeadbeef);
    writer.writeI32(-123456);
    writer.writeU64(0x1122334455667788n);
    writer.writeI64(-1n);
    writer.writeAscii('UO', 4);
    writer.writeAsciiNullTerminated('cliloc');
    writer.writeUtf16('no');

    const bytes = writer.toBytes();
    expect(bytes[0]).toBe(0xab);
    expect(bytes[1]).toBe(0xfb);

    const reader = new BinaryReader(bytes);
    expect(reader.readU8()).toBe(0xab);
    expect(reader.readI8()).toBe(-5);
    expect(reader.readU16()).toBe(0xbeef);
    expect(reader.readI16()).toBe(-300);
    expect(reader.readU32()).toBe(0xdeadbeef);
    expect(reader.readI32()).toBe(-123456);
    expect(reader.readU64()).toBe(0x1122334455667788n);
    expect(reader.readI64()).toBe(-1n);
    expect(reader.readAscii(4)).toBe('UO');
    expect(reader.readAsciiNullTerminated()).toBe('cliloc');
    expect(reader.readUtf16(2)).toBe('no');
  });

  it('round-trips little-endian values', () => {
    const writer = new BinaryWriter(16, { littleEndian: true });
    writer.writeU16(0xbeef);
    writer.writeU32(0xdeadbeef);
    writer.writeU64(0x126d1e99ddedee0an);

    const bytes = writer.toBytes();
    expect(bytes[0]).toBe(0xef);
    expect(bytes[1]).toBe(0xbe);
    expect(bytes[2]).toBe(0xef);
    expect(bytes[3]).toBe(0xbe);

    const reader = new BinaryReader(bytes, { littleEndian: true });
    expect(reader.readU16()).toBe(0xbeef);
    expect(reader.readU32()).toBe(0xdeadbeef);
    expect(reader.readU64()).toBe(0x126d1e99ddedee0an);
  });

  it('truncates ascii strings to their fixed length with NUL padding', () => {
    const writer = new BinaryWriter();
    writer.writeAscii('toolong', 4);
    expect(Array.from(writer.toBytes())).toEqual([0x74, 0x6f, 0x6f, 0x6c]);
  });

  it('reads up to the first NUL in fixed-length ascii', () => {
    const writer = new BinaryWriter();
    writer.writeAscii('hi', 8);
    expect(new BinaryReader(writer.toBytes()).readAscii(8)).toBe('hi');
  });

  it('grows beyond the initial capacity', () => {
    const writer = new BinaryWriter(2);
    for (let i = 0; i < 1000; i++) {
      writer.writeU16(i);
    }
    const reader = new BinaryReader(writer.toBytes());
    for (let i = 0; i < 1000; i++) {
      expect(reader.readU16()).toBe(i);
    }
  });
});

describe('BinaryReader bounds checking', () => {
  it('throws when reading past the end', () => {
    const reader = new BinaryReader(new Uint8Array([1, 2]));
    expect(() => reader.readU32()).toThrow(RangeError);
  });

  it('throws when seeking out of range', () => {
    const reader = new BinaryReader(new Uint8Array([1, 2]));
    expect(() => reader.seek(5)).toThrow(RangeError);
    expect(() => reader.seek(-1)).toThrow(RangeError);
  });

  it('throws when skipping past the end', () => {
    const reader = new BinaryReader(new Uint8Array([1, 2, 3]));
    expect(() => reader.skip(4)).toThrow(RangeError);
  });

  it('throws when a fixed-length string runs off the end', () => {
    const reader = new BinaryReader(new Uint8Array([1, 2, 3]));
    expect(() => reader.readAscii(4)).toThrow(RangeError);
  });
});
