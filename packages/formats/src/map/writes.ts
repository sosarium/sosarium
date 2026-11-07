import { hashFileName, MemoryWriteSink, type MulEntry, parseMulIndex, UopContainerWriter } from '@sosarium/core';

import { MAP_BLOCK_SIZE, type MapReader, type StaticReader, type StaticTile } from './mapread';

export const CHUNK_BLOCKS = 4096;

function addStaticTile(map: Map<number, StaticTile[]>, blockIndex: number, tile: StaticTile): void {
  const list = map.get(blockIndex);
  if (list) {
    list.push(tile);
  } else {
    map.set(blockIndex, [tile]);
  }
}

export function groupStatics(tiles: StaticTile[]): StaticTile[][][] {
  const grouped: StaticTile[][][] = Array.from({ length: 8 }, () =>
    Array.from({ length: 8 }, () => [] as StaticTile[])
  );
  for (const tile of tiles) {
    grouped[tile.x & 0x7]?.[tile.y & 0x7]?.push(tile);
  }
  return grouped;
}

export function staticsToEdits(statics: StaticTile[][][], blockIndex: number, target: Map<number, StaticTile[]>): void {
  const list: StaticTile[] = [];
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 8; y++) {
      for (const tile of statics[x]?.[y] ?? []) {
        list.push(tile);
      }
    }
  }
  target.set(blockIndex, list);
}

export interface MapUopBuildOptions {
  mapId: number;
  blockCount: number;
  readBlock: (index: number) => Promise<Uint8Array>;
  edits: Map<number, Uint8Array>;
  trailingBlock?: Uint8Array | null;
}

export async function buildMapUop(options: MapUopBuildOptions): Promise<Uint8Array> {
  const trailing = options.trailingBlock ?? null;
  const totalBlocks = options.blockCount + (trailing ? 1 : 0);
  const entryCount = Math.ceil(totalBlocks / CHUNK_BLOCKS);
  const sink = new MemoryWriteSink();
  const writer = new UopContainerWriter(sink, 'v5', entryCount);
  await writer.writeHeader();
  const pattern = `map${options.mapId}legacymul`;

  let chunk = new Uint8Array(CHUNK_BLOCKS * MAP_BLOCK_SIZE);
  let chunkLength = 0;
  let chunkIndex = 0;

  const flush = async () => {
    if (chunkLength === 0) {
      return;
    }
    await writer.writeEntry(
      hashFileName(`build/${pattern}/${String(chunkIndex).padStart(8, '0')}.dat`),
      chunk.slice(0, chunkLength),
      0
    );
    chunkIndex++;
    chunk = new Uint8Array(CHUNK_BLOCKS * MAP_BLOCK_SIZE);
    chunkLength = 0;
  };

  for (let index = 0; index < options.blockCount; index++) {
    const block = options.edits.get(index) ?? (await options.readBlock(index));
    if (block.byteLength !== MAP_BLOCK_SIZE) {
      throw new Error(`land block ${index} is ${block.byteLength} bytes, expected ${MAP_BLOCK_SIZE}`);
    }
    chunk.set(block, chunkLength);
    chunkLength += MAP_BLOCK_SIZE;
    if (chunkLength === chunk.byteLength) {
      await flush();
    }
  }

  if (trailing) {
    chunk.set(trailing, chunkLength);
    chunkLength += MAP_BLOCK_SIZE;
    if (chunkLength === chunk.byteLength) {
      await flush();
    }
  }

  await flush();
  await writer.complete();
  return sink.toBytes();
}

export interface StaticsRebuildOptions {
  blockWidth: number;
  blockHeight: number;
  entries: (MulEntry | undefined)[];
  readStatics: (offset: number, length: number) => Promise<Uint8Array>;
  edits: Map<number, StaticTile[] | null>;
  preserveExtra?: boolean;
  removeDuplicates?: boolean;
  sortTiles?: boolean;
}

export interface StaticsRebuildResult {
  index: Uint8Array;
  statics: Uint8Array;
  blocksWithStatics: number;
  tilesWritten: number;
}

