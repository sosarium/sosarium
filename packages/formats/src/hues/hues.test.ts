import { hasAssets, loadAsset } from '@sosarium/core/testing';
import { describe, expect, it } from 'vitest';

import type { WritableFile } from '../writable';
import { applyHue, HUE_BLOCK_SIZE, HUE_COUNT, hueColorToCss, parseHues, rgb8ToHue5, serializeHues } from './format';
import { HueDataSource } from './source';

class MemoryWritableFile implements WritableFile {
  bytes: Uint8Array;
  opened = 0;

  constructor(initial: Uint8Array = new Uint8Array(0)) {
    this.bytes = initial.slice();
  }

  async open(keepExistingData: boolean): Promise<void> {
    this.opened++;
    if (!keepExistingData) {
      this.bytes = new Uint8Array(0);
    }
  }

  async writeAt(position: number, data: Uint8Array): Promise<void> {
    const end = position + data.byteLength;
    if (end > this.bytes.byteLength) {
      const next = new Uint8Array(Math.max(end, this.bytes.byteLength * 2, 64));
      next.set(this.bytes);
      this.bytes = next;
    }
    this.bytes.set(data, position);
  }

  async close(): Promise<void> {}
}

function makeHueFile(blockCount = 1) {
  const headers = new Array(blockCount).fill(0).map((_, i) => i + 7);
  const hues = new Array(HUE_COUNT).fill(null).map((_, index) => ({
    name: `hue-${index}`,
    colors: new Uint16Array(32).fill((index & 0x7fff) | 1),
    tableStart: index & 0xffff,
    tableEnd: (index * 2) & 0xffff
  }));
  return { headers, hues };
}

describe('hues parsing', () => {
  it('round-trips a synthetic file', () => {
    const file = makeHueFile(2);
    const bytes = serializeHues(file);
    expect(bytes.byteLength).toBe(2 * HUE_BLOCK_SIZE);
    const parsed = parseHues(bytes);
    expect(parsed.headers).toEqual(file.headers);
    expect(parsed.hues[0]?.name).toBe('hue-0');
    expect(Array.from(parsed.hues[3]?.colors.slice(0, 3) as Uint16Array)).toEqual(
      Array.from(file.hues[3]?.colors.slice(0, 3) as Uint16Array)
    );
    expect(parsed.hues[15]?.tableStart).toBe(15);
    expect(parsed.hues[16]?.name).toBe('Null');
  });

  it('clamps flag-bit and zero colors to 1', () => {
    const file = makeHueFile(1);
    const first = file.hues[0] as (typeof file.hues)[number];
    first.colors[0] = 0;
    first.colors[1] = 0x8001;
    first.colors[2] = 0x7fff;
    const parsed = parseHues(serializeHues(file));
    expect(Array.from((parsed.hues[0] as NonNullable<(typeof parsed.hues)[0]>).colors.slice(0, 3))).toEqual([
      1, 1, 0x7fff
    ]);
  });

  it('fills hues beyond the file with defaults', () => {
    const parsed = parseHues(serializeHues(makeHueFile(1)));
    expect(parsed.hues).toHaveLength(HUE_COUNT);
    const last = parsed.hues[HUE_COUNT - 1];
    expect(last?.name).toBe('Null');
    expect(Array.from(last?.colors as Uint16Array)).toEqual(new Array(32).fill(0));
  });

  it('rejects oversized html-sized inputs', () => {
    expect(() => parseHues(new Uint8Array(10))).toThrow('not a hues.mul file');
  });
});

describe('hue math', () => {
  const hue = {
    name: 'test',
    colors: new Uint16Array(32).fill(0),
    tableStart: 0,
    tableEnd: 0
  };
  hue.colors[5] = 0x1234;
  hue.colors[7] = 0x0abc;

  it('indexes the ramp by the 5-bit red channel', () => {
    const pixels = new Uint16Array([0, 0x8000 | (5 << 10), 0x8000 | (7 << 10) | (3 << 5) | 1]);
    const hued = applyHue({ width: 3, height: 1, pixels }, hue);
    expect(Array.from(hued.pixels)).toEqual([0, 0x8000 | 0x1234, 0x8000 | 0x0abc]);
  });

  it('only applies to gray pixels when requested', () => {
    const gray = 0x8000 | (5 << 10) | (5 << 5) | 5;
    const color = 0x8000 | (7 << 10) | (1 << 5) | 1;
    const pixels = new Uint16Array([gray, color]);
    const hued = applyHue({ width: 2, height: 1, pixels }, hue, true);
    expect(Array.from(hued.pixels)).toEqual([0x8000 | 0x1234, color]);
  });

  it('converts colors to css and rgb to packed hue values', () => {
    expect(hueColorToCss(0x7fff)).toBe('rgb(255 255 255)');
    expect(hueColorToCss(0)).toBe('rgb(0 0 0)');
    expect(rgb8ToHue5(0, 0, 0)).toBe(0);
    expect(rgb8ToHue5(1, 1, 1)).toBe(1);
    expect(rgb8ToHue5(255, 255, 255)).toBe(0x7fff);
  });
});

describe.skipIf(!hasAssets())('hues.mul (real client file)', () => {
  const load = async () => parseHues(await loadAsset('hues.mul').readAll());

  it('parses the full 375-block table', async () => {
    const parsed = await load();
    expect(parsed.headers).toHaveLength(375);
    expect(parsed.hues).toHaveLength(HUE_COUNT);
    const named = parsed.hues.filter((hue) => hue.name !== 'Null' && hue.name !== '').length;
    expect(named).toBeGreaterThan(2000);
  });

  it('matches known hue 1 values', async () => {
    const parsed = await load();
    const hue = parsed.hues[1];
    expect(hue?.name).toBe('Hue (6->1080)');
    expect(hue?.tableStart).toBe(6);
    expect(hue?.tableEnd).toBe(1080);
  });

  it('round-trips the real file through serialization', async () => {
    const bytes = await loadAsset('hues.mul').readAll();
    const first = parseHues(bytes);
    const second = parseHues(serializeHues(first));
    expect(second.headers).toEqual(first.headers);
    expect(second.hues).toEqual(first.hues);
  });
});

describe('HueDataSource', () => {
  it('edits and persists hues', async () => {
    const bytes = serializeHues(makeHueFile(2));
    const writable = new MemoryWritableFile();
    const source = new HueDataSource(bytes, writable);

    expect(source.hasChanges).toBe(false);
    await source.save();
    expect(writable.opened).toBe(0);

    source.update(1, { name: 'custom', tableStart: 99, tableEnd: 1234 });
    source.setColor(1, 3, 0x1234);
    expect(source.hasChanges).toBe(true);
    expect(source.modifiedCount).toBe(1);

    await source.save();
    expect(source.hasChanges).toBe(false);

    const reparsed = parseHues(writable.bytes);
    expect(reparsed.hues[1]?.name).toBe('custom');
    expect(reparsed.hues[1]?.tableStart).toBe(99);
    expect(reparsed.hues[1]?.colors[3]).toBe(0x1234);
    expect(reparsed.hues[0]?.name).toBe('hue-0');
  });
});
