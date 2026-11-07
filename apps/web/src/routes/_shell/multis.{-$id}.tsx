import {
  boundsFor,
  MULTIMAP_HEIGHT,
  MULTIMAP_WIDTH,
  type MultiComponent,
  type MultiGroup,
  type MultiMapImage,
  parseMultiMapRle,
  serializeMultiMapRle
} from '@sosarium/formats';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { GitHubButton } from '@/components/github-button';
import { formatHex, MultiComponentPanel } from '@/components/multis/multi-component-panel';
import { type PreviewLoader, ThumbnailList, type ThumbnailRow } from '@/components/thumbnail-list';
import { getArtSource } from '@/lib/art-session';
import { formatIndexParam, parseIndexParam } from '@/lib/deep-link';
import { useDocumentMeta } from '@/lib/document-meta';
import { findFile } from '@/lib/file-access';
import { renderMultiComposition } from '@/lib/multi-image';
import { MULTI_LIST } from '@/lib/multi-list-data';
import { getMultisSource, saveMultiEdits } from '@/lib/multis-session';
import { useSession } from '@/lib/session';
import { useUrlStateSync } from '@/lib/use-url-state';

export const Route = createFileRoute('/_shell/multis/{-$id}')({
  component: MultisPage
});

function MultisPage() {
  const session = useSession();
  const params = Route.useParams();
  const navigate = useNavigate();
  const [ids, setIds] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);

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
      void navigate({ to: '/multis/{-$id}', params: { id: formatIndexParam(selected) }, replace: true });
    }
  });

  useDocumentMeta(
    selected !== null ? `Multi ${formatIndexParam(selected)} — Sosarium` : 'Multis — Sosarium',
    selected !== null
      ? `Ultima Online multi structure ${formatIndexParam(selected)} — Sosarium.`
      : 'Ultima Online multi structure browser for Ultima Online client files.'
  );
  const [group, setGroup] = useState<MultiGroup | null>(null);
  const [edits, setEdits] = useState<Map<number, MultiGroup>>(new Map());
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState<string | null>(null);
  const [componentIndex, setComponentIndex] = useState(0);
  const [form, setForm] = useState({ id: '0x1', x: '0', y: '0', z: '0' });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [tab, setTab] = useState<'composition' | 'multimap'>('composition');
  const [multiMap, setMultiMap] = useState<MultiMapImage | null>(null);
  const [multiMapDirty, setMultiMapDirty] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const multiMapCanvasRef = useRef<HTMLCanvasElement>(null);
  const multiMapInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (session.status !== 'ready') {
      setIds([]);
      return;
    }
    let cancelled = false;
    setStatus('loading multi.mul…');
    setError(null);
    getMultisSource()
      .then((source) => {
        if (cancelled) {
          return;
        }
        if (!source) {
          setError('multi.mul/multi.idx are not available in this session.');
          setStatus('error');
          return;
        }
        const available = source.ids();
        setIds(available);
        setStatus(`${available.length} multis`);
        setSelected((current) => current ?? MULTI_LIST[0]?.id ?? available[0] ?? null);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'could not open multi.mul');
          setStatus('error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const loadPreview = useMemo<PreviewLoader | null>(() => {
    if (ids.length === 0) {
      return null;
    }
    const cache = new Map<number, Promise<HTMLCanvasElement | null>>();
    let active = 0;
    const pending: (() => void)[] = [];
    return (id: number) => {
      const cached = cache.get(id);
      if (cached) {
        return cached;
      }
      const promise = new Promise<HTMLCanvasElement | null>((resolve) => {
        const start = () => {
          active++;
          void (async () => {
            try {
              const source = await getMultisSource();
              const art = await getArtSource();
              const target = edits.get(id) ?? (await source?.read(id)) ?? null;
              if (!target || !art) {
                resolve(null);
                return;
              }
              resolve(await renderMultiComposition(target, art, 40));
            } catch (cause) {
              console.warn(`multi ${id} thumbnail failed`, cause);
              resolve(null);
            } finally {
              active--;
              pending.shift()?.();
            }
          })();
        };
        if (active < 2) {
          start();
        } else {
          pending.push(start);
        }
      });
      cache.set(id, promise);
      return promise;
    };
  }, [ids, edits]);

  useEffect(() => {
    if (selected === null || ids.length === 0) {
      setGroup(null);
      return;
    }
    const edited = edits.get(selected);
    if (edited) {
      setGroup(edited);
      return;
    }
    let cancelled = false;
    void (async () => {
      const source = await getMultisSource();
      const value = await source?.read(selected);
      if (!cancelled) {
        setGroup(value ?? null);
        setComponentIndex(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected, ids, edits]);

  useEffect(() => {
    const art = getArtSource();
    void art;
    setRenderError(null);
    if (!group) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const source = await getArtSource();
      if (!source) {
        return;
      }
      let canvas: HTMLCanvasElement | null;
      try {
        canvas = await renderMultiComposition(group, source);
      } catch (cause) {
        if (!cancelled) {
          setRenderError(cause instanceof Error ? cause.message : 'could not render this multi');
        }
        return;
      }
      if (cancelled || !canvas) {
        return;
      }
      const target = canvasRef.current;
      if (!target) {
        return;
      }
      const scale = Math.min(1, 512 / canvas.width, 512 / canvas.height);
      target.width = Math.max(1, Math.round(canvas.width * scale));
      target.height = Math.max(1, Math.round(canvas.height * scale));
      const context = target.getContext('2d');
      if (!context) {
        return;
      }
      context.imageSmoothingEnabled = false;
      context.drawImage(canvas, 0, 0, target.width, target.height);
    })();
    return () => {
      cancelled = true;
    };
  }, [group]);

  useEffect(() => {
    if (tab !== 'multimap') {
      return;
    }
    let cancelled = false;
    void (async () => {
      if (multiMap) {
        return;
      }
      const name = findFile(session, 'Multimap.rle');
      if (!name) {
        setError('Multimap.rle is not available in this session.');
        return;
      }
      const file =
        session.filesByName?.get(name.toLowerCase()) ??
        (session.handle ? await (await session.handle.getFileHandle(name)).getFile() : null);
      if (!file || cancelled) {
        return;
      }
      setMultiMap(parseMultiMapRle(new Uint8Array(await file.arrayBuffer())));
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, multiMap, session]);

  useEffect(() => {
    const canvas = multiMapCanvasRef.current;
    if (!canvas || !multiMap) {
      return;
    }
    const scale = Math.min(1, 384 / multiMap.width, 384 / multiMap.height);
    canvas.width = Math.round(multiMap.width * scale);
    canvas.height = Math.round(multiMap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    const image = context.createImageData(multiMap.width, multiMap.height);
    for (let i = 0; i < multiMap.pixels.length; i++) {
      const color = multiMap.pixels[i] === 0x8000 ? 0 : 255;
      image.data[i * 4] = color;
      image.data[i * 4 + 1] = color;
      image.data[i * 4 + 2] = color;
      image.data[i * 4 + 3] = 255;
    }
    const scratch = document.createElement('canvas');
    scratch.width = multiMap.width;
    scratch.height = multiMap.height;
    scratch.getContext('2d')?.putImageData(image, 0, 0);
    context.imageSmoothingEnabled = false;
    context.drawImage(scratch, 0, 0, canvas.width, canvas.height);
  }, [multiMap]);

  const componentRows = useMemo(
    () =>
      (group?.components ?? []).map((component, slot) => ({
        component,
        slot,
        rowKey: `${slot}:${component.id}:${component.x}:${component.y}:${component.z}:${component.flags.toString(16)}`
      })),
    [group]
  );

  const rows = useMemo<ThumbnailRow[]>(() => {
    const available = new Set(ids);
    const named = new Set(MULTI_LIST.map((entry) => entry.id));
    const list = MULTI_LIST.filter((entry) => available.has(entry.id)).map((entry) => ({
      id: entry.id,
      name: entry.name,
      subtitle: `multi ${entry.id} · ${formatHex(entry.id)}`
    }));
    const extras = ids
      .filter((id) => !named.has(id))
      .map((id) => ({ id, name: `unlisted multi ${formatHex(id)}`, subtitle: `multi ${id}` }));
    return [...list, ...extras];
  }, [ids]);

  const applyEdit = useCallback(
    (mutate: (components: MultiComponent[]) => MultiComponent[]) => {
      if (!group || selected === null) {
        return;
      }
      const components = mutate([...group.components]);
      const updated: MultiGroup = { components, ...boundsFor(components) };
      setGroup(updated);
      setEdits((current) => new Map(current).set(selected, updated));
    },
    [group, selected]
  );

  const parseField = (value: string) => {
    const trimmed = value.trim();
    const parsed = Number.parseInt(trimmed.replace(/^0x/i, ''), trimmed.startsWith('0x') ? 16 : 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  const current = group?.components[componentIndex] ?? null;
  const name = MULTI_LIST.find((entry) => entry.id === selected)?.name ?? null;
  const dirty = edits.size > 0 || multiMapDirty;

  const save = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const written: string[] = [];
      if (edits.size > 0) {
        written.push(...(await saveMultiEdits(edits)));
        setEdits(new Map());
      }
      if (multiMapDirty && multiMap) {
        const name = findFile(session, 'Multimap.rle');
        if (!name || !session.handle) {
          throw new Error('Multimap.rle is not writable in this session');
        }
        const { HandleWritableFile } = await import('@/lib/file-access');
        const writable = new HandleWritableFile(await session.handle.getFileHandle(name));
        await writable.open(false);
        await writable.writeAt(0, serializeMultiMapRle(multiMap));
        await writable.close();
        written.push(name);
        setMultiMapDirty(false);
      }
      setSaveMsg(written.length > 0 ? `saved ${written.join(', ')}` : 'nothing to save');
    } catch (cause) {
      setSaveMsg(cause instanceof Error ? cause.message : 'save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-80 flex-none flex-col border-r border-bronze/20">
        <div className="border-b border-bronze/20 px-3 py-2 text-xs tracking-widest text-parchment/40 uppercase">
          Multis ({rows.length})
        </div>
        {loadPreview ? (
          <ThumbnailList loadPreview={loadPreview} onSelect={setSelected} rows={rows} selected={selected} />
        ) : (
          <div className="p-4 text-xs text-parchment/40">Loading multi list…</div>
        )}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-bronze/20 px-4 py-3 min-h-14">
          <h1 className="min-w-0 truncate font-serif text-lg tracking-widest text-bronze-bright">
            {name ?? (selected !== null ? `unlisted multi ${formatHex(selected)}` : 'Multis')}
          </h1>
          <div className="flex-1" />
          {(['composition', 'multimap'] as const).map((value) => (
            <button
              className={`rounded border px-3 py-1.5 text-xs tracking-widest uppercase ${
                tab === value ? 'border-bronze bg-bronze/20 text-bronze-bright' : 'border-bronze/20 text-parchment/40'
              }`}
              key={value}
              onClick={() => setTab(value)}
              type="button"
            >
              {value === 'multimap' ? 'MultiMap' : 'Composition'}
            </button>
          ))}
          <button
            className={`rounded border px-3 py-1.5 text-xs tracking-widest uppercase ${
              dirty && session.mode === 'readwrite'
                ? 'border-bronze text-bronze-bright hover:border-bronze/60'
                : 'border-bronze/20 text-parchment/30'
            }`}
            disabled={!dirty || session.mode !== 'readwrite' || saving}
            onClick={() => {
              save().catch(() => undefined);
            }}
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
        ) : tab === 'composition' ? (
          <div className="flex min-h-0 flex-1">
            <div className="flex min-h-0 flex-1 items-center justify-center p-4">
              <div
                className="rounded border border-bronze/20"
                style={{
                  backgroundImage:
                    'linear-gradient(45deg, #1a1613 25%, transparent 25%), linear-gradient(-45deg, #1a1613 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1a1613 75%), linear-gradient(-45deg, transparent 75%, #1a1613 75%)',
                  backgroundSize: '16px 16px',
                  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0'
                }}
              >
                <canvas className="block" ref={canvasRef} />
              </div>
            </div>

            <MultiComponentPanel
              applyEdit={applyEdit}
              componentCount={group?.components.length ?? 0}
              componentIndex={componentIndex}
              componentRows={componentRows}
              current={current}
              form={form}
              parseField={parseField}
              setComponentIndex={setComponentIndex}
              setForm={setForm}
              setSaveMsg={setSaveMsg}
            />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center gap-3 p-4">
            <canvas className="rounded border border-bronze/20" ref={multiMapCanvasRef} />
            <div className="flex items-center gap-3 text-xs text-parchment/50">
              <span>
                {multiMap ? `${multiMap.width}×${multiMap.height}` : 'loading…'} · rle
                {multiMapDirty ? ' · modified' : ''}
              </span>
              <button
                className="rounded border border-bronze/30 px-2 py-1 text-parchment/70"
                onClick={() => multiMapInputRef.current?.click()}
                type="button"
              >
                Import PNG
              </button>
              <input
                accept="image/png,image/bmp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (!file) {
                    return;
                  }
                  void (async () => {
                    const bitmap = await createImageBitmap(file);
                    if (bitmap.width !== MULTIMAP_WIDTH || bitmap.height !== MULTIMAP_HEIGHT) {
                      setSaveMsg(
                        `image must be ${MULTIMAP_WIDTH}×${MULTIMAP_HEIGHT} (got ${bitmap.width}×${bitmap.height})`
                      );
                      return;
                    }
                    const scratch = document.createElement('canvas');
                    scratch.width = bitmap.width;
                    scratch.height = bitmap.height;
                    const context = scratch.getContext('2d');
                    if (!context) {
                      return;
                    }
                    context.drawImage(bitmap, 0, 0);
                    const data = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
                    const pixels = new Uint16Array(bitmap.width * bitmap.height);
                    for (let i = 0; i < pixels.length; i++) {
                      const luminance =
                        (data[i * 4] as number) + (data[i * 4 + 1] as number) + (data[i * 4 + 2] as number);
                      pixels[i] = luminance < 384 ? 0x8000 : 0xffff;
                    }
                    setMultiMap({ width: bitmap.width, height: bitmap.height, pixels });
                    setMultiMapDirty(true);
                    setSaveMsg(`multimap imported from ${file.name}`);
                  })();
                }}
                ref={multiMapInputRef}
                type="file"
              />
            </div>
          </div>
        )}

        <footer className="mt-auto flex min-h-11 items-center justify-between gap-4 border-t border-bronze/20 px-4 py-1.5 text-xs text-parchment/40">
          <span className="truncate">
            {selected !== null ? `id ${selected} · ${formatHex(selected)}` : ''}
            {group
              ? ` · ${group.components.length} components · ${group.width}×${group.height} · maxHeight ${group.maxHeight}`
              : ''}
          </span>
          <span className="truncate">
            {status}
            {saveMsg ? ` · ${saveMsg}` : ''}
            {renderError ? ` · ${renderError}` : ''}
          </span>
        </footer>
      </section>
    </div>
  );
}
