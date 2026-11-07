import { describe, expect, it } from 'vitest';

import { diffHues, diffIndexTables, diffTiledata } from './compare';
import type { HueFile } from './hues';
import type { TileDataFile } from './tiledata';

function tiledata(name: string, height: number): TileDataFile {
  return {
    format: 'new',
    landHeaders: [0],
    itemHeaders: [0],
    land: [{ name, flags: 0n, textureId: 3 }],
    items: [
      {
        name,
        flags: 0n,
        weight: 1,
        quality: 1,
        miscData: 0,
        unk2: 0,
        quantity: 0,
        animation: 0,
        unk3: 0,
        hue: 0,
        stackingOffset: 0,
        value: 0,
        height
      }
    ]
  };
}

function hues(name: string, firstColor: number): HueFile {
  const colors = new Uint16Array(32);
  colors[0] = firstColor;
  return {
    headers: [0],
    hues: [{ name, colors, tableStart: 0, tableEnd: 0 }]
  };
}

describe('compare engine', () => {
  it('detects tiledata field differences', () => {
    const a = tiledata('grass', 1);
    const b = tiledata('grass', 2);
    const diff = diffTiledata(a, b);
    expect(diff.landChanged).toBe(0);
    expect(diff.itemChanged).toBe(1);
    expect(diff.itemSamples[0]).toEqual({ index: 0, field: 'height', a: 1, b: 2 });

    const renamed = diffTiledata(a, tiledata('sand', 1));
    expect(renamed.landChanged).toBe(1);
    expect(renamed.itemChanged).toBe(1);
    expect(renamed.itemSamples[0]?.field).toBe('name');
  });

  it('detects hues name and colour differences', () => {
    const diff = diffHues(hues('red', 0x1111), hues('red', 0x2222));
    expect(diff.changed).toBe(1);
    expect(diff.samples[0]).toEqual({ index: 0, field: 'color[0]', a: 0x1111, b: 0x2222 });

    const named = diffHues(hues('red', 0x1111), hues('blue', 0x1111));
    expect(named.changed).toBe(1);
    expect(named.samples[0]?.field).toBe('name');
  });

  it('diffs index tables structurally', () => {
    const a = [{ lookup: 0, length: 10, extra: 0 }, undefined, { lookup: 10, length: 5, extra: 1 }];
    const b = [undefined, { lookup: 0, length: 10, extra: 0 }, { lookup: 10, length: 9, extra: 1 }];
    const diff = diffIndexTables(a, b);
    expect(diff.onlyA).toBe(1);
    expect(diff.onlyB).toBe(1);
    expect(diff.differingLength).toBe(1);
    expect(diff.same).toBe(0);
  });
});
