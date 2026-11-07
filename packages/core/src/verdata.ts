import { BinaryReader, BinaryWriter } from './binary';

export interface VerdataPatch {
  file: number;
  index: number;
  lookup: number;
  length: number;
  extra: number;
}

export function parseVerdata(bytes: Uint8Array): VerdataPatch[] {
  const reader = new BinaryReader(bytes, { littleEndian: true });
  const count = reader.readI32();
  if (count < 0 || count * 20 > bytes.byteLength - 4) {
    throw new Error(`invalid verdata.mul: declared ${count} patches`);
  }
  const patches: VerdataPatch[] = new Array(count);
  for (let i = 0; i < count; i++) {
    patches[i] = {
      file: reader.readI32(),
      index: reader.readI32(),
      lookup: reader.readI32(),
      length: reader.readI32(),
      extra: reader.readI32()
    };
  }
  return patches;
}

export function serializeVerdata(patches: VerdataPatch[]): Uint8Array {
  const writer = new BinaryWriter(4 + patches.length * 20, { littleEndian: true });
  writer.writeI32(patches.length);
  for (const patch of patches) {
    writer.writeI32(patch.file);
    writer.writeI32(patch.index);
    writer.writeI32(patch.lookup);
    writer.writeI32(patch.length);
    writer.writeI32(patch.extra);
  }
  return writer.toBytes();
}
