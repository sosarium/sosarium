import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loadDirectoryHandle = vi.fn();

vi.mock('./idb', () => ({
  loadDirectoryHandle: () => loadDirectoryHandle(),
  saveDirectoryHandle: vi.fn(),
  clearDirectoryHandle: vi.fn(async () => undefined)
}));

async function load() {
  vi.resetModules();
  const openFolder = await import('./open-folder');
  const { sessionStore } = await import('./session');
  return { ...openFolder, sessionStore };
}

describe('restoreSession', () => {
  it('does nothing outside the browser', async () => {
    const { restoreSession } = await load();
    await expect(restoreSession()).resolves.toBeUndefined();
  });

  describe('in the browser', () => {
    beforeEach(() => {
      vi.stubGlobal('window', {});
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
      loadDirectoryHandle.mockReset();
    });

    it('gives up on a restore that never settles', async () => {
      loadDirectoryHandle.mockReturnValue(new Promise(() => {}));
      const { restoreSession, sessionStore } = await load();

      const restored = restoreSession();
      await vi.advanceTimersByTimeAsync(10_000);

      await expect(restored).resolves.toBeUndefined();
      expect(sessionStore.getState().status).toBe('stalled');
    });

    it('marks a failed restore as stalled instead of throwing', async () => {
      loadDirectoryHandle.mockRejectedValue(new Error('broken store'));
      const { restoreSession, sessionStore } = await load();

      await expect(restoreSession()).resolves.toBeUndefined();
      expect(sessionStore.getState().status).toBe('stalled');
    });

    it('forgetting a stalled folder returns to an empty session', async () => {
      loadDirectoryHandle.mockReturnValue(new Promise(() => {}));
      const { closeSession, restoreSession, sessionStore } = await load();
      const restored = restoreSession();
      await vi.advanceTimersByTimeAsync(10_000);
      await restored;

      await closeSession();

      expect(sessionStore.getState().status).toBe('empty');
    });
  });
});
