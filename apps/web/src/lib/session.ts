import type { ClientFileEntry, ClientFlavor } from '@sosarium/core';
import { useSyncExternalStore } from 'react';

export type SessionMode = 'readwrite' | 'readonly';

export interface SessionState {
  status: 'empty' | 'ready' | 'needs-permission';
  name: string | null;
  mode: SessionMode;
  flavor: ClientFlavor | null;
  clientVersion: string | null;
  files: ClientFileEntry[];
  handle: FileSystemDirectoryHandle | null;
  filesByName: Map<string, File> | null;
}

const emptyState: SessionState = {
  status: 'empty',
  name: null,
  mode: 'readonly',
  flavor: null,
  clientVersion: null,
  files: [],
  handle: null,
  filesByName: null
};

let state: SessionState = emptyState;
const listeners = new Set<() => void>();

export const sessionStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getState: () => state,
  set(next: SessionState) {
    state = next;
    for (const listener of listeners) {
      listener();
    }
  },
  reset() {
    sessionStore.set(emptyState);
  }
};

export function useSession(): SessionState {
  return useSyncExternalStore(sessionStore.subscribe, sessionStore.getState, sessionStore.getState);
}
