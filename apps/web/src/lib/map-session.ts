import { BlobByteSource, readUopContainer } from '@sosarium/core';
import { deriveFacetDimensions, type FacetDimensions, mapUopTable, parseRadarCol } from '@sosarium/formats';

import { findFile } from './file-access';
import { getHueDataSource } from './hues-session';
import type { MapWorkerInit } from './map-worker-protocol';
import { type SessionState, sessionStore } from './session';
import { getTileDataSource } from './tiledata-session';

export interface FacetInfo {
  facet: number;
  name: string;
  hasExtended: boolean;
}

export const FACET_NAMES = ['Felucca', 'Trammel', 'Ilshenar', 'Malas', 'Tokuno', 'TerMuur'];

export function listFacets(session: SessionState): FacetInfo[] {
  const facets: FacetInfo[] = [];
  for (let facet = 0; facet <= 5; facet++) {
    if (findFile(session, `map${facet}LegacyMUL.uop`) || findFile(session, `map${facet}.mul`)) {
      facets.push({
        facet,
        name: FACET_NAMES[facet] ?? `Facet ${facet}`,
        hasExtended: Boolean(findFile(session, `map${facet}xLegacyMUL.uop`) || findFile(session, `map${facet}x.mul`))
      });
    }
  }
  return facets;
}

async function sessionFile(session: SessionState, name: string): Promise<File | null> {
  const actual = findFile(session, name);
  if (!actual) {
    return null;
  }
  if (session.filesByName) {
    return session.filesByName.get(actual.toLowerCase()) ?? null;
  }
  if (!session.handle) {
    return null;
  }
  const handle = await session.handle.getFileHandle(actual);
  return handle.getFile();
}

export async function prepareFacetWorker(
  session: SessionState,
  facet: number,
  extended: boolean
): Promise<MapWorkerInit> {
  const suffix = extended ? 'x' : '';
  const mapName = `map${facet}${suffix}LegacyMUL.uop`;
  const mapFile = await sessionFile(session, mapName);
  if (!mapFile) {
    throw new Error(`${mapName} is not available in this session`);
  }

  const container = await readUopContainer(new BlobByteSource(mapFile));
  const table = mapUopTable(container.byIdentifier, `map${facet}${suffix}LegacyMUL`, container.entryCount);
  const dimensions: FacetDimensions | null = deriveFacetDimensions(facet, table.totalLength);
  if (!dimensions) {
    throw new Error(`could not derive ${mapName} dimensions`);
  }

  const staidxName = `staidx${facet}${suffix}.mul`;
  const staticsName = `statics${facet}${suffix}.mul`;
  const staidxFile = await sessionFile(session, staidxName);
  const staticsFile = await sessionFile(session, staticsName);
  if (!staidxFile || !staticsFile) {
    throw new Error(`statics for facet ${facet} are missing (${staidxName}/${staticsName})`);
  }

  const radarFile = await sessionFile(session, 'radarcol.mul');
  const radarColors = radarFile
    ? parseRadarCol(new Uint8Array(await radarFile.arrayBuffer())).colors
    : new Uint16Array(0x8000);

  const tileData = await getTileDataSource();
  const itemHeights = new Uint16Array(0x10000);
  if (tileData) {
    tileData.items.forEach((item, index) => {
      if (index < itemHeights.length) {
        itemHeights[index] = Math.max(0, item.height);
      }
    });
  }

  const hues = await getHueDataSource();
  const hueColors = new Uint16Array((hues?.hues.length ?? 0) * 32);
  hues?.hues.forEach((hue, index) => {
    hueColors.set(hue.colors, index * 32);
  });

  return {
    mapFile,
    table: table.chunks,
    dimensions,
    staidxFile,
    staticsFile,
    radarColors,
    itemHeights,
    hueColors
  };
}

export function sessionReady(): boolean {
  return sessionStore.getState().status === 'ready';
}
