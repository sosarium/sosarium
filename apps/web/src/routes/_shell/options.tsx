import { createFileRoute } from '@tanstack/react-router';
import { useSyncExternalStore } from 'react';

import { useDocumentMeta } from '@/lib/document-meta';
import { getPreferences, subscribePreferences, updatePreferences } from '@/lib/preferences';
import { setTheme } from '@/lib/theme';

export const Route = createFileRoute('/_shell/options')({
  component: OptionsPage
});

function OptionsPage() {
  useDocumentMeta('Options — Sosarium');
  const preferences = useSyncExternalStore(subscribePreferences, getPreferences, getPreferences);

  return (
    <div className="sf-opt scroll-area h-full overflow-y-auto p-8">
      <h1 className="font-serif text-2xl tracking-widest text-bronze-bright uppercase">Options</h1>
      <p className="mt-1 text-sm text-parchment/50">
        Stored in this browser only; they do not modify the client folder.
      </p>

      <div className="mt-6 max-w-xl space-y-5 text-sm">
        <div>
          <span className="text-xs tracking-widest text-parchment/40 uppercase">Theme</span>
          <div className="mt-2 flex w-fit overflow-hidden rounded border border-bronze/30">
            {(['system', 'dark', 'light'] as const).map((value) => (
              <button
                className={`px-3 py-1.5 text-xs tracking-widest uppercase ${
                  preferences.theme === value
                    ? 'bg-bronze/25 text-bronze-bright'
                    : 'text-parchment/60 hover:bg-bronze/10'
                }`}
                key={value}
                onClick={() => setTheme(value)}
                type="button"
              >
                {value === 'system' ? 'System' : value === 'dark' ? 'Dark' : 'Light'}
              </button>
            ))}
          </div>
          <span className="mt-1 block text-xs text-parchment/30">
            system follows your OS setting and is the default
          </span>
        </div>

        <label className="block">
          <span className="text-xs tracking-widest text-parchment/40 uppercase">Animation frame interval (ms)</span>
          <input
            className="mt-1 w-32 rounded border border-bronze/30 bg-ink px-2 py-1 text-parchment/80"
            max={1000}
            min={20}
            onChange={(event) => updatePreferences({ animationFrameMs: Number(event.target.value) })}
            type="number"
            value={preferences.animationFrameMs}
          />
          <span className="ml-3 text-xs text-parchment/30">default 120 · range 20–1000</span>
        </label>

        <label className="flex items-center gap-3">
          <input
            checked={preferences.mapStaticsDefault}
            onChange={(event) => updatePreferences({ mapStaticsDefault: event.target.checked })}
            type="checkbox"
          />
          <span>Show statics on the map when an editor opens</span>
        </label>

        <label className="block">
          <span className="text-xs tracking-widest text-parchment/40 uppercase">Art grid cache entries</span>
          <input
            className="mt-1 w-32 rounded border border-bronze/30 bg-ink px-2 py-1 text-parchment/80"
            max={2048}
            min={32}
            onChange={(event) => updatePreferences({ artGridCacheSize: Number(event.target.value) })}
            type="number"
            value={preferences.artGridCacheSize}
          />
          <span className="ml-3 text-xs text-parchment/30">prerendered thumbnails kept in memory · default 256</span>
        </label>
      </div>

      <p className="mt-8 max-w-xl text-xs text-parchment/30">
        The animation interval applies the next time a player mounts. The art cache size is recorded here for the grid
        budget; the grid currently sizes its LRU at startup.
      </p>
    </div>
  );
}
