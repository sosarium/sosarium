import {
  decodeFlags,
  encodeFlagNames,
  type ItemTileData,
  type LandTileData,
  measureArtBounds,
  TILE_FLAGS,
  type TileDataSource
} from '@sosarium/formats';
import { useForm } from '@tanstack/react-form';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';

import { IndexTable, type IndexTableRow } from '@/components/common/index-table';
import { GitHubButton } from '@/components/github-button';
import { tileToCanvas } from '@/lib/art-image';
import { getArtSource } from '@/lib/art-session';
import { useDocumentMeta } from '@/lib/document-meta';
import { useSession } from '@/lib/session';
import { getTileDataSource, saveTileDataSource } from '@/lib/tiledata-session';

export const Route = createFileRoute('/_shell/tiledata')({
  component: TileDataEditor
});

type SourceData = TileDataSource;

function TileDataEditor() {
  useDocumentMeta('TileData — Sosarium');
  const session = useSession();
  const [source, setSource] = useState<SourceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'items' | 'land'>('items');
  const [selected, setSelected] = useState<number | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (session.status !== 'ready') {
      setSource(null);
      return;
    }
    let cancelled = false;
    setSource(null);
    setError(null);
    getTileDataSource()
      .then((value) => {
        if (cancelled) {
          return;
        }
        if (value) {
          setSource(value);
        } else {
          setError('tiledata.mul is not available in this session.');
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not open tiledata.mul.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const rows = useMemo<IndexTableRow[]>(() => {
    void version;
    if (!source) {
      return [];
    }
    const table = mode === 'items' ? source.items : source.land;
    return table.map((tile, index) => ({ index, name: tile.name }));
  }, [source, mode, version]);

  const selectedItem = mode === 'items' && source && selected !== null ? source.items[selected] : undefined;
  const selectedLand = mode === 'land' && source && selected !== null ? source.land[selected] : undefined;

  const writeable = session.mode === 'readwrite';
  const modified = source?.hasChanges ?? false;

  const applyItem = (patch: Partial<ItemTileData>) => {
    if (!source || selected === null) {
      return;
    }
    source.updateItem(selected, patch);
    setVersion((value) => value + 1);
    setStatus('Applied — save to write the change to disk.');
  };

  const applyLand = (patch: Partial<LandTileData>) => {
    if (!source || selected === null) {
      return;
    }
    source.updateLand(selected, patch);
    setVersion((value) => value + 1);
    setStatus('Applied — save to write the change to disk.');
  };

  const handleSave = async () => {
    if (!source || session.mode !== 'readwrite') {
      return;
    }
    setBusy(true);
    setStatus('Saving…');
    try {
      await saveTileDataSource(source);
      const fresh = await getTileDataSource(true);
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
        <h1 className="font-serif text-xl tracking-widest text-bronze-bright uppercase">TileData</h1>
        <div className="flex overflow-hidden rounded border border-bronze/30">
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
          <button
            className={`px-3 py-1.5 text-xs tracking-widest uppercase ${mode === 'land' ? 'bg-bronze/25 text-bronze-bright' : 'text-parchment/60 hover:bg-bronze/10'}`}
            onClick={() => {
              setMode('land');
              setSelected(null);
            }}
            type="button"
          >
            Land
          </button>
        </div>
        <div className="flex-1" />
        {modified ? <span className="text-xs text-bronze-bright">{source?.modifiedCount ?? 0} unsaved</span> : null}
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
          <div className="min-w-0 flex-1">
            {source ? (
              <IndexTable
                isModified={(index) => source.isModified(mode, index)}
                key={`${mode}-${version === 0 ? 'initial' : 'loaded'}`}
                onSelect={setSelected}
                rows={rows}
                selected={selected}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-parchment/40">Loading tiledata…</div>
            )}
          </div>

          <aside className="scroll-area flex w-96 shrink-0 flex-col gap-3 overflow-y-auto border-l border-bronze/20 p-4">
            <h2 className="text-xs tracking-widest text-parchment/40 uppercase">Details</h2>
            {selected === null ? (
              <p className="text-sm text-parchment/50">Select an entry to view and edit it.</p>
            ) : mode === 'items' && selectedItem ? (
              <ItemDetails
                item={selectedItem}
                itemIndex={selected}
                key={`item-${selected}-${version}`}
                onApply={applyItem}
              />
            ) : mode === 'land' && selectedLand ? (
              <LandDetails
                key={`land-${selected}-${version}`}
                land={selectedLand}
                landIndex={selected}
                onApply={applyLand}
              />
            ) : null}
          </aside>
        </div>
      )}

      <footer className="mt-auto flex min-h-11 items-center justify-between border-t border-bronze/20 px-4 py-1.5 text-xs text-parchment/40">
        <span>{source ? `${source.format.toUpperCase()} tiledata format` : ''}</span>
        <span>{status ?? (writeable ? 'Editing enabled' : 'Read-only session')}</span>
      </footer>
    </div>
  );
}

function ArtPreview({ tileIndex, kind }: Readonly<{ tileIndex: number; kind: 'item' | 'land' }>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setMissing(false);
    setSummary(null);
    getArtSource()
      .then(async (art) => {
        if (!art) {
          throw new Error('art not available');
        }
        const tile = kind === 'item' ? await art.readStatic(tileIndex) : await art.readLand(tileIndex);
        if (cancelled) {
          return;
        }
        if (!tile) {
          setMissing(true);
          return;
        }
        const bounds = measureArtBounds(tile);
        setSummary(
          bounds
            ? `${tile.width} × ${tile.height} px · bounds ${bounds.xMin}, ${bounds.yMin}, ${bounds.xMax}, ${bounds.yMax}`
            : `${tile.width} × ${tile.height} px`
        );
        const canvas = canvasRef.current;
        if (canvas) {
          const rendered = tileToCanvas(tile);
          canvas.width = tile.width * 2;
          canvas.height = tile.height * 2;
          const context = canvas.getContext('2d');
          if (context) {
            context.imageSmoothingEnabled = false;
            context.drawImage(rendered, 0, 0, canvas.width, canvas.height);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMissing(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tileIndex, kind]);

  return (
    <div className="flex flex-col gap-1">
      <div
        className="flex min-h-24 items-center justify-center rounded border border-bronze/20 p-2"
        style={{
          backgroundImage:
            'linear-gradient(45deg, #1a1613 25%, transparent 25%), linear-gradient(-45deg, #1a1613 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1a1613 75%), linear-gradient(-45deg, transparent 75%, #1a1613 75%)',
          backgroundSize: '16px 16px',
          backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0'
        }}
      >
        {missing ? (
          <span className="text-xs text-parchment/30">no art</span>
        ) : (
          <canvas className="max-h-48 max-w-full" ref={canvasRef} />
        )}
      </div>
      {summary ? <div className="text-xs text-parchment/50">{summary}</div> : null}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 255
}: Readonly<{ label: string; value: number; onChange: (value: number) => void; min?: number; max?: number }>) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-parchment/60">
      <span>{label}</span>
      <input
        className="w-24 rounded border border-bronze/30 bg-ink px-2 py-1 text-right text-parchment/85"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        type="number"
        value={value}
      />
    </label>
  );
}

function FlagGrid({ value, onChange }: Readonly<{ value: string[]; onChange: (next: string[]) => void }>) {
  return (
    <div className="sf-opt scroll-area max-h-56 overflow-y-auto rounded border border-bronze/20 p-2">
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {TILE_FLAGS.map((flag) => {
          const checked = value.includes(flag.name);
          return (
            <label className="flex items-center gap-1.5 text-[11px] text-parchment/70" key={flag.name}>
              <input
                checked={checked}
                className="accent-bronze"
                onChange={() => onChange(checked ? value.filter((name) => name !== flag.name) : [...value, flag.name])}
                type="checkbox"
              />
              {flag.name}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function ItemDetails({
  item,
  itemIndex,
  onApply
}: Readonly<{ item: ItemTileData; itemIndex: number; onApply: (patch: Partial<ItemTileData>) => void }>) {
  const form = useForm({
    defaultValues: {
      name: item.name,
      flags: decodeFlags(item.flags),
      weight: item.weight,
      quality: item.quality,
      animation: item.animation,
      quantity: item.quantity,
      hue: item.hue,
      stackingOffset: item.stackingOffset,
      height: item.height
    },
    onSubmit: ({ value }) => {
      onApply({
        name: value.name.slice(0, 20),
        flags: encodeFlagNames(value.flags),
        weight: value.weight,
        quality: value.quality,
        animation: value.animation,
        quantity: value.quantity,
        hue: value.hue,
        stackingOffset: value.stackingOffset,
        height: value.height
      });
    }
  });

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="font-mono text-lg text-bronze-bright">
          0x{itemIndex.toString(16).toUpperCase().padStart(4, '0')}
        </div>
        <div className="text-xs text-parchment/50">Item · {itemIndex} decimal</div>
      </div>

      <ArtPreview kind="item" tileIndex={itemIndex} />

      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="name">
          {(field) => (
            <label className="flex flex-col gap-1 text-xs text-parchment/60">
              Name
              <input
                className="rounded border border-bronze/30 bg-ink px-2 py-1.5 text-sm text-parchment/85"
                maxLength={20}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                value={field.state.value}
              />
            </label>
          )}
        </form.Field>

        <div className="flex flex-col gap-1.5">
          <form.Field name="height">
            {(field) => (
              <NumberField label="Height / capacity" onChange={field.handleChange} value={field.state.value} />
            )}
          </form.Field>
          <form.Field name="weight">
            {(field) => <NumberField label="Weight" onChange={field.handleChange} value={field.state.value} />}
          </form.Field>
          <form.Field name="quality">
            {(field) => (
              <NumberField label="Quality / layer / light" onChange={field.handleChange} value={field.state.value} />
            )}
          </form.Field>
          <form.Field name="animation">
            {(field) => (
              <NumberField
                label="Animation"
                max={32767}
                min={-32768}
                onChange={field.handleChange}
                value={field.state.value}
              />
            )}
          </form.Field>
          <form.Field name="quantity">
            {(field) => <NumberField label="Quantity" onChange={field.handleChange} value={field.state.value} />}
          </form.Field>
          <form.Field name="hue">
            {(field) => <NumberField label="Hue" onChange={field.handleChange} value={field.state.value} />}
          </form.Field>
          <form.Field name="stackingOffset">
            {(field) => (
              <NumberField label="Stacking offset / unk4" onChange={field.handleChange} value={field.state.value} />
            )}
          </form.Field>
        </div>

        <form.Field name="flags">
          {(field) => (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-parchment/60">Flags</span>
              <FlagGrid onChange={field.handleChange} value={field.state.value} />
            </div>
          )}
        </form.Field>

        <div className="sticky bottom-0 -mx-1 mt-1 border-t border-bronze/20 bg-ink pt-2 pb-1">
          <button
            className="w-full rounded border border-bronze/60 bg-bronze/10 px-4 py-1.5 text-xs tracking-widest text-bronze-bright uppercase hover:bg-bronze/20"
            type="submit"
          >
            Apply changes
          </button>
        </div>
      </form>
    </div>
  );
}

function LandDetails({
  land,
  landIndex,
  onApply
}: Readonly<{ land: LandTileData; landIndex: number; onApply: (patch: Partial<LandTileData>) => void }>) {
  const form = useForm({
    defaultValues: {
      name: land.name,
      textureId: land.textureId,
      flags: decodeFlags(land.flags)
    },
    onSubmit: ({ value }) => {
      onApply({
        name: value.name.slice(0, 20),
        textureId: value.textureId & 0xffff,
        flags: encodeFlagNames(value.flags)
      });
    }
  });

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="font-mono text-lg text-bronze-bright">
          0x{landIndex.toString(16).toUpperCase().padStart(4, '0')}
        </div>
        <div className="text-xs text-parchment/50">Land · {landIndex} decimal</div>
      </div>

      <ArtPreview kind="land" tileIndex={landIndex} />

      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="name">
          {(field) => (
            <label className="flex flex-col gap-1 text-xs text-parchment/60">
              Name
              <input
                className="rounded border border-bronze/30 bg-ink px-2 py-1.5 text-sm text-parchment/85"
                maxLength={20}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                value={field.state.value}
              />
            </label>
          )}
        </form.Field>

        <form.Field name="textureId">
          {(field) => (
            <NumberField label="Texture id" max={65535} onChange={field.handleChange} value={field.state.value} />
          )}
        </form.Field>

        <form.Field name="flags">
          {(field) => (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-parchment/60">Flags</span>
              <FlagGrid onChange={field.handleChange} value={field.state.value} />
            </div>
          )}
        </form.Field>

        <div className="sticky bottom-0 -mx-1 mt-1 border-t border-bronze/20 bg-ink pt-2 pb-1">
          <button
            className="w-full rounded border border-bronze/60 bg-bronze/10 px-4 py-1.5 text-xs tracking-widest text-bronze-bright uppercase hover:bg-bronze/20"
            type="submit"
          >
            Apply changes
          </button>
        </div>
      </form>
    </div>
  );
}
