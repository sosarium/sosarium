import { createFileRoute, Link } from '@tanstack/react-router';

import { GitHubButton } from '@/components/github-button';
import { pluginStore, usePluginState } from '@/lib/plugin-state';
import { useSession } from '@/lib/session';
import { PLUGINS } from '@/plugins/registry';

export const Route = createFileRoute('/_shell/plugins/')({
  component: PluginsPage
});

function PluginsPage() {
  const session = useSession();
  const enabled = usePluginState();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-bronze/20 px-4 py-3 min-h-14">
        <h1 className="font-serif text-xl tracking-widest text-bronze-bright uppercase">Plugins</h1>
        <span className="text-xs text-parchment/40">{PLUGINS.length} built-in</span>
        <div className="flex-1" />
        <GitHubButton />
      </header>
      <div className="sf-opt scroll-area min-h-0 flex-1 overflow-y-auto p-4">
        <p className="max-w-3xl text-sm text-parchment/50">
          Plugins are compiled into this build. Enable one to add it to the sidebar under Plugins; its page opens at{' '}
          <span className="font-mono text-parchment/70">/plugins/&lt;id&gt;</span>. Authors implement a DOM contract,{' '}
          <span className="font-mono text-parchment/70">render(root, api)</span>, and get the open client folder through
          the API.
        </p>
        <ul className="mt-4 flex flex-col gap-3">
          {PLUGINS.map((plugin) => {
            const available = !session.flavor || (plugin.manifest.available?.(session.flavor) ?? true);
            const isEnabled = available && Boolean(enabled[plugin.manifest.id]);
            return (
              <li className="rounded border border-bronze/20 p-4" key={plugin.manifest.id}>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-serif text-lg text-bronze-bright">{plugin.manifest.name}</span>
                  <span className="rounded bg-bronze/10 px-1.5 py-0.5 text-[10px] text-bronze/70 uppercase">
                    v{plugin.manifest.version ?? '0.0.0'}
                  </span>
                  <span className="font-mono text-xs text-parchment/40">/plugins/{plugin.manifest.id}</span>
                  <div className="flex-1" />
                  {isEnabled ? (
                    <Link
                      className="rounded border border-bronze/30 px-3 py-1.5 text-xs tracking-widest text-parchment/70 uppercase hover:border-bronze/60"
                      params={{ pluginId: plugin.manifest.id }}
                      to="/plugins/$pluginId"
                    >
                      Open
                    </Link>
                  ) : null}
                  <label className="flex items-center gap-2 text-xs text-parchment/60">
                    <input
                      checked={isEnabled}
                      disabled={!available}
                      onChange={(event) => pluginStore.setEnabled(plugin.manifest.id, event.target.checked)}
                      type="checkbox"
                    />
                    enabled
                  </label>
                </div>
                <p className="mt-2 text-sm text-parchment/50">{plugin.manifest.description}</p>
                {plugin.manifest.author ? (
                  <p className="mt-1 text-xs text-parchment/30">by {plugin.manifest.author}</p>
                ) : null}
                {available ? null : (
                  <p className="mt-1 text-xs text-parchment/30">needs client files this session does not have</p>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
