import { BinaryReader, BinaryWriter } from '@sosarium/core';

export type TileDataFormat = 'old' | 'new';

export interface LandTileData {
  name: string;
  flags: bigint;
  textureId: number;
}

export interface ItemTileData {
  name: string;
  flags: bigint;
  weight: number;
  quality: number;
  miscData: number;
  unk2: number;
  quantity: number;
  animation: number;
  unk3: number;
  hue: number;
  stackingOffset: number;
  value: number;
  height: number;
}

export interface TileDataFile {
  format: TileDataFormat;
  landHeaders: number[];
  itemHeaders: number[];
  land: LandTileData[];
  items: ItemTileData[];
}

export const LAND_TILE_COUNT = 0x4000;
const LAND_BLOCKS = LAND_TILE_COUNT / 32;
const RECORDS_PER_BLOCK = 32;
const NAME_BYTES = 20;

const LAND_RECORD_SIZE = { old: 26, new: 30 } as const;
const ITEM_RECORD_SIZE = { old: 37, new: 41 } as const;
const BLOCK_HEADER = 4;

export function detectTileDataFormat(bytes: Uint8Array): TileDataFormat {
  const candidates: TileDataFormat[] = [];
  for (const format of ['new', 'old'] as const) {
    const landBytes = LAND_BLOCKS * (BLOCK_HEADER + RECORDS_PER_BLOCK * LAND_RECORD_SIZE[format]);
    const blockBytes = BLOCK_HEADER + RECORDS_PER_BLOCK * ITEM_RECORD_SIZE[format];
    const remaining = bytes.byteLength - landBytes;
    if (remaining > 0 && remaining % blockBytes === 0) {
      candidates.push(format);
    }
  }
  if (candidates.length === 0) {
    throw new Error(`not a tiledata.mul file: ${bytes.byteLength} bytes`);
  }
  return candidates[0] as TileDataFormat;
}

export function parseTileData(bytes: Uint8Array): TileDataFile {
  const format = detectTileDataFormat(bytes);
  const reader = new BinaryReader(bytes, { littleEndian: true });

  const landHeaders: number[] = new Array(LAND_BLOCKS);
  const land: LandTileData[] = new Array(LAND_TILE_COUNT);

  for (let block = 0; block < LAND_BLOCKS; block++) {
    landHeaders[block] = reader.readI32();
    for (let i = 0; i < RECORDS_PER_BLOCK; i++) {
      const flags = format === 'new' ? reader.readU64() : BigInt(reader.readU32());
      const textureId = reader.readU16();
      const name = reader.readAscii(NAME_BYTES);
      land[block * RECORDS_PER_BLOCK + i] = { name, flags, textureId };
    }
  }

  const blockBytes = BLOCK_HEADER + RECORDS_PER_BLOCK * ITEM_RECORD_SIZE[format];
  const itemBlocks = (bytes.byteLength - reader.offset) / blockBytes;
  const itemHeaders: number[] = new Array(itemBlocks);
  const items: ItemTileData[] = new Array(itemBlocks * RECORDS_PER_BLOCK);

  for (let block = 0; block < itemBlocks; block++) {
    itemHeaders[block] = reader.readI32();
    for (let i = 0; i < RECORDS_PER_BLOCK; i++) {
      const flags = format === 'new' ? reader.readU64() : BigInt(reader.readU32());
      const weight = reader.readU8();
      const quality = reader.readU8();
      const miscData = reader.readI16();
      const unk2 = reader.readU8();
      const quantity = reader.readU8();
      const animation = reader.readI16();
      const unk3 = reader.readU8();
      const hue = reader.readU8();
      const stackingOffset = reader.readU8();
      const value = reader.readU8();
      const height = reader.readU8();
      const name = reader.readAscii(NAME_BYTES);
      items[block * RECORDS_PER_BLOCK + i] = {
        name,
        flags,
        weight,
        quality,
        miscData,
        unk2,
        quantity,
        animation,
        unk3,
        hue,
        stackingOffset,
        value,
        height
      };
    }
  }

  return { format, landHeaders, itemHeaders, land, items };
}

export function serializeTileData(file: TileDataFile): Uint8Array {
  const writer = new BinaryWriter(1024, { littleEndian: true });

  for (let block = 0; block < LAND_BLOCKS; block++) {
    writer.writeI32(file.landHeaders[block] ?? 0);
    for (let i = 0; i < RECORDS_PER_BLOCK; i++) {
      const tile = file.land[block * RECORDS_PER_BLOCK + i] as LandTileData;
      if (file.format === 'new') {
        writer.writeU64(tile.flags);
      } else {
        writer.writeU32(Number(tile.flags & 0xffffffffn));
      }
      writer.writeU16(tile.textureId);
      writer.writeAscii(tile.name, NAME_BYTES);
    }
  }

  const itemBlocks = file.items.length / RECORDS_PER_BLOCK;
  for (let block = 0; block < itemBlocks; block++) {
    writer.writeI32(file.itemHeaders[block] ?? 0);
    for (let i = 0; i < RECORDS_PER_BLOCK; i++) {
      const tile = file.items[block * RECORDS_PER_BLOCK + i] as ItemTileData;
      if (file.format === 'new') {
        writer.writeU64(tile.flags);
      } else {
        writer.writeU32(Number(tile.flags & 0xffffffffn));
      }
      writer.writeU8(tile.weight);
      writer.writeU8(tile.quality);
      writer.writeI16(tile.miscData);
      writer.writeU8(tile.unk2);
      writer.writeU8(tile.quantity);
      writer.writeI16(tile.animation);
      writer.writeU8(tile.unk3);
      writer.writeU8(tile.hue);
      writer.writeU8(tile.stackingOffset);
      writer.writeU8(tile.value);
      writer.writeU8(tile.height);
      writer.writeAscii(tile.name, NAME_BYTES);
    }
  }

  return writer.toBytes();
}
