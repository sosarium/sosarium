import { describe, expect, it } from 'vitest';

import { restoreSession } from './open-folder';

describe('restoreSession', () => {
  it('does nothing outside the browser', async () => {
    await expect(restoreSession()).resolves.toBeUndefined();
  });
});
