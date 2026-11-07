import { unzlibSync, zlibSync } from 'fflate';

import { BinaryReader } from './binary';
import type { ByteSource } from './byte-source';
import { mythicDecompress } from './mythic';

export const UOP_MAGIC = 0x50594d;
export const UOP_SIGNATURE = 0xfd23ec43;
export const UOP_FILE_HEADER_SIZE = 0x28;
export const UOP_TABLE_ENTRY_SIZE = 34;
export const UOP_BLOCK_HEADER_SIZE = 12;

export interface UopEntry {
  index: number;
  offset: number;
  headerLength: number;
  size: number;
  decompressedSize: number;
  identifier: bigint;
  adler32: number;
  compressionFlag: number;
}

export interface UopContainer {
  version: number;
  entryCount: number;
  entries: UopEntry[];
  byIdentifier: Map<bigint, UopEntry>;
}

export async function readUopContainer(source: ByteSource): Promise<UopContainer> {
  const headerBytes = await source.read(0, UOP_FILE_HEADER_SIZE);
  const header = new BinaryReader(headerBytes, { littleEndian: true });

  const magic = header.readU32();
  if (magic !== UOP_MAGIC) {
    throw new Error(`not a UOP container: magic 0x${magic.toString(16)}`);
  }

  const version = header.readU32();
  const signature = header.readU32();
  if (signature !== UOP_SIGNATURE) {
    throw new Error(`invalid UOP signature 0x${signature.toString(16)}`);
  }

  let nextBlock = header.readU64();
  header.readU32(); // block capacity
  const entryCount = header.readU32();

  const entries: UopEntry[] = [];
  const byIdentifier = new Map<bigint, UopEntry>();
  let index = 0;
  let guard = 0;

  while (nextBlock !== 0n) {
    if (++guard > 100_000) {
      throw new Error('UOP block chain does not terminate');
    }
    const blockOffset = Number(nextBlock);
    if (blockOffset < 0 || blockOffset + UOP_BLOCK_HEADER_SIZE > source.byteLength) {
      throw new RangeError(`UOP block offset ${blockOffset} out of bounds`);
    }

    const blockHeader = await source.read(blockOffset, UOP_BLOCK_HEADER_SIZE);
    const block = new BinaryReader(blockHeader, { littleEndian: true });
    const usedEntries = block.readU32();
    nextBlock = block.readU64();

    if (usedEntries > 0) {
      const tableBytes = await source.read(blockOffset + UOP_BLOCK_HEADER_SIZE, usedEntries * UOP_TABLE_ENTRY_SIZE);
      const table = new BinaryReader(tableBytes, { littleEndian: true });
      for (let i = 0; i < usedEntries; i++) {
        const offset = Number(table.readU64());
        const headerLength = table.readI32();
        const size = table.readI32();
        const decompressedSize = table.readI32();
        const identifier = table.readU64();
        const adler32 = table.readU32();
        const compressionFlag = table.readI16();
        if (offset === 0) {
          continue;
        }
        const entry: UopEntry = {
          index,
          offset,
          headerLength,
          size,
          decompressedSize,
          identifier,
          adler32,
          compressionFlag
        };
        entries.push(entry);
        byIdentifier.set(identifier, entry);
        index++;
      }
    }
  }

  if (entryCount !== entries.length) {
    throw new Error(`UOP declares ${entryCount} entries but table holds ${entries.length}`);
  }

  return { version, entryCount, entries, byIdentifier };
}

export function entryByIdentifier(container: UopContainer, name: string): UopEntry | undefined {
  return container.byIdentifier.get(hashFileName(name));
}

export async function readUopEntryData(source: ByteSource, entry: UopEntry): Promise<Uint8Array> {
  const start = entry.offset + entry.headerLength;
  if (start + entry.size > source.byteLength) {
    throw new RangeError(`UOP entry out of bounds: offset ${start} length ${entry.size}`);
  }
  const payload = await source.read(start, entry.size);
  if (entry.compressionFlag === 0) {
    return payload;
  }
  if (entry.compressionFlag === 1) {
    return unzlibSync(payload);
  }
  if (entry.compressionFlag === 3) {
    return mythicDecompress(unzlibSync(payload));
  }
  throw new Error(`unsupported UOP compression flag ${entry.compressionFlag}`);
}

