export type ThemeChoice = 'system' | 'dark' | 'light';

export interface Preferences {
  animationFrameMs: number;
  mapStaticsDefault: boolean;
  artGridCacheSize: number;
  theme: ThemeChoice;
}

const KEY = 'sosarium.preferences.v1';

export const DEFAULT_PREFERENCES: Preferences = {
  animationFrameMs: 120,
  mapStaticsDefault: true,
  artGridCacheSize: 256,
  theme: 'system'
};

let cache: Preferences | null = null;
const listeners = new Set<() => void>();

function read(): Preferences {
  if (cache) {
    return cache;
  }
  if (typeof window === 'undefined') {
    cache = { ...DEFAULT_PREFERENCES };
    return cache;
  }
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      cache = { ...DEFAULT_PREFERENCES };
      return cache;
    }
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    cache = {
      animationFrameMs: clamp(Number(parsed.animationFrameMs ?? DEFAULT_PREFERENCES.animationFrameMs), 20, 1000),
      mapStaticsDefault: Boolean(parsed.mapStaticsDefault ?? DEFAULT_PREFERENCES.mapStaticsDefault),
      artGridCacheSize: clamp(Number(parsed.artGridCacheSize ?? DEFAULT_PREFERENCES.artGridCacheSize), 32, 2048),
      theme:
        parsed.theme === 'dark' || parsed.theme === 'light' || parsed.theme === 'system'
          ? parsed.theme
          : DEFAULT_PREFERENCES.theme
    };
  } catch {
    cache = { ...DEFAULT_PREFERENCES };
  }
  return cache;
}

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : min;
}

export function getPreferences(): Preferences {
  return read();
}

export function updatePreferences(patch: Partial<Preferences>): Preferences {
  const next: Preferences = { ...read(), ...patch };
  next.animationFrameMs = clamp(next.animationFrameMs, 20, 1000);
  next.artGridCacheSize = clamp(next.artGridCacheSize, 32, 2048);
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage can be unavailable (private mode); the in-memory value still applies
  }
  for (const listener of listeners) {
    listener();
  }
  return next;
}

export function subscribePreferences(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
