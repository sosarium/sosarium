import type { ArtTile, GumpSource } from '@sosarium/formats';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { type ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';

import { ArtGrid } from '@/components/art/art-grid';
import { GitHubButton } from '@/components/github-button';
import { imageFileToTile, tileToCanvas, tileToPngBlob } from '@/lib/art-image';
import { formatIndexParam, parseIndexParam } from '@/lib/deep-link';
import { useDocumentMeta } from '@/lib/document-meta';
import { getGumpSource, saveGumpSource } from '@/lib/gumps-session';
import { useSession } from '@/lib/session';
import { useUrlStateSync } from '@/lib/use-url-state';

export const Route = createFileRoute('/_shell/gumps/{-$id}')({
  component: GumpEditor
});

function indexLabel(index: number): string {
  return `0x${index.toString(16).toUpperCase().padStart(4, '0')}`;
}

function GumpEditor() {
  const session = useSession();
  const params = Route.useParams();
  const navigate = useNavigate();
  const [source, setSource] = useState<GumpSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [preview, setPreview] = useState<ArtTile | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [jump, setJump] = useState('');
  const importRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (session.status !== 'ready') {
      setSource(null);
      return;
    }
    let cancelled = false;
    setSource(null);
    setError(null);
    getGumpSource()
      .then((value) => {
        if (cancelled) {
          return;
        }
        if (value) {
          setSource(value);
        } else {
          setError('Gump files are not available in this session.');
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not open the gump files.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  useUrlStateSync({
    apply: () => {
      const parsed = parseIndexParam(params.id);
      if (parsed !== null) {
        setSelected(parsed);
      }
    },
    paramKey: (params.id ?? '').toLowerCase(),
    stateKey: selected === null ? '' : formatIndexParam(selected).toLowerCase(),
    sync: () => {
      if (selected === null) {
        return;
      }
      void navigate({ to: '/gumps/{-$id}', params: { id: formatIndexParam(selected) }, replace: true });
    }
  });
  useDocumentMeta(
    selected !== null ? `Gump ${indexLabel(selected)} — Sosarium` : 'Gumps — Sosarium',
    selected !== null
      ? `Ultima Online gump ${indexLabel(selected)}${preview ? ` · ${preview.width}×${preview.height} px` : ''} — Sosarium.`
      : 'Browse and edit Ultima Online gumps in Sosarium.'
  );

  const loadTile = useCallback((index: number) => (source ? source.read(index) : Promise.resolve(null)), [source]);
  const hasTile = useCallback((index: number) => (source ? source.has(index) : false), [source]);
  const isModified = useCallback((index: number) => (source ? source.isModified(index) : false), [source]);

  useEffect(() => {
    if (selected === null || !source) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    source
      .read(selected)
      .then((tile) => {
        if (!cancelled) {
          setPreview(tile);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPreview(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selected, source]);

  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas) {
      return;
    }
    if (!preview) {
      canvas.width = 0;
      canvas.height = 0;
      return;
    }
    const rendered = tileToCanvas(preview);
    canvas.width = preview.width;
    canvas.height = preview.height;
    const context = canvas.getContext('2d');
    if (context) {
      context.imageSmoothingEnabled = false;
      context.drawImage(rendered, 0, 0);
    }
  }, [preview]);

  const writeable = session.mode === 'readwrite';
  const modified = source?.hasChanges ?? false;

  const handleJump = () => {
    const trimmed = jump.trim();
    if (!trimmed) {
      return;
    }
    const value = /^0x/i.test(trimmed) ? Number.parseInt(trimmed.slice(2), 16) : Number.parseInt(trimmed, 10);
    if (!Number.isFinite(value) || value < 0 || !source || value >= source.count) {
      setStatus(`Enter an index between 0 and ${((source?.count ?? 1) - 1).toLocaleString('en-US')}.`);
      return;
    }
    setSelected(value);
    setStatus(null);
  };

  const handleExport = async () => {
    if (!preview || selected === null) {
      return;
    }
    const blob = await tileToPngBlob(preview);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `gump-${selected.toString(16).padStart(4, '0')}.png`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !source || selected === null) {
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const tile = await imageFileToTile(file);
      if (!tile) {
        setStatus('That image could not be imported (dimensions must be 1–2048px).');
        return;
      }
      source.write(selected, tile);
      setPreview(tile);
      setVersion((value) => value + 1);
      setStatus('Image imported — use Save to write it to disk.');
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : 'Import failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (!source || session.mode !== 'readwrite') {
      return;
    }
    setBusy(true);
    setStatus('Saving…');
    try {
      await saveGumpSource(source);
      const fresh = await getGumpSource(true);
      if (fresh) {
        setSource(fresh);
      }
      setVersion((value) => value + 1);
      setStatus('Saved to disk.');
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-bronze/20 px-4 py-3 min-h-14">
        <h1 className="font-serif text-xl tracking-widest text-bronze-bright uppercase">Gumps</h1>
        <div className="flex items-center gap-2">
          <input
            className="w-28 rounded border border-bronze/30 bg-ink py-1.5 px-2 text-xs text-parchment/80 placeholder:text-parchment/30"
            onChange={(event) => setJump(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                handleJump();
              }
            }}
            placeholder="0x0FAB"
            value={jump}
          />
          <button
            className="rounded border border-bronze/30 px-3 py-1.5 text-xs tracking-widest text-parchment/70 uppercase hover:border-bronze/60"
            onClick={handleJump}
            type="button"
          >
            Go
          </button>
        </div>
        <div className="flex-1" />
        {modified ? <span className="text-xs text-bronze-bright">Unsaved changes</span> : null}
        <button
          className="rounded border border-bronze/60 bg-bronze/10 px-4 py-1.5 text-xs tracking-widest text-bronze-bright uppercase hover:bg-bronze/20 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!modified || !writeable || busy}
          onClick={handleSave}
          type="button"
        >
          Save
        </button>
        <GitHubButton />
      </header>

      {error ? (
        <div className="m-6 rounded border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200/90">
          {error}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="relative min-w-0 flex-1">
            {source ? (
              <ArtGrid
                count={source.count}
                hasTile={hasTile}
                hovered={hovered}
                isModified={isModified}
                key={`gumps-${version}`}
                loadTile={loadTile}
                onHover={setHovered}
                onSelect={setSelected}
                selected={selected}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-parchment/40">Loading gumps…</div>
            )}
          </div>

          <aside className="scroll-area flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-bronze/20 p-4">
            <h2 className="text-xs tracking-widest text-parchment/40 uppercase">Selection</h2>
            {selected === null ? (
              <p className="text-sm text-parchment/50">Click a gump in the grid, or jump to an index.</p>
            ) : (
              <>
                <div>
                  <div className="font-mono text-lg text-bronze-bright">{indexLabel(selected)}</div>
                  <div className="text-xs text-parchment/50">Gump · {selected} decimal</div>
                </div>
                <div
                  className="flex min-h-32 items-center justify-center rounded border border-bronze/20 p-3"
                  style={{
                    backgroundImage:
                      'linear-gradient(45deg, #1a1613 25%, transparent 25%), linear-gradient(-45deg, #1a1613 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1a1613 75%), linear-gradient(-45deg, transparent 75%, #1a1613 75%)',
                    backgroundSize: '16px 16px',
                    backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0'
                  }}
                >
                  {preview ? (
                    <canvas className="max-h-64 max-w-full" ref={previewRef} />
                  ) : (
                    <span className="text-xs text-parchment/30">empty entry</span>
                  )}
                </div>
                {preview ? (
                  <div className="text-xs text-parchment/50">
                    {preview.width} × {preview.height} px
                  </div>
                ) : null}
                {source?.isModified(selected) ? (
                  <span className="w-fit rounded bg-bronze/15 px-2 py-0.5 text-xs text-bronze-bright">modified</span>
                ) : null}
                <div className="mt-auto flex flex-col gap-2">
                  <button
                    className="rounded border border-bronze/30 px-3 py-2 text-xs tracking-widest text-parchment/70 uppercase hover:border-bronze/60 disabled:opacity-40"
                    disabled={!preview}
                    onClick={handleExport}
                    type="button"
                  >
                    Export PNG
                  </button>
                  <button
                    className="rounded border border-bronze/30 px-3 py-2 text-xs tracking-widest text-parchment/70 uppercase hover:border-bronze/60"
                    onClick={() => {
                      navigator.clipboard
                        .writeText(window.location.href)
                        .then(() => setStatus('Link copied.'))
                        .catch(() => setStatus('Could not copy the link.'));
                    }}
                    type="button"
                  >
                    Copy link
                  </button>
                  <button
                    className="rounded border border-bronze/30 px-3 py-2 text-xs tracking-widest text-parchment/70 uppercase hover:border-bronze/60 disabled:opacity-40"
                    disabled={!writeable || busy}
                    onClick={() => importRef.current?.click()}
                    type="button"
                  >
                    Replace from PNG…
                  </button>
                </div>
              </>
            )}
          </aside>
        </div>
      )}

      <footer className="mt-auto flex min-h-11 items-center justify-between border-t border-bronze/20 px-4 py-1.5 text-xs text-parchment/40">
        <span>{hovered === null ? '' : `${indexLabel(hovered)} · ${hovered}`}</span>
        <span>{status ?? (writeable ? 'Editing enabled' : 'Read-only session')}</span>
      </footer>

      <input accept="image/png,image/*" className="hidden" onChange={handleImport} ref={importRef} type="file" />
    </div>
  );
}
