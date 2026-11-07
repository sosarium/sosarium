import { BlobByteSource } from '@sosarium/core';
import {
  copyRegion,
  type FacetDimensions,
  groupStatics,
  type LandTile,
  MapReader,
  type MapUopChunk,
  type RadarColors,
  radarItemColor,
  radarLandColor,
  renderRadarBlock,
  StaticReader,
  type StaticTile
} from '@sosarium/formats';

import type {
  MapWorkerFacetImageRequest,
  MapWorkerRegionRequest,
  MapWorkerRequest,
  MapWorkerResponse,
  MapWorkerSettings,
  MapWorkerTileRequest
} from './map-worker-protocol';

interface InitMessage {
  type: 'init';
  mapFile: File;
  table: MapUopChunk[] | null;
  dimensions: FacetDimensions;
  staidxFile: File;
  staticsFile: File;
  radarColors: Uint16Array;
  itemHeights: Uint16Array;
  hueColors: Uint16Array;
}

let dimensions: FacetDimensions | null = null;
let mapSource: BlobByteSource | null = null;
let chunkTable: MapUopChunk[] | null = null;
const blockByteCache = new Map<string, Uint8Array>();
const staticCache = new Map<string, StaticTile[][][]>();
const BLOCK_CACHE_LIMIT = 8192;

function remember<T>(cache: Map<string, T>, key: string, value: T, limit: number): T {
  cache.set(key, value);
  if (cache.size > limit) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      cache.delete(oldest);
    }
  }
  return value;
}

function decodeLand(bytes: Uint8Array): LandTile[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tiles: LandTile[] = new Array(64);
  for (let i = 0; i < 64; i++) {
    const base = 4 + i * 3;
    tiles[i] = { id: view.getUint16(base, true), z: view.getInt8(base + 2) };
  }
  return tiles;
}

async function readVirtual(offset: number, length: number): Promise<Uint8Array> {
  const out = new Uint8Array(length);
  if (!mapSource || !chunkTable) {
    return out;
  }
  let written = 0;
  while (written < length) {
    const absolute = offset + written;
    let chunk: MapUopChunk | null = null;
    for (const candidate of chunkTable) {
      if (absolute >= candidate.virtualStart && absolute < candidate.virtualStart + candidate.length) {
        chunk = candidate;
        break;
      }
    }
    if (!chunk) {
      break;
    }
    const within = absolute - chunk.virtualStart;
    const take = Math.min(chunk.length - within, length - written);
    const part = await mapSource.read(chunk.offset + within, take);
    out.set(part, written);
    written += take;
  }
  return out;
}

async function readBlockBytes(x: number, y: number): Promise<Uint8Array> {
  const key = `${x},${y}`;
  const cached = blockByteCache.get(key);
  if (cached) {
    return cached;
  }
  if (!mapReader) {
    return new Uint8Array(196);
  }
  if (!dimensions || !chunkTable) {
    const bytes = await mapReader.readBlockBytes(x, y);
    return remember(blockByteCache, key, bytes, BLOCK_CACHE_LIMIT);
  }
  // Prefetch the surrounding column segment: a viewport touches many consecutive
  // blocks in the same column, so one run read replaces a slice per block.
  const radius = 16;
  const first = Math.max(0, y - radius);
  const last = Math.min(dimensions.blockHeight - 1, y + radius);
  const count = last - first + 1;
  const run = await readVirtual((x * dimensions.blockHeight + first) * 196, count * 196);
  for (let by = first; by <= last; by++) {
    const runKey = `${x},${by}`;
    if (!blockByteCache.has(runKey)) {
      remember(blockByteCache, runKey, run.slice((by - first) * 196, (by - first + 1) * 196), BLOCK_CACHE_LIMIT);
    }
  }
  return blockByteCache.get(key) ?? new Uint8Array(196);
}

async function staticBlock(x: number, y: number): Promise<StaticTile[][][]> {
  const key = `${x},${y}`;
  const cached = staticCache.get(key);
  if (cached) {
    return cached;
  }
  if (!staticReader) {
    return [];
  }
  return remember(staticCache, key, await staticReader.readStaticBlock(x, y), 4096);
}
let mapReader: MapReader | null = null;
let staticReader: StaticReader | null = null;
let radar: RadarColors | null = null;
let itemHeights: Uint16Array | null = null;
let hueColors: Uint16Array | null = null;

function hueRamp(hueIndex: number): Uint16Array | null {
  if (!hueColors || hueIndex < 0) {
    return null;
  }
  const start = hueIndex * 32;
  if (start + 32 > hueColors.length) {
    return null;
  }
  return hueColors.subarray(start, start + 32);
}