export function compressUopPayload(data: Uint8Array): Uint8Array {
  return zlibSync(data);
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

export function hashFileName(input: string): bigint {
  let a = (input.length + 0xdeadbeef) >>> 0;
  let b = a;
  let c = a;

  let length = input.length;
  let i = 0;

  while (length > 12) {
    a =
      (a +
        (input.charCodeAt(i) |
          (input.charCodeAt(i + 1) << 8) |
          (input.charCodeAt(i + 2) << 16) |
          (input.charCodeAt(i + 3) << 24))) >>>
      0;
    b =
      (b +
        (input.charCodeAt(i + 4) |
          (input.charCodeAt(i + 5) << 8) |
          (input.charCodeAt(i + 6) << 16) |
          (input.charCodeAt(i + 7) << 24))) >>>
      0;
    c =
      (c +
        (input.charCodeAt(i + 8) |
          (input.charCodeAt(i + 9) << 8) |
          (input.charCodeAt(i + 10) << 16) |
          (input.charCodeAt(i + 11) << 24))) >>>
      0;

    a = (a - c) >>> 0;
    a = (a ^ rotl(c, 4)) >>> 0;
    c = (c + b) >>> 0;
    b = (b - a) >>> 0;
    b = (b ^ rotl(a, 6)) >>> 0;
    a = (a + c) >>> 0;
    c = (c - b) >>> 0;
    c = (c ^ rotl(b, 8)) >>> 0;
    b = (b + a) >>> 0;
    a = (a - c) >>> 0;
    a = (a ^ rotl(c, 16)) >>> 0;
    c = (c + b) >>> 0;
    b = (b - a) >>> 0;
    b = (b ^ rotl(a, 19)) >>> 0;
    a = (a + c) >>> 0;
    c = (c - b) >>> 0;
    c = (c ^ rotl(b, 4)) >>> 0;
    b = (b + a) >>> 0;

    i += 12;
    length -= 12;
  }

  switch (length) {
    case 12:
      c = (c + (input.charCodeAt(i + 11) << 24)) >>> 0;
      c = (c + (input.charCodeAt(i + 10) << 16)) >>> 0;
      c = (c + (input.charCodeAt(i + 9) << 8)) >>> 0;
      c = (c + input.charCodeAt(i + 8)) >>> 0;
      b = (b + (input.charCodeAt(i + 7) << 24)) >>> 0;
      b = (b + (input.charCodeAt(i + 6) << 16)) >>> 0;
      b = (b + (input.charCodeAt(i + 5) << 8)) >>> 0;
      b = (b + input.charCodeAt(i + 4)) >>> 0;
      a = (a + (input.charCodeAt(i + 3) << 24)) >>> 0;
      a = (a + (input.charCodeAt(i + 2) << 16)) >>> 0;
      a = (a + (input.charCodeAt(i + 1) << 8)) >>> 0;
      a = (a + input.charCodeAt(i)) >>> 0;
      break;
    case 11:
      c = (c + (input.charCodeAt(i + 10) << 16)) >>> 0;
      c = (c + (input.charCodeAt(i + 9) << 8)) >>> 0;
      c = (c + input.charCodeAt(i + 8)) >>> 0;
      b = (b + (input.charCodeAt(i + 7) << 24)) >>> 0;
      b = (b + (input.charCodeAt(i + 6) << 16)) >>> 0;
      b = (b + (input.charCodeAt(i + 5) << 8)) >>> 0;
      b = (b + input.charCodeAt(i + 4)) >>> 0;
      a = (a + (input.charCodeAt(i + 3) << 24)) >>> 0;
      a = (a + (input.charCodeAt(i + 2) << 16)) >>> 0;
      a = (a + (input.charCodeAt(i + 1) << 8)) >>> 0;
      a = (a + input.charCodeAt(i)) >>> 0;
      break;
    case 10:
      c = (c + (input.charCodeAt(i + 9) << 8)) >>> 0;
      c = (c + input.charCodeAt(i + 8)) >>> 0;
      b = (b + (input.charCodeAt(i + 7) << 24)) >>> 0;
      b = (b + (input.charCodeAt(i + 6) << 16)) >>> 0;
      b = (b + (input.charCodeAt(i + 5) << 8)) >>> 0;
      b = (b + input.charCodeAt(i + 4)) >>> 0;
      a = (a + (input.charCodeAt(i + 3) << 24)) >>> 0;
      a = (a + (input.charCodeAt(i + 2) << 16)) >>> 0;
      a = (a + (input.charCodeAt(i + 1) << 8)) >>> 0;
      a = (a + input.charCodeAt(i)) >>> 0;
      break;
    case 9:
      c = (c + input.charCodeAt(i + 8)) >>> 0;
      b = (b + (input.charCodeAt(i + 7) << 24)) >>> 0;
      b = (b + (input.charCodeAt(i + 6) << 16)) >>> 0;
      b = (b + (input.charCodeAt(i + 5) << 8)) >>> 0;
      b = (b + input.charCodeAt(i + 4)) >>> 0;
      a = (a + (input.charCodeAt(i + 3) << 24)) >>> 0;
      a = (a + (input.charCodeAt(i + 2) << 16)) >>> 0;
      a = (a + (input.charCodeAt(i + 1) << 8)) >>> 0;
      a = (a + input.charCodeAt(i)) >>> 0;
      break;
    case 8:
      b = (b + (input.charCodeAt(i + 7) << 24)) >>> 0;
      b = (b + (input.charCodeAt(i + 6) << 16)) >>> 0;
      b = (b + (input.charCodeAt(i + 5) << 8)) >>> 0;
      b = (b + input.charCodeAt(i + 4)) >>> 0;
      a = (a + (input.charCodeAt(i + 3) << 24)) >>> 0;
      a = (a + (input.charCodeAt(i + 2) << 16)) >>> 0;
      a = (a + (input.charCodeAt(i + 1) << 8)) >>> 0;
      a = (a + input.charCodeAt(i)) >>> 0;
      break;
    case 7:
      b = (b + (input.charCodeAt(i + 6) << 16)) >>> 0;
      b = (b + (input.charCodeAt(i + 5) << 8)) >>> 0;
      b = (b + input.charCodeAt(i + 4)) >>> 0;
      a = (a + (input.charCodeAt(i + 3) << 24)) >>> 0;
      a = (a + (input.charCodeAt(i + 2) << 16)) >>> 0;
      a = (a + (input.charCodeAt(i + 1) << 8)) >>> 0;
      a = (a + input.charCodeAt(i)) >>> 0;
      break;
    case 6:
      b = (b + (input.charCodeAt(i + 5) << 8)) >>> 0;
      b = (b + input.charCodeAt(i + 4)) >>> 0;
      a = (a + (input.charCodeAt(i + 3) << 24)) >>> 0;
      a = (a + (input.charCodeAt(i + 2) << 16)) >>> 0;
      a = (a + (input.charCodeAt(i + 1) << 8)) >>> 0;
      a = (a + input.charCodeAt(i)) >>> 0;
      break;
    case 5:
      b = (b + input.charCodeAt(i + 4)) >>> 0;
      a = (a + (input.charCodeAt(i + 3) << 24)) >>> 0;
      a = (a + (input.charCodeAt(i + 2) << 16)) >>> 0;
      a = (a + (input.charCodeAt(i + 1) << 8)) >>> 0;
      a = (a + input.charCodeAt(i)) >>> 0;
      break;
    case 4:
      a = (a + (input.charCodeAt(i + 3) << 24)) >>> 0;
      a = (a + (input.charCodeAt(i + 2) << 16)) >>> 0;
      a = (a + (input.charCodeAt(i + 1) << 8)) >>> 0;
      a = (a + input.charCodeAt(i)) >>> 0;
      break;
    case 3:
      a = (a + (input.charCodeAt(i + 2) << 16)) >>> 0;
      a = (a + (input.charCodeAt(i + 1) << 8)) >>> 0;
      a = (a + input.charCodeAt(i)) >>> 0;
      break;
    case 2:
      a = (a + (input.charCodeAt(i + 1) << 8)) >>> 0;
      a = (a + input.charCodeAt(i)) >>> 0;
      break;
    case 1:
      a = (a + input.charCodeAt(i)) >>> 0;
      break;
    case 0:
      return BigInt(c) << 32n;
  }

  c = (c ^ b) >>> 0;
  c = (c - rotl(b, 14)) >>> 0;
  a = (a ^ c) >>> 0;
  a = (a - rotl(c, 11)) >>> 0;
  b = (b ^ a) >>> 0;
  b = (b - rotl(a, 25)) >>> 0;
  c = (c ^ b) >>> 0;
  c = (c - rotl(b, 16)) >>> 0;
  a = (a ^ c) >>> 0;
  a = (a - rotl(c, 4)) >>> 0;
  b = (b ^ a) >>> 0;
  b = (b - rotl(a, 14)) >>> 0;
  c = (c ^ b) >>> 0;
  c = (c - rotl(b, 24)) >>> 0;

  return (BigInt(b) << 32n) | BigInt(c);
}

export function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.byteLength; i++) {
    a = (a + (data[i] as number)) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

export function uopEntryName(pattern: string, index: number, extension: string, pad = 8): string {
  return `build/${pattern}/${String(index).padStart(pad, '0')}.${extension}`;
}
