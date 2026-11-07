import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

import { GitHubButton } from '@/components/github-button';
import { usePluginState } from '@/lib/plugin-state';
import { useSession } from '@/lib/session';
import { createPluginApi } from '@/plugins/api';
import { PLUGINS } from '@/plugins/registry';

export const Route = createFileRoute('/_shell/plugins/$pluginId')({
  component: PluginPage
});

function PluginPage() {
  const { pluginId } = Route.useParams();
  const session = useSession();
  const enabled = usePluginState();
  const plugin = PLUGINS.find((entry) => entry.manifest.id === pluginId) ?? null;
  const available = plugin ? !session.flavor || (plugin.manifest.available?.(session.flavor) ?? true) : false;
  const active = Boolean(plugin && available && enabled[pluginId]);
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = mountRef.current;
    if (!active || !plugin || !element) {
      return;
    }
    const api = createPluginApi();
    let cleanup: (() => void) | undefined;
    let disposed = false;
    Promise.resolve(plugin.render(element, api))
      .then((dispose) => {
        if (disposed) {
          dispose?.();
          return;
        }
        cleanup = dispose ?? undefined;
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      cleanup?.();
      element.replaceChildren();
    };
  }, [active, plugin]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-bronze/20 px-4 py-3 min-h-14">
        <h1 className="font-serif text-xl tracking-widest text-bronze-bright uppercase">
          {plugin?.manifest.name ?? 'Plugin'}
        </h1>
        {plugin?.manifest.version ? (
          <span className="rounded bg-bronze/10 px-1.5 py-0.5 text-[10px] text-bronze/70 uppercase">
            v{plugin.manifest.version}
          </span>
        ) : null}
        <div className="flex-1" />
        <GitHubButton />
      </header>
      {!plugin ? (
        <div className="m-6 rounded border border-bronze/20 px-4 py-3 text-sm text-parchment/50">
          No plugin with id <span className="font-mono">{pluginId}</span>.
        </div>
      ) : active ? (
        <div className="min-h-0 flex-1" ref={mountRef} />
      ) : (
        <div className="m-6 flex flex-col items-start gap-3 rounded border border-bronze/20 px-4 py-3 text-sm text-parchment/50">
          <p>
            {plugin.manifest.name} is {available ? 'disabled' : 'unavailable in this session'}.
          </p>
          <Link
            className="rounded border border-bronze/30 px-3 py-1.5 text-xs tracking-widest text-parchment/70 uppercase hover:border-bronze/60"
            to="/plugins"
          >
            Open plugin manager
          </Link>
        </div>
      )}
    </div>
  );
}
