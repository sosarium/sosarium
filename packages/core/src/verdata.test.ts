import { describe, expect, it } from 'vitest';

import { parseVerdata, serializeVerdata } from './verdata';

describe('verdata', () => {
  it('round-trips patches', () => {
    const patches = [
      { file: 4, index: 100, lookup: 512, length: 256, extra: 0 },
      { file: 30, index: 1, lookup: 1024, length: 40, extra: 7 }
    ];
    const parsed = parseVerdata(serializeVerdata(patches));
    expect(parsed).toEqual(patches);
  });

  it('parses an empty patch table', () => {
    expect(parseVerdata(serializeVerdata([]))).toEqual([]);
  });

  it('rejects a declared count that exceeds the file', () => {
    const bytes = new Uint8Array([0xff, 0xff, 0xff, 0x7f, 0, 0, 0, 0]);
    expect(() => parseVerdata(bytes)).toThrow('invalid verdata.mul');
  });
});