self.onmessage = async (
  event: MessageEvent<
    | InitMessage
    | MapWorkerFacetImageRequest
    | MapWorkerRegionRequest
    | MapWorkerTileRequest
    | MapWorkerRequest
    | MapWorkerSettings
  >
) => {
  const message = event.data;
  if (message.type === 'settings') {
    radar = { colors: message.radarColors };
    return;
  }
  if (message.type === 'init') {
    dimensions = message.dimensions;
    mapSource = new BlobByteSource(message.mapFile);
    chunkTable = message.table ?? [];
    mapReader = new MapReader(mapSource, message.dimensions, {
      chunks: message.table ?? [],
      totalLength: 0
    });
    staticReader = new StaticReader(
      new BlobByteSource(message.staidxFile),
      new BlobByteSource(message.staticsFile),
      message.dimensions
    );
    radar = { colors: message.radarColors };
    itemHeights = message.itemHeights;
    hueColors = message.hueColors;
    (self as unknown as Worker).postMessage({ type: 'ready', id: message.type } satisfies MapWorkerResponse);
    return;
  }

  if (message.type === 'mapTile') {
    try {
      const scale = Math.max(1, Math.floor(message.scale));
      const tiles = Math.max(1, Math.floor(message.tiles));
      const size = tiles * scale;
      const rgba = new Uint8ClampedArray(size * size * 4);
      if (dimensions) {
        const localBlocks = new Map<string, Uint8Array>();
        const firstBX = message.originX >> 3;
        const lastBX = (message.originX + tiles - 1) >> 3;
        const firstBY = message.originY >> 3;
        const lastBY = (message.originY + tiles - 1) >> 3;
        const staticsByBlock = new Map<string, StaticTile[][][]>();

        for (let bx = firstBX; bx <= lastBX; bx++) {
          const count = lastBY - firstBY + 1;
          const run = await readVirtual((bx * dimensions.blockHeight + firstBY) * 196, count * 196);
          for (let by = firstBY; by <= lastBY; by++) {
            const key = `${bx},${by}`;
            const bytes = run.slice((by - firstBY) * 196, (by - firstBY + 1) * 196);
            localBlocks.set(key, bytes);
            if (!blockByteCache.has(key)) {
              remember(blockByteCache, key, bytes, BLOCK_CACHE_LIMIT);
            }
            if (message.statics && staticReader) {
              staticsByBlock.set(key, await staticBlock(bx, by));
            }
          }
        }

        for (let ty = 0; ty < tiles; ty++) {
          for (let tx = 0; tx < tiles; tx++) {
            const tileX = message.originX + tx;
            const tileY = message.originY + ty;
            if (tileX < 0 || tileY < 0 || tileX >= dimensions.width || tileY >= dimensions.height) {
              continue;
            }
            const blockKey = `${tileX >> 3},${tileY >> 3}`;
            const blockBytes = localBlocks.get(blockKey);
            if (!blockBytes) {
              continue;
            }
            const tileOffset = 4 + ((tileY & 7) * 8 + (tileX & 7)) * 3;
            const landId = (blockBytes[tileOffset] as number) | ((blockBytes[tileOffset + 1] as number) << 8);
            let color = radar ? radarLandColor(radar, landId) : 0;
            if (message.statics) {
              const list = staticsByBlock.get(blockKey)?.[tileX & 7]?.[tileY & 7];
              if (list && list.length > 0) {
                let top = list[0] as StaticTile;
                for (const candidate of list) {
                  if (candidate.z > top.z) {
                    top = candidate;
                  }
                }
                const itemColor = radar ? radarItemColor(radar, top.id) : 0;
                if (itemColor !== 0) {
                  color = itemColor;
                }
              }
            }
            const r = ((color >> 10) & 0x1f) << 3;
            const g = ((color >> 5) & 0x1f) << 3;
            const b = (color & 0x1f) << 3;
            for (let py = 0; py < scale; py++) {
              for (let px = 0; px < scale; px++) {
                const index = ((ty * scale + py) * size + (tx * scale + px)) * 4;
                rgba[index] = r;
                rgba[index + 1] = g;
                rgba[index + 2] = b;
                rgba[index + 3] = color === 0 ? 0 : 255;
              }
            }
          }
        }
      }
      (self as unknown as Worker).postMessage({
        type: 'mapTile',
        id: message.id,
        originX: message.originX,
        originY: message.originY,
        tiles,
        scale,
        rgba
      } satisfies MapWorkerResponse);
    } catch (cause) {
      (self as unknown as Worker).postMessage({
        type: 'mapTile',
        id: message.id,
        error: cause instanceof Error ? cause.message : 'tile render failed'
      } satisfies MapWorkerResponse);
    }
    return;
  }

  if (message.type === 'facetImage') {
    try {
      if (!mapSource || !chunkTable || !dimensions || !radar) {
        (self as unknown as Worker).postMessage({
          type: 'facetImage',
          id: message.id,
          error: 'worker not initialised'
        } satisfies MapWorkerResponse);
        return;
      }
      const sampleTiles = 4;
      const width = Math.floor(dimensions.width / sampleTiles);
      const height = Math.floor(dimensions.height / sampleTiles);
      const rgba = new Uint8ClampedArray(width * height * 4);
      const total = chunkTable.length;
      let done = 0;

      for (const chunk of chunkTable) {
        const bytes = await mapSource.read(chunk.offset, chunk.length);
        const blockCount = Math.floor(chunk.length / 196);
        const baseIndex = chunk.virtualStart / 196;
        for (let i = 0; i < blockCount; i++) {
          const blockIndex = baseIndex + i;
          const bx = Math.floor(blockIndex / dimensions.blockHeight);
          const by = blockIndex % dimensions.blockHeight;
          if (bx >= dimensions.blockWidth || by >= dimensions.blockHeight) {
            continue;
          }
          const blockBase = i * 196 + 4;
          for (let oy = 0; oy < 8 / sampleTiles; oy++) {
            for (let ox = 0; ox < 8 / sampleTiles; ox++) {
              const tileX = ox * sampleTiles + sampleTiles / 2;
              const tileY = oy * sampleTiles + sampleTiles / 2;
              const offset = blockBase + (tileY * 8 + tileX) * 3;
              const id = (bytes[offset] as number) | ((bytes[offset + 1] as number) << 8);
              const color = radarLandColor(radar, id);
              const outX = bx * (8 / sampleTiles) + ox;
              const outY = by * (8 / sampleTiles) + oy;
              if (outX >= width || outY >= height) {
                continue;
              }
              const index = (outY * width + outX) * 4;
              rgba[index] = ((color >> 10) & 0x1f) << 3;
              rgba[index + 1] = ((color >> 5) & 0x1f) << 3;
              rgba[index + 2] = (color & 0x1f) << 3;
              rgba[index + 3] = 255;
            }
          }
        }
        done++;
        if (done % 8 === 0 || done === total) {
          (self as unknown as Worker).postMessage({
            type: 'facetImage-progress',
            id: message.id,
            done,
            total
          } satisfies MapWorkerResponse);
        }
      }

      (self as unknown as Worker).postMessage({
        type: 'facetImage',
        id: message.id,
        width,
        height,
        sampleTiles,
        rgba
      } satisfies MapWorkerResponse);
    } catch (cause) {
      (self as unknown as Worker).postMessage({
        type: 'facetImage',
        id: message.id,
        error: cause instanceof Error ? cause.message : 'facet image failed'
      } satisfies MapWorkerResponse);
    }
    return;
  }

  if (message.type === 'region') {
    if (!mapReader || !staticReader || !dimensions) {
      (self as unknown as Worker).postMessage({
        type: 'region',
        id: message.id,
        error: 'worker not initialised'
      } satisfies MapWorkerResponse);
      return;
    }
    try {
      const result = await copyRegion(mapReader, staticReader, dimensions, message.request);
      (self as unknown as Worker).postMessage({
        type: 'region',
        id: message.id,
        landEdits: [...result.landEdits.entries()],
        staticEdits: [...result.staticEdits.entries()]
      } satisfies MapWorkerResponse);
    } catch (cause) {
      (self as unknown as Worker).postMessage({
        type: 'region',
        id: message.id,
        error: cause instanceof Error ? cause.message : 'region copy failed'
      } satisfies MapWorkerResponse);
    }
    return;
  }

  if (message.type === 'block') {
    if (!mapReader || !radar) {
      (self as unknown as Worker).postMessage({
        type: 'block',
        id: message.id,
        error: 'worker not initialised'
      } satisfies MapWorkerResponse);
      return;
    }
    try {
      const landBytes = message.landBytes ?? (await readBlockBytes(message.x, message.y));
      const land: LandTile[] = decodeLand(landBytes);
      const statics: StaticTile[][][] | null =
        message.statics !== undefined
          ? message.statics === null
            ? null
            : groupStatics(message.statics)
          : staticReader
            ? await staticBlock(message.x, message.y)
            : null;
      const options = { radar, itemHeights, hueColors: hueRamp };
      const rendered = renderRadarBlock({ land, statics, ...options });
      const noStatics = renderRadarBlock({ land, statics: null, ...options });
      (self as unknown as Worker).postMessage({
        type: 'block',
        id: message.id,
        landBytes,
        land,
        statics,
        radar: rendered,
        radarNoStatics: noStatics
      } satisfies MapWorkerResponse);
    } catch (cause) {
      (self as unknown as Worker).postMessage({
        type: 'block',
        id: message.id,
        error: cause instanceof Error ? cause.message : 'block read failed'
      } satisfies MapWorkerResponse);
    }
  }
};
