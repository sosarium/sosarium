import {
  type ByteSource,
  hashFileName,
  MemoryByteSource,
  MemoryWriteSink,
  parseMulIndex,
  readMulEntry,
  type UopContainer,
  UopContainerWriter,
  type UopEntry,
  uopEntryName
} from '@sosarium/core';

import {
  decodeLandTile,
  decodeStaticArt,
  encodeLandTile,
  encodeStaticArt,
  encodeUopLandEntry,
  LAND_COUNT,
  STATIC_COUNT
} from './art';
import {
  decodeGumpPayload,
  decodeUopGumpEntry,
  encodeGumpPayload,
  encodeUopGumpEntry,
  gumpDimensions,
  gumpExtra
} from './gumps';
import {
  buildMapUop,
  deriveFacetDimensions,
  type FacetDimensions,
  MAP_BLOCK_SIZE,
  MapReader,
  mapUopTable
} from './map';

const ART_UOP_PATTERN = 'artlegacymul';
const GUMP_UOP_PATTERN = 'gumpartlegacymul';

export interface MulFileSet {
  idx: Uint8Array;
  mul: Uint8Array;
}

async function writeUop(entries: { name: string; payload: Uint8Array }[]): Promise<Uint8Array> {
  const sink = new MemoryWriteSink();
  const writer = new UopContainerWriter(sink, 'v5', entries.length);
  await writer.writeHeader();
  for (const entry of entries) {
    await writer.writeEntry(hashFileName(entry.name), entry.payload, 0);
  }
  await writer.complete();
  return sink.toBytes();
}

export async function packArtMul(set: MulFileSet): Promise<Uint8Array> {
  const indices = parseMulIndex(set.idx);
  const data = new MemoryByteSource(set.mul);
  const entries: { name: string; payload: Uint8Array }[] = [];
  for (let index = 0; index < indices.length; index++) {
    const entry = indices[index];
    if (!entry) {
      continue;
    }
    const bytes = await readMulEntry(data, entry);
    if (index < LAND_COUNT) {
      const tile = decodeLandTile(bytes);
      if (tile) {
        entries.push({ name: uopEntryName(ART_UOP_PATTERN, index, 'tga'), payload: encodeUopLandEntry(tile) });
      }
    } else {
      const tile = decodeStaticArt(bytes);
      if (tile) {
        entries.push({ name: uopEntryName(ART_UOP_PATTERN, index, 'tga'), payload: encodeStaticArt(tile) });
      }
    }
  }
  return writeUop(entries);
}

export async function unpackArtUop(
  container: UopContainer,
  readEntry: (entry: UopEntry) => Promise<Uint8Array>
): Promise<MulFileSet> {
  const entries: ({ lookup: number; length: number; extra: number } | undefined)[] = new Array(
    LAND_COUNT + STATIC_COUNT
  ).fill(undefined);
  const chunks: Uint8Array[] = [];
  let offset = 0;

  for (let index = 0; index < LAND_COUNT + STATIC_COUNT; index++) {
    const name = uopEntryName(ART_UOP_PATTERN, index, 'tga');
    const entry = container.byIdentifier.get(hashFileName(name));
    if (!entry) {
      continue;
    }
    const payload = await readEntry(entry);
    const tile = index < LAND_COUNT ? decodeLandTile(payload) : decodeStaticArt(payload);
    if (!tile) {
      continue;
    }
    const bytes = index < LAND_COUNT ? encodeLandTile(tile) : encodeStaticArt(tile);
    entries[index] = { lookup: offset, length: bytes.byteLength, extra: 0 };
    chunks.push(bytes);
    offset += bytes.byteLength;
  }

  return { idx: serializeIndex(entries), mul: concatChunks(chunks, offset) };
}

