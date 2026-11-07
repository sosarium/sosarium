import { afterEach, describe, expect, it, vi } from 'vitest';

import { pluginStore } from './plugin-state';

vi.mock('@/plugins/registry', () => ({
  PLUGINS: [{ manifest: { id: 'sample', defaultEnabled: false } }]
}));

describe('pluginStore', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('notifies listeners when storage is unavailable', () => {
    vi.stubGlobal('window', {
      localStorage: {
        setItem: () => {
          throw new DOMException('denied', 'QuotaExceededError');
        }
      }
    });
    const listener = vi.fn();
    const unsubscribe = pluginStore.subscribe(listener);

    pluginStore.setEnabled('sample', true);
    unsubscribe();

    expect(pluginStore.getState().sample).toBe(true);
    expect(listener).toHaveBeenCalledOnce();
  });
});
