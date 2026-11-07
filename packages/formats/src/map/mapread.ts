import { type ByteSource, hashFileName, type MulEntry, parseMulIndex } from '@sosarium/core';

export const MAP_BLOCK_SIZE = 196;
export const BLOCK_HEADER_SIZE = 4;

export interface LandTile {
  id: number;
  z: number;
}

export interface StaticTile {
  id: number;
  x: number;
  y: number;
  z: number;
  hue: number;
}

export interface MapUopChunk {
  virtualStart: number;
  offset: number;
  length: number;
}

export interface MapUopTable {
  chunks: MapUopChunk[];
  totalLength: number;
}

export function mapUopTable(
  byIdentifier: Map<bigint, { offset: number; headerLength: number; size: number; compressionFlag: number }>,
  pattern: string,
  entryCount: number
): MapUopTable {
  const chunks: MapUopChunk[] = [];
  let virtualStart = 0;
  for (let index = 0; index < entryCount; index++) {
    const name = `build/${pattern.toLowerCase()}/${String(index).padStart(8, '0')}.dat`;
    const entry = byIdentifier.get(hashFileName(name));
    if (!entry || entry.size === 0) {
      continue;
    }
    chunks.push({ virtualStart, offset: entry.offset + entry.headerLength, length: entry.size });
    virtualStart += entry.size;
  }
  return { chunks, totalLength: virtualStart };
}

export const FACET_HEIGHTS: Record<number, number> = {
  0: 4096,
  1: 4096,
  2: 1600,
  3: 2048,
  4: 1448,
  5: 4096
};

export interface FacetDimensions {
  width: number;
  height: number;
  blockWidth: number;
  blockHeight: number;
}

export function deriveFacetDimensions(facet: number, totalLength: number): FacetDimensions | null {
  const height = FACET_HEIGHTS[facet];
  if (!height) {
    return null;
  }
  const blockHeight = height >> 3;
  const blocks = Math.floor(totalLength / MAP_BLOCK_SIZE);
  const blockWidth = Math.floor(blocks / blockHeight);
  if (blockWidth <= 0) {
    return null;
  }
  return { width: blockWidth << 3, height, blockWidth, blockHeight };
}

export class MapReader {
  private readonly chunks: MapUopChunk[] | null;

  constructor(
    private readonly data: ByteSource,
    private readonly dimensions: FacetDimensions,
    table: MapUopTable | null
  ) {
    this.chunks = table ? table.chunks : null;
  }

  private physicalOffset(virtualOffset: number): number | null {
    if (!this.chunks) {
      return virtualOffset;
    }
    for (const chunk of this.chunks) {
      if (virtualOffset < chunk.virtualStart + chunk.length) {
        return chunk.offset + (virtualOffset - chunk.virtualStart);
      }
    }
    return null;
  }

  async readBlockByIndex(index: number): Promise<Uint8Array> {
    const out = new Uint8Array(MAP_BLOCK_SIZE);
    if (index < 0) {
      return out;
    }
    const physical = this.physicalOffset(index * MAP_BLOCK_SIZE);
    if (physical === null || physical + MAP_BLOCK_SIZE > this.data.byteLength) {
      return out;
    }
    const bytes = await this.data.read(physical, MAP_BLOCK_SIZE);
    out.set(bytes);
    return out;
  }

  async readLandBlockBytes(blockX: number, blockY: number): Promise<Uint8Array> {
    const { blockWidth, blockHeight } = this.dimensions;
    if (blockX < 0 || blockY < 0 || blockX >= blockWidth || blockY >= blockHeight) {
      return new Uint8Array(MAP_BLOCK_SIZE);
    }
    return this.readBlockByIndex(blockX * blockHeight + blockY);
  }

  readBlockBytes(blockX: number, blockY: number): Promise<Uint8Array> {
    return this.readLandBlockBytes(blockX, blockY);
  }

  async readLandBlock(blockX: number, blockY: number): Promise<LandTile[]> {
    const bytes = await this.readLandBlockBytes(blockX, blockY);
    const view = new DataView(bytes.buffer);
    const tiles: LandTile[] = new Array(64);
    for (let i = 0; i < 64; i++) {
      const base = BLOCK_HEADER_SIZE + i * 3;
      tiles[i] = { id: view.getUint16(base, true), z: view.getInt8(base + 2) };
    }
    return tiles;
  }
}

export class StaticReader {
  private entries: (MulEntry | undefined)[] | null = null;

  constructor(
    private readonly indexSource: ByteSource,
    private readonly dataSource: ByteSource,
    private readonly dimensions: FacetDimensions
  ) {}

  private async loadIndex(): Promise<(MulEntry | undefined)[]> {
    if (this.entries) {
      return this.entries;
    }
    const bytes = await this.indexSource.read(0, this.indexSource.byteLength);
    this.entries = parseMulIndex(bytes);
    return this.entries;
  }

  async readStaticBlock(blockX: number, blockY: number): Promise<StaticTile[][][]> {
    const { blockWidth, blockHeight } = this.dimensions;
    const empty: StaticTile[][][] = Array.from({ length: 8 }, () =>
      Array.from({ length: 8 }, () => [] as StaticTile[])
    );
    if (blockX < 0 || blockY < 0 || blockX >= blockWidth || blockY >= blockHeight) {
      return empty;
    }
    const entries = await this.loadIndex();
    const entry = entries[blockX * blockHeight + blockY];
    if (!entry) {
      return empty;
    }
    const count = Math.floor(entry.length / 7);
    if (count === 0) {
      return empty;
    }
    const bytes = await this.dataSource.read(entry.lookup, count * 7);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i < count; i++) {
      const base = i * 7;
      const tile: StaticTile = {
        id: view.getUint16(base, true),
        x: bytes[base + 2] as number,
        y: bytes[base + 3] as number,
        z: view.getInt8(base + 4),
        hue: view.getInt16(base + 5, true)
      };
      empty[tile.x & 0x7]?.[tile.y & 0x7]?.push(tile);
    }
    return empty;
  }
}
