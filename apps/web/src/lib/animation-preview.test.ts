import type { AnimationSource } from '@sosarium/formats';
import { describe, expect, it, vi } from 'vitest';

import { createPreviewLoader } from './animation-preview';

describe('createPreviewLoader', () => {
  it('resolves null when a preview fails to read', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const source = {
      actions: () => [0],
      read: async () => {
        throw new RangeError('corrupt frame');
      }
    } as unknown as AnimationSource;
    const result = await Promise.race([
      createPreviewLoader(source)(1),
      new Promise((resolve) => setTimeout(() => resolve('hung'), 50))
    ]);
    expect(result).toBeNull();
  });
});