export function dedupeStatics(tiles: StaticTile[]): StaticTile[] {
  const seen = new Set<string>();
  const out: StaticTile[] = [];
  for (const tile of tiles) {
    const key = `${tile.id}:${tile.x}:${tile.y}:${tile.z}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(tile);
  }
  return out;
}

export function sortStatics(tiles: StaticTile[]): StaticTile[] {
  return [...tiles].sort((a, b) => a.y - b.y || a.x - b.x || a.z - b.z || a.id - b.id || a.hue - b.hue);
}

export async function rebuildStatics(options: StaticsRebuildOptions): Promise<StaticsRebuildResult> {
  const blockCount = options.blockWidth * options.blockHeight;
  const index = new Uint8Array(blockCount * 12);
  const view = new DataView(index.buffer);
  const chunks: Uint8Array[] = [];
  let offset = 0;
  let blocksWithStatics = 0;
  let tilesWritten = 0;

  for (let blockIndex = 0; blockIndex < blockCount; blockIndex++) {
    let list: StaticTile[];
    if (options.edits.has(blockIndex)) {
      list = options.edits.get(blockIndex) ?? [];
    } else {
      const entry = options.entries[blockIndex];
      if (!entry) {
        list = [];
      } else {
        const count = Math.floor(entry.length / 7);
        const bytes = await options.readStatics(entry.lookup, count * 7);
        const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        list = new Array(count);
        for (let i = 0; i < count; i++) {
          const base = i * 7;
          list[i] = {
            id: dataView.getUint16(base, true),
            x: bytes[base + 2] as number,
            y: bytes[base + 3] as number,
            z: dataView.getInt8(base + 4),
            hue: dataView.getInt16(base + 5, true)
          };
        }
      }
    }

    if (options.removeDuplicates && list.length > 1) {
      list = dedupeStatics(list);
    }
    if (options.sortTiles && list.length > 1) {
      list = sortStatics(list);
    }

    if (list.length === 0) {
      view.setInt32(blockIndex * 12, -1, true);
      view.setInt32(blockIndex * 12 + 4, -1, true);
      view.setInt32(blockIndex * 12 + 8, -1, true);
      continue;
    }

    const data = new Uint8Array(list.length * 7);
    const dataView = new DataView(data.buffer);
    list.forEach((tile, i) => {
      const base = i * 7;
      dataView.setUint16(base, tile.id, true);
      data[base + 2] = tile.x;
      data[base + 3] = tile.y;
      dataView.setInt8(base + 4, tile.z);
      dataView.setInt16(base + 5, tile.hue, true);
    });

    view.setInt32(blockIndex * 12, offset, true);
    view.setInt32(blockIndex * 12 + 4, data.byteLength, true);
    view.setInt32(blockIndex * 12 + 8, options.preserveExtra ? (options.entries[blockIndex]?.extra ?? 0) : 0, true);
    chunks.push(data);
    offset += data.byteLength;
    tilesWritten += list.length;
    blocksWithStatics++;
  }

  const statics = new Uint8Array(offset);
  let position = 0;
  for (const chunk of chunks) {
    statics.set(chunk, position);
    position += chunk.byteLength;
  }

  return { index, statics, blocksWithStatics, tilesWritten };
}

export interface RegionCopyRequest {
  sourceX: number;
  sourceY: number;
  width: number;
  height: number;
  targetX: number;
  targetY: number;
}

export interface RegionCopyResult {
  landEdits: Map<number, Uint8Array>;
  staticEdits: Map<number, StaticTile[]>;
}

export async function copyRegion(
  map: MapReader,
  statics: StaticReader,
  dimensions: { blockWidth: number; blockHeight: number },
  request: RegionCopyRequest
): Promise<RegionCopyResult> {
  const landEdits = new Map<number, Uint8Array>();
  const staticEdits = new Map<number, StaticTile[]>();
  const { blockWidth, blockHeight } = dimensions;

  for (let dx = 0; dx < request.width; dx++) {
    for (let dy = 0; dy < request.height; dy++) {
      const sourceBlockX = request.sourceX + dx;
      const sourceBlockY = request.sourceY + dy;
      const targetBlockX = request.targetX + dx;
      const targetBlockY = request.targetY + dy;
      if (
        sourceBlockX < 0 ||
        sourceBlockY < 0 ||
        sourceBlockX >= blockWidth ||
        sourceBlockY >= blockHeight ||
        targetBlockX < 0 ||
        targetBlockY < 0 ||
        targetBlockX >= blockWidth ||
        targetBlockY >= blockHeight
      ) {
        continue;
      }

      const targetIndex = targetBlockX * blockHeight + targetBlockY;
      landEdits.set(targetIndex, await map.readLandBlockBytes(sourceBlockX, sourceBlockY));
      staticsToEdits(await statics.readStaticBlock(sourceBlockX, sourceBlockY), targetIndex, staticEdits);
    }
  }

  return { landEdits, staticEdits };
}

export function parseStaticsIndex(bytes: Uint8Array): (MulEntry | undefined)[] {
  return parseMulIndex(bytes);
}

export { addStaticTile };
