import { BinaryReader, BinaryWriter } from './binary';
import type { ByteSource } from './byte-source';

export const MUL_INDEX_ENTRY_SIZE = 12;

export interface MulEntry {
  lookup: number;
  length: number;
  extra: number;
}

export function parseMulIndex(bytes: Uint8Array): (MulEntry | undefined)[] {
  if (bytes.byteLength % MUL_INDEX_ENTRY_SIZE !== 0) {
    throw new Error(`invalid mul index: ${bytes.byteLength} bytes is not a multiple of ${MUL_INDEX_ENTRY_SIZE}`);
  }
  const count = bytes.byteLength / MUL_INDEX_ENTRY_SIZE;
  const reader = new BinaryReader(bytes, { littleEndian: true });
  const entries: (MulEntry | undefined)[] = new Array(count);

  for (let i = 0; i < count; i++) {
    const lookup = reader.readI32();
    const length = reader.readI32();
    const extra = reader.readI32();
    entries[i] = lookup === -1 || length <= 0 ? undefined : { lookup, length, extra };
  }

  return entries;
}

export function serializeMulIndex(entries: (MulEntry | undefined)[]): Uint8Array {
  const writer = new BinaryWriter(entries.length * MUL_INDEX_ENTRY_SIZE, { littleEndian: true });
  for (const entry of entries) {
    if (entry) {
      writer.writeI32(entry.lookup);
      writer.writeI32(entry.length);
      writer.writeI32(entry.extra);
    } else {
      writer.writeI32(-1);
      writer.writeI32(-1);
      writer.writeI32(-1);
    }
  }
  return writer.toBytes();
}

export async function readMulEntry(source: ByteSource, entry: MulEntry): Promise<Uint8Array> {
  if (entry.lookup < 0 || entry.lookup + entry.length > source.byteLength) {
    throw new RangeError(`mul entry out of bounds: offset ${entry.lookup} length ${entry.length}`);
  }
  return source.read(entry.lookup, entry.length);
}
