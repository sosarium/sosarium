import { BlobByteSource, parseMulIndex } from '@sosarium/core';
import {
  buildMapUop,
  type FacetDimensions,
  MAP_BLOCK_SIZE,
  MapReader,
  mapUopTable,
  rebuildStatics,
  type StaticTile,
  serializeRadarCol
} from '@sosarium/formats';

import { commitFiles, findFile } from './file-access';
import type { SessionState } from './session';

export interface FacetSaveRequest {
  facet: number;
  extended: boolean;
  dimensions: FacetDimensions;
  landEdits: Map<number, Uint8Array>;
  staticEdits: Map<number, StaticTile[] | null>;
  radarColors: Uint16Array | null;
  defrag: boolean;
}

export interface FacetSaveResult {
  files: string[];
  tilesWritten: number;
  blocksWithStatics: number;
}

export async function saveFacet(session: SessionState, request: FacetSaveRequest): Promise<FacetSaveResult> {
  if (session.status !== 'ready' || !session.handle || session.mode !== 'readwrite') {
    throw new Error('this session is read-only');
  }

  const suffix = request.extended ? 'x' : '';
  const mapName = findFile(session, `map${request.facet}${suffix}LegacyMUL.uop`);
  const staidxName = findFile(session, `staidx${request.facet}${suffix}.mul`);
  const staticsName = findFile(session, `statics${request.facet}${suffix}.mul`);
  if (!mapName || !staidxName || !staticsName) {
    throw new Error(`facet ${request.facet} files are incomplete`);
  }

  const writes: { name: string; bytes: Uint8Array }[] = [];
  let tilesWritten = 0;
  let blocksWithStatics = 0;
  const { dimensions } = request;
  const blockCount = dimensions.blockWidth * dimensions.blockHeight;

  if (request.landEdits.size > 0) {
    const mapHandle = await session.handle.getFileHandle(mapName);
    const mapFile = await mapHandle.getFile();
    const source = new BlobByteSource(mapFile);
    const container = await (await import('@sosarium/core')).readUopContainer(source);
    const table = mapUopTable(container.byIdentifier, `map${request.facet}${suffix}LegacyMUL`, container.entryCount);
    const reader = new MapReader(source, dimensions, table);

    const totalBlocks = Math.floor(table.totalLength / MAP_BLOCK_SIZE);
    const trailingBlock = totalBlocks > blockCount ? await reader.readBlockByIndex(blockCount) : null;

    const bytes = await buildMapUop({
      mapId: request.facet,
      blockCount,
      readBlock: (index) => reader.readBlockByIndex(index),
      edits: request.landEdits,
      trailingBlock
    });
    writes.push({ name: mapName, bytes });
  }

  if (request.staticEdits.size > 0 || request.defrag) {
    const indexSource = new BlobByteSource(await (await session.handle.getFileHandle(staidxName)).getFile());
    const staticsSource = new BlobByteSource(await (await session.handle.getFileHandle(staticsName)).getFile());
    const entries = parseMulIndex(await indexSource.read(0, indexSource.byteLength));
    const rebuilt = await rebuildStatics({
      blockWidth: dimensions.blockWidth,
      blockHeight: dimensions.blockHeight,
      entries,
      readStatics: (offset, length) => staticsSource.read(offset, length),
      edits: request.staticEdits,
      preserveExtra: true,
      removeDuplicates: request.defrag,
      sortTiles: request.defrag
    });
    writes.push({ name: staidxName, bytes: rebuilt.index }, { name: staticsName, bytes: rebuilt.statics });
    tilesWritten = rebuilt.tilesWritten;
    blocksWithStatics = rebuilt.blocksWithStatics;
  }

  if (request.radarColors) {
    const radarName = findFile(session, 'radarcol.mul');
    if (radarName) {
      writes.push({ name: radarName, bytes: serializeRadarCol(request.radarColors) });
    }
  }

  await commitFiles(session.handle, writes);
  return { files: writes.map((write) => write.name), tilesWritten, blocksWithStatics };
}

export function setLandTile(block: Uint8Array, position: number, id: number, z: number): Uint8Array {
  const copy = block.slice();
  const view = new DataView(copy.buffer);
  const base = 4 + position * 3;
  view.setUint16(base, id & 0xffff, true);
  view.setInt8(base + 2, Math.max(-128, Math.min(127, z)));
  return copy;
}
