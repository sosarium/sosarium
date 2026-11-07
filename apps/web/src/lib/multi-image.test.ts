import type { ArtSource, MultiGroup } from '@sosarium/formats';
import { describe, expect, it, vi } from 'vitest';

import { renderMultiComposition } from './multi-image';

const group = {
  minX: 0,
  minY: 0,
  width: 1,
  height: 1,
  components: [{ id: 1, x: 0, y: 0, z: 0 }]
} as unknown as MultiGroup;

describe('renderMultiComposition', () => {
  it('skips tiles the art source does not have', async () => {
    const art = { readStatic: vi.fn(async () => null) } as unknown as ArtSource;
    await expect(renderMultiComposition(group, art)).resolves.toBeNull();
    expect(art.readStatic).toHaveBeenCalledWith(1);
  });

  it('reports art read failures', async () => {
    const art = {
      readStatic: vi.fn(async () => {
        throw new RangeError('corrupt tile');
      })
    } as unknown as ArtSource;
    await expect(renderMultiComposition(group, art)).rejects.toThrow('corrupt tile');
  });
});
