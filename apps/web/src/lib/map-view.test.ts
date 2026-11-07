import { describe, expect, it, vi } from 'vitest';

import { failPending } from './map-view';
import type { MapWorkerResponse } from './map-worker-protocol';

describe('failPending', () => {
  it('settles every waiting request with the error', () => {
    const waiting = vi.fn();
    const pending = new Map<number, (response: MapWorkerResponse) => void>([[7, waiting]]);
    failPending(pending, 'worker crashed');
    expect(waiting).toHaveBeenCalledWith(expect.objectContaining({ id: 7, error: 'worker crashed' }));
    expect(pending.size).toBe(0);
  });
});
