import { Link, useNavigate } from '@tanstack/react-router';

import { Logo } from '@/components/logo';
import { EDITORS } from '@/lib/editors';
import { closeSession } from '@/lib/open-folder';
import { usePluginState } from '@/lib/plugin-state';
import { useSession } from '@/lib/session';
import { PLUGINS } from '@/plugins/registry';

export function Sidebar() {
  const session = useSession();
  const navigate = useNavigate();
  const flavor = session.flavor;
  const enabled = usePluginState();
  const enabledPlugins = PLUGINS.filter(
    (plugin) => enabled[plugin.manifest.id] && (!flavor || (plugin.manifest.available?.(flavor) ?? true))
  );

  const handleClose = async () => {
    await closeSession();
    await navigate({ to: '/' });
  };

  return (
    <aside className="flex h-screen w-72 shrink-0 flex-col border-r border-bronze/20 bg-ink">
      <div className="flex min-h-14 items-center gap-3 border-b border-bronze/20 px-4">
        <Logo className="h-9 w-9" />
        <div className="min-w-0">
          <div className="font-serif text-sm tracking-[0.25em] text-bronze-bright uppercase">Sosarium</div>
          {/* <div className="truncate text-xs text-parchment/50" title={session.name ?? ''}>
            {session.name ?? 'Selected files'}
          </div> */}
        </div>
      </div>

      {session.mode === 'readonly' ? (
        <div className="border-b border-bronze/20 bg-bronze/10 px-4 py-2 text-xs text-bronze-bright">
          Read-only session — saving disabled
        </div>
      ) : null}

      <nav className="sf-opt scroll-area flex-1 overflow-y-auto px-2 py-3">
        <Link
          activeOptions={{ exact: true }}
          activeProps={{ className: 'bg-bronze/20 text-bronze-bright' }}
          className="block rounded px-2 py-2 text-sm text-parchment/80 hover:bg-bronze/10"
          to="/"
        >
          Overview
        </Link>
        <div className="mt-3 mb-1 px-2 text-[10px] tracking-widest text-parchment/40 uppercase">Editors</div>
        <ul>
          {[...EDITORS]
            .filter((editor) => editor.kind !== 'utility')
            .sort((a, b) => a.label.localeCompare(b.label))
            .map((editor) => {
              const available = flavor ? editor.available(flavor) : false;
              const enabled = available && editor.status === 'ready';
              return (
                <li key={editor.id}>
                  {enabled ? (
                    <Link
                      activeProps={{ className: 'bg-bronze/20 text-bronze-bright' }}
                      className="block rounded px-2 py-2 text-sm text-parchment/80 hover:bg-bronze/10"
                      to={editor.route}
                    >
                      {editor.label}
                    </Link>
                  ) : (
                    <span
                      className={`flex items-center justify-between rounded px-2 py-2 text-sm ${
                        available ? 'text-parchment/60' : 'text-parchment/25'
                      }`}
                      title={available ? 'Coming in a later part' : 'Required client files not found'}
                    >
                      {editor.label}
                      {available && editor.status === 'planned' ? (
                        <span className="rounded bg-bronze/10 px-1.5 py-0.5 text-[10px] text-bronze/70">soon</span>
                      ) : null}
                    </span>
                  )}
                </li>
              );
            })}
        </ul>
        {enabledPlugins.length > 0 ? (
          <>
            <div className="mt-3 mb-1 px-2 text-[10px] tracking-widest text-parchment/40 uppercase">Plugins</div>
            <ul>
              {enabledPlugins.map((plugin) => (
                <li key={plugin.manifest.id}>
                  <Link
                    activeProps={{ className: 'bg-bronze/20 text-bronze-bright' }}
                    className="block rounded px-2 py-2 text-sm text-parchment/80 hover:bg-bronze/10"
                    params={{ pluginId: plugin.manifest.id }}
                    to="/plugins/$pluginId"
                  >
                    {plugin.manifest.name}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </nav>

      <div className="border-t border-bronze/20 px-2 py-3">
        <div className="mb-1 px-2 text-[10px] tracking-widest text-parchment/40 uppercase">Utilities</div>
        <ul>
          {[...EDITORS]
            .filter((editor) => editor.kind === 'utility')
            .sort((a, b) => a.label.localeCompare(b.label))
            .map((editor) => (
              <li key={editor.id}>
                <Link
                  activeProps={{ className: 'bg-bronze/20 text-bronze-bright' }}
                  className="block rounded px-2 py-2 text-sm text-parchment/70 hover:bg-bronze/10"
                  to={editor.route}
                >
                  {editor.label}
                </Link>
              </li>
            ))}
        </ul>
      </div>

      <div className="flex min-h-11 items-center border-t border-bronze/20 px-2 py-1">
        <button
          className="w-full rounded border border-bronze/30 px-3 py-2 text-xs tracking-widest text-parchment/70 uppercase hover:border-bronze/60 hover:text-parchment"
          onClick={handleClose}
          type="button"
        >
          Close folder
        </button>
      </div>
    </aside>
  );
}
