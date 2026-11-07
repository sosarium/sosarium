import { useSyncExternalStore } from 'react';

import { PLUGINS } from '@/plugins/registry';

const STORAGE_KEY = 'sosarium.plugins';

type EnabledMap = Record<string, boolean>;

function defaults(): EnabledMap {
  const map: EnabledMap = {};
  for (const plugin of PLUGINS) {
    map[plugin.manifest.id] = plugin.manifest.defaultEnabled ?? false;
  }
  return map;
}

function load(): EnabledMap {
  const base = defaults();
  if (typeof window === 'undefined') {
    return base;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return base;
    }
    const parsed = JSON.parse(raw) as EnabledMap;
    for (const [id, value] of Object.entries(parsed)) {
      if (id in base && typeof value === 'boolean') {
        base[id] = value;
      }
    }
  } catch {
    return base;
  }
  return base;
}

let state: EnabledMap = load();
const listeners = new Set<() => void>();

export const pluginStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getState: () => state,
  setEnabled(id: string, enabled: boolean) {
    state = { ...state, [id]: enabled };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // storage can be unavailable (private mode); the in-memory value still applies
    }
    for (const listener of listeners) {
      listener();
    }
  }
};

export function usePluginState(): EnabledMap {
  return useSyncExternalStore(pluginStore.subscribe, pluginStore.getState, pluginStore.getState);
}
