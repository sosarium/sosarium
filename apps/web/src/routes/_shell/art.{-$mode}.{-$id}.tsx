import {
  type Animdata,
  type ArtSource,
  type ArtTile,
  decodeFlags,
  measureArtBounds,
  STATIC_COUNT,
  type TileDataSource
} from '@sosarium/formats';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { type ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';

import { ArtGrid } from '@/components/art/art-grid';
import { GitHubButton } from '@/components/github-button';
import { getAnimdata } from '@/lib/animations-save';
import { imageFileToTile, tileToCanvas, tileToPngBlob } from '@/lib/art-image';
import { getArtSource, saveArtSource } from '@/lib/art-session';
import { formatIndexParam, parseIndexParam } from '@/lib/deep-link';
import { useDocumentMeta } from '@/lib/document-meta';
import { useSession } from '@/lib/session';
import { getTileDataSource } from '@/lib/tiledata-session';
import { useUrlStateSync } from '@/lib/use-url-state';

export const Route = createFileRoute('/_shell/art/{-$mode}/{-$id}')({
  component: ArtEditor
});

function indexLabel(index: number): string {
  return `0x${index.toString(16).toUpperCase().padStart(4, '0')}`;
}

function parseIndex(text: string, maxExclusive: number): number | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  const value = /^0x/i.test(trimmed) ? Number.parseInt(trimmed.slice(2), 16) : Number.parseInt(trimmed, 10);
  return Number.isFinite(value) && value >= 0 && value < maxExclusive ? value : null;
}

