import type { MulEntry } from '@sosarium/core';

import type { ArtTile } from './art';
import type { HueFile } from './hues';
import type { TileDataFile } from './tiledata';

export interface FieldDiff {
  index: number;
  field: string;
  a: unknown;
  b: unknown;
}

export interface TiledataDiff {
  landChanged: number;
  itemChanged: number;
  landSamples: FieldDiff[];
  itemSamples: FieldDiff[];
}

const SAMPLE_LIMIT = 100;

export function diffTiledata(a: TileDataFile, b: TileDataFile): TiledataDiff {
  const result: TiledataDiff = { landChanged: 0, itemChanged: 0, landSamples: [], itemSamples: [] };

  const landCount = Math.min(a.land.length, b.land.length);
  for (let index = 0; index < landCount; index++) {
    const left = a.land[index];
    const right = b.land[index];
    if (!left || !right) {
      continue;
    }
    const fields: [string, unknown, unknown][] = [
      ['name', left.name, right.name],
      ['flags', left.flags, right.flags],
      ['textureId', left.textureId, right.textureId]
    ];
    const changed = fields.filter(([, leftValue, rightValue]) => leftValue !== rightValue);
    if (changed.length === 0) {
      continue;
    }
    result.landChanged++;
    for (const [field, leftValue, rightValue] of changed) {
      if (result.landSamples.length < SAMPLE_LIMIT) {
        result.landSamples.push({ index, field, a: leftValue, b: rightValue });
      }
    }
  }

  const itemCount = Math.min(a.items.length, b.items.length);
  for (let index = 0; index < itemCount; index++) {
    const left = a.items[index];
    const right = b.items[index];
    if (!left || !right) {
      continue;
    }
    const fields: [string, unknown, unknown][] = [
      ['name', left.name, right.name],
      ['flags', left.flags, right.flags],
      ['height', left.height, right.height],
      ['weight', left.weight, right.weight],
      ['animation', left.animation, right.animation]
    ];
    const changed = fields.filter(([, leftValue, rightValue]) => leftValue !== rightValue);
    if (changed.length === 0) {
      continue;
    }
    result.itemChanged++;
    for (const [field, leftValue, rightValue] of changed) {
      if (result.itemSamples.length < SAMPLE_LIMIT) {
        result.itemSamples.push({ index, field, a: leftValue, b: rightValue });
      }
    }
  }

  return result;
}

export interface HuesDiff {
  changed: number;
  samples: FieldDiff[];
}

export function diffHues(a: HueFile, b: HueFile): HuesDiff {
  const result: HuesDiff = { changed: 0, samples: [] };
  const count = Math.min(a.hues.length, b.hues.length);
  for (let index = 0; index < count; index++) {
    const left = a.hues[index];
    const right = b.hues[index];
    if (!left || !right) {
      continue;
    }
    if (left.name !== right.name) {
      result.changed++;
      if (result.samples.length < SAMPLE_LIMIT) {
        result.samples.push({ index, field: 'name', a: left.name, b: right.name });
      }
    }
    for (let slot = 0; slot < 32; slot++) {
      if (left.colors[slot] !== right.colors[slot]) {
        result.changed++;
        if (result.samples.length < SAMPLE_LIMIT) {
          result.samples.push({ index, field: `color[${slot}]`, a: left.colors[slot], b: right.colors[slot] });
        }
        break;
      }
    }
  }
  return result;
}

export interface IndexTableDiff {
  onlyA: number;
  onlyB: number;
  differingLength: number;
  same: number;
}

export function diffIndexTables(a: (MulEntry | undefined)[], b: (MulEntry | undefined)[]): IndexTableDiff {
  const result: IndexTableDiff = { onlyA: 0, onlyB: 0, differingLength: 0, same: 0 };
  const count = Math.max(a.length, b.length);
  for (let index = 0; index < count; index++) {
    const left = a[index];
    const right = b[index];
    if (left && !right) {
      result.onlyA++;
    } else if (!left && right) {
      result.onlyB++;
    } else if (left && right) {
      if (left.length !== right.length) {
        result.differingLength++;
      } else {
        result.same++;
      }
    }
  }
  return result;
}

export interface SampleComparison {
  index: number;
  equal: boolean;
  a: { width: number; height: number } | null;
  b: { width: number; height: number } | null;
}

export async function compareSamples(
  readA: (index: number) => Promise<ArtTile | null>,
  readB: (index: number) => Promise<ArtTile | null>,
  indices: number[],
  limit = 50
): Promise<SampleComparison[]> {
  const results: SampleComparison[] = [];
  for (const index of indices.slice(0, limit)) {
    const left = await readA(index);
    const right = await readB(index);
    const equal =
      left !== null &&
      right !== null &&
      left.width === right.width &&
      left.height === right.height &&
      left.pixels.length === right.pixels.length &&
      left.pixels.every((value: number, position: number) => value === right.pixels[position]);
    results.push({
      index,
      equal,
      a: left ? { width: left.width, height: left.height } : null,
      b: right ? { width: right.width, height: right.height } : null
    });
  }
  return results;
}
