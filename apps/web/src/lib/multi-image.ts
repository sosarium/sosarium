import type { ArtSource, GroupedMultiTiles } from '@sosarium/formats';
import { groupToTiles, type MultiGroup } from '@sosarium/formats';

import { tileToCanvas } from './art-image';

export interface MultiPlacement {
  id: number;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
}

const TILE_STEP = 22;

function placementsFor(group: MultiGroup, grid: GroupedMultiTiles, maximumHeight: number): MultiPlacement[] {
  const placements: MultiPlacement[] = [];
  for (let x = 0; x < group.width; x++) {
    for (let y = 0; y < group.height; y++) {
      for (const component of grid[x]?.[y] ?? []) {
        if (component.z > maximumHeight) {
          continue;
        }
        placements.push({ id: component.id, x, y, z: component.z, width: 0, height: 0 });
      }
    }
  }
  return placements;
}

export async function renderMultiComposition(
  group: MultiGroup,
  art: ArtSource,
  maximumHeight = 300
): Promise<HTMLCanvasElement | null> {
  if (group.width === 0 || group.height === 0) {
    return null;
  }
  const grid = groupToTiles(group);
  const cache = new Map<number, Awaited<ReturnType<ArtSource['readStatic']>>>();

  const readTile = async (id: number) => {
    const existing = cache.get(id);
    if (existing !== undefined) {
      return existing;
    }
    const tile = await art.readStatic(id);
    cache.set(id, tile);
    return tile;
  };

  const placements = placementsFor(group, grid, maximumHeight);
  let xMin = 100000;
  let yMin = 100000;
  let xMax = -100000;
  let yMax = -100000;
  const drawable: { tile: NonNullable<Awaited<ReturnType<ArtSource['readStatic']>>>; px: number; py: number }[] = [];

  for (const placement of placements) {
    const tile = await readTile(placement.id);
    if (!tile) {
      continue;
    }
    let px = (placement.x - placement.y) * TILE_STEP;
    let py = (placement.x + placement.y) * TILE_STEP;
    px -= tile.width >> 1;
    py -= placement.z << 2;
    py -= tile.height;
    drawable.push({ tile, px, py });
    xMin = Math.min(xMin, px);
    yMin = Math.min(yMin, py);
    xMax = Math.max(xMax, px + tile.width);
    yMax = Math.max(yMax, py + tile.height);
  }

  if (drawable.length === 0 || xMax <= xMin || yMax <= yMin) {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = xMax - xMin;
  canvas.height = yMax - yMin;
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }
  context.imageSmoothingEnabled = false;
  for (const item of drawable) {
    context.drawImage(tileToCanvas(item.tile), item.px - xMin, item.py - yMin);
  }
  return canvas;
}