function ArtEditor() {
  const session = useSession();
  const [source, setSource] = useState<ArtSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const params = Route.useParams();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'items' | 'land'>('items');
  const [selected, setSelected] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [preview, setPreview] = useState<ArtTile | null>(null);
  const [tileData, setTileData] = useState<TileDataSource | null>(null);
  const [animdata, setAnimdata] = useState<Animdata | null>(null);
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
    getArtSource()
      .then((value) => {
        if (cancelled) {
          return;
        }
        if (value) {
          setSource(value);
        } else {
          setError('Art files are not available in this session.');
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not open the art files.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const loadTile = useCallback(
    (index: number) => {
      if (!source) {
        return Promise.resolve(null);
      }
      return mode === 'land' ? source.readLand(index) : source.readStatic(index);
    },
    [source, mode]
  );

  const hasTile = useCallback(
    (index: number) => {
      if (!source) {
        return false;
      }
      return mode === 'land' ? source.hasLand(index) : source.hasStatic(index);
    },
    [source, mode]
  );

  const isModified = useCallback(
    (index: number) => (source ? source.isModified(mode === 'land' ? 'land' : 'static', index) : false),
    [source, mode]
  );

  useEffect(() => {
    if (selected === null || !source) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    loadTile(selected)
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
  }, [selected, source, loadTile]);

  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas) {
      return;
    }
    const context = canvas.getContext('2d');
    if (!preview) {
      canvas.width = 0;
      canvas.height = 0;
      return;
    }
    canvas.width = preview.width * 3;
    canvas.height = preview.height * 3;
    if (context) {
      context.imageSmoothingEnabled = false;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(tileToCanvas(preview), 0, 0, canvas.width, canvas.height);
    }
  }, [preview]);

  const writeable = session.mode === 'readwrite';

  const handleJump = () => {
    const index = parseIndex(jump, STATIC_COUNT);
    if (index === null) {
      setStatus('Enter an index between 0 and 0x3FFF.');
      return;
    }
    setSelected(index);
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
    anchor.download = `${mode === 'land' ? 'land' : 'item'}-${selected.toString(16).padStart(4, '0')}.png`;
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
      if (mode === 'land' && (tile.width !== 44 || tile.height !== 44)) {
        setStatus('Land tiles must be exactly 44×44 pixels.');
        return;
      }
      if (mode === 'land') {
        source.writeLand(selected, tile);
      } else {
        source.writeStatic(selected, tile);
      }
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
      await saveArtSource(source);
      const fresh = await getArtSource(true);
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

  useUrlStateSync({
    apply: () => {
      if (params.mode === 'land' || params.mode === 'items') {
        setMode(params.mode);
      }
      const parsed = parseIndexParam(params.id);
      if (parsed !== null) {
        setSelected(parsed);
      }
    },
    paramKey: `${params.mode ?? 'items'}|${(params.id ?? '').toLowerCase()}`,
    stateKey: `${mode}|${(selected === null ? '' : formatIndexParam(selected)).toLowerCase()}`,
    sync: () => {
      const id = selected === null ? undefined : formatIndexParam(selected);
      void navigate({ to: '/art/{-$mode}/{-$id}', params: { id, mode }, replace: true });
    }
  });
  useDocumentMeta(
    selected !== null ? `${mode === 'land' ? 'Land' : 'Item'} ${indexLabel(selected)} — Sosarium` : 'Art — Sosarium',
    selected !== null
      ? `Ultima Online ${mode === 'land' ? 'land tile' : 'item art'} ${indexLabel(selected)} — Sosarium.`
      : 'Browse and edit Ultima Online land tiles and item art in Sosarium.'
  );

  useEffect(() => {
    if (session.status !== 'ready') {
      setTileData(null);
      setAnimdata(null);
      return;
    }
    let cancelled = false;
    Promise.all([getTileDataSource(), getAnimdata()])
      .then(([data, anim]) => {
        if (cancelled) {
          return;
        }
        setTileData(data);
        setAnimdata(anim);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [session]);

  const detailRows: { label: string; value: string }[] = [];
  if (tileData && selected !== null) {
    if (mode === 'land') {
      const land = tileData.land[selected];
      if (land) {
        detailRows.push(
          { label: 'Name', value: land.name || '(unnamed)' },
          { label: 'Texture', value: indexLabel(land.textureId) },
          { label: 'Flags', value: decodeFlags(land.flags).join(', ') || 'none' }
        );
      }
    } else {
      const item = tileData.items[selected];
      if (item) {
        const flags = decodeFlags(item.flags);
        detailRows.push(
          { label: 'Name', value: item.name || '(unnamed)' },
          { label: 'Graphic', value: `${indexLabel(selected)} (${selected})` },
          { label: 'Height/Capacity', value: String(item.height) },
          { label: 'Weight', value: String(item.weight) },
          { label: 'Animation', value: String(item.animation) },
          { label: 'Quality/Layer/Light', value: String(item.quality) },
          { label: 'Quantity', value: String(item.quantity) },
          { label: 'Hue', value: String(item.hue) },
          { label: 'StackingOffset/Unk4', value: String(item.stackingOffset) },
          { label: 'Flags', value: flags.join(', ') || 'none' }
        );
        const entry = animdata?.entries.get(selected) ?? null;
        if (flags.includes('Animation') && entry) {
          detailRows.push(
            { label: 'Animation FrameCount', value: String(entry.frameCount) },
            { label: 'Animation Interval', value: String(entry.frameInterval) }
          );
        }
      }
    }
  }

  const modified = source?.hasChanges ?? false;
  const bounds = preview ? measureArtBounds(preview) : null;

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-bronze/20 px-4 py-3 min-h-14">
        <h1 className="font-serif text-xl tracking-widest text-bronze-bright uppercase">Art</h1>
        <div className="flex overflow-hidden rounded border border-bronze/30">
          <button
            className={`px-3 py-1.5 text-xs tracking-widest uppercase ${mode === 'land' ? 'bg-bronze/25 text-bronze-bright' : 'text-parchment/60 hover:bg-bronze/10'}`}
            onClick={() => {
              setMode('land');
              setSelected(null);
            }}
            type="button"
          >
            Land tiles
          </button>
          <button
            className={`px-3 py-1.5 text-xs tracking-widest uppercase ${mode === 'items' ? 'bg-bronze/25 text-bronze-bright' : 'text-parchment/60 hover:bg-bronze/10'}`}
            onClick={() => {
              setMode('items');
              setSelected(null);
            }}
            type="button"
          >
            Items
          </button>
        </div>
        <div className="flex items-center gap-2">
          <input
            className="w-28 rounded border border-bronze/30 bg-ink py-1.5 px-2 text-xs text-parchment/80 placeholder:text-parchment/30"
            onChange={(event) => setJump(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                handleJump();
              }
            }}
            placeholder="0x0EED"
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
                count={STATIC_COUNT}
                hasTile={hasTile}
                hovered={hovered}
                isModified={isModified}
                key={`${mode}-${version}`}
                loadTile={loadTile}
                onHover={setHovered}
                onSelect={setSelected}
                selected={selected}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-parchment/40">Loading art…</div>
            )}
          </div>

          <aside className="scroll-area flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-bronze/20 p-4">
            <h2 className="text-xs tracking-widest text-parchment/40 uppercase">Selection</h2>
            {selected === null ? (
              <p className="text-sm text-parchment/50">Click a tile in the grid, or jump to an index.</p>
            ) : (
              <>
                <div>
                  <div className="font-mono text-lg text-bronze-bright">{indexLabel(selected)}</div>
                  <div className="text-xs text-parchment/50">
                    {mode === 'land' ? 'Land tile' : 'Item'} · {selected} decimal
                  </div>
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
                    <canvas className="max-h-56 max-w-full" ref={previewRef} />
                  ) : (
                    <span className="text-xs text-parchment/30">empty entry</span>
                  )}
                </div>
                {preview ? (
                  <div className="flex flex-col gap-0.5 text-xs text-parchment/50">
                    <span>
                      {preview.width} × {preview.height} px
                    </span>
                    {bounds ? (
                      <span className="font-mono">
                        bounds {bounds.xMin}, {bounds.yMin}, {bounds.xMax}, {bounds.yMax}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {source?.isModified(mode === 'land' ? 'land' : 'static', selected) ? (
                  <span className="w-fit rounded bg-bronze/15 px-2 py-0.5 text-xs text-bronze-bright">modified</span>
                ) : null}
                {detailRows.length > 0 ? (
                  <div className="flex flex-col gap-1 rounded border border-bronze/20 p-2 text-[11px]">
                    <span className="text-[10px] tracking-widest text-parchment/40 uppercase">TileData</span>
                    {detailRows.map((row) => (
                      <div className="flex gap-2" key={row.label}>
                        <span className="w-28 shrink-0 text-parchment/40">{row.label}</span>
                        <span className="min-w-0 break-words font-mono text-parchment/80">{row.value}</span>
                      </div>
                    ))}
                  </div>
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