export async function packGumpMul(set: MulFileSet): Promise<Uint8Array> {
  const indices = parseMulIndex(set.idx);
  const data = new MemoryByteSource(set.mul);
  const entries: { name: string; payload: Uint8Array }[] = [];
  for (let index = 0; index < indices.length; index++) {
    const entry = indices[index];
    if (!entry) {
      continue;
    }
    const dims = gumpDimensions(entry.extra);
    const tile = decodeGumpPayload(await readMulEntry(data, entry), dims.width, dims.height);
    if (!tile) {
      continue;
    }
    entries.push({ name: uopEntryName(GUMP_UOP_PATTERN, index, 'tga'), payload: encodeUopGumpEntry(tile) });
  }
  return writeUop(entries);
}

export async function unpackGumpUop(
  container: UopContainer,
  readEntry: (entry: UopEntry) => Promise<Uint8Array>,
  maxIndex = container.entryCount + 32
): Promise<MulFileSet> {
  const entries: ({ lookup: number; length: number; extra: number } | undefined)[] = [];
  const chunks: Uint8Array[] = [];
  let offset = 0;
  for (let index = 0; index < maxIndex; index++) {
    const entry = container.byIdentifier.get(hashFileName(uopEntryName(GUMP_UOP_PATTERN, index, 'tga')));
    if (!entry) {
      entries.push(undefined);
      continue;
    }
    const tile = decodeUopGumpEntry(await readEntry(entry));
    if (!tile) {
      entries.push(undefined);
      continue;
    }
    const bytes = encodeGumpPayload(tile);
    entries.push({ lookup: offset, length: bytes.byteLength, extra: gumpExtra(tile.width, tile.height) });
    chunks.push(bytes);
    offset += bytes.byteLength;
  }

  while (entries.length > 0 && entries[entries.length - 1] === undefined) {
    entries.pop();
  }

  return { idx: serializeIndex(entries), mul: concatChunks(chunks, offset) };
}

export async function packMapMul(mul: Uint8Array, mapId: number): Promise<Uint8Array> {
  const blockCount = Math.floor(mul.byteLength / MAP_BLOCK_SIZE);
  const trailing = mul.byteLength % MAP_BLOCK_SIZE > 0 ? mul.subarray(blockCount * MAP_BLOCK_SIZE) : null;
  return buildMapUop({
    mapId,
    blockCount,
    readBlock: (index) => Promise.resolve(mul.subarray(index * MAP_BLOCK_SIZE, (index + 1) * MAP_BLOCK_SIZE)),
    edits: new Map(),
    trailingBlock: trailing
  });
}

export async function unpackMapUop(
  source: ByteSource,
  container: UopContainer,
  mapId: number,
  facet: number
): Promise<{ mul: Uint8Array; dimensions: FacetDimensions }> {
  const table = mapUopTable(container.byIdentifier, `map${mapId}LegacyMUL`, container.entryCount);
  const dimensions = deriveFacetDimensions(facet, table.totalLength);
  if (!dimensions) {
    throw new Error('could not derive facet dimensions');
  }
  const reader = new MapReader(source, dimensions, table);
  const totalBlocks = Math.floor(table.totalLength / MAP_BLOCK_SIZE);
  const mul = new Uint8Array(totalBlocks * MAP_BLOCK_SIZE);

  for (let index = 0; index < totalBlocks; index++) {
    const block = await reader.readBlockByIndex(index);
    mul.set(block, index * MAP_BLOCK_SIZE);
  }
  return { mul, dimensions };
}

function serializeIndex(entries: ({ lookup: number; length: number; extra: number } | undefined)[]): Uint8Array {
  const bytes = new Uint8Array(entries.length * 12);
  const view = new DataView(bytes.buffer);
  entries.forEach((entry, index) => {
    view.setInt32(index * 12, entry ? entry.lookup : -1, true);
    view.setInt32(index * 12 + 4, entry ? entry.length : -1, true);
    view.setInt32(index * 12 + 8, entry ? entry.extra : -1, true);
  });
  return bytes;
}

function concatChunks(chunks: Uint8Array[], size: number): Uint8Array {
  const out = new Uint8Array(size);
  let position = 0;
  for (const chunk of chunks) {
    out.set(chunk, position);
    position += chunk.byteLength;
  }
  return out;
}
