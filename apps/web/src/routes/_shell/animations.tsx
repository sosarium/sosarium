import {
  type AnimationFrameData,
  type AnimationSource,
  type Animdata,
  decodeEditGroup,
  decodeUopActionEntryForEdit,
  type EditGroup,
  encodeUopActionEntry,
  legacyIndexFor,
  pixelsFromFrame,
  runsFromPixels
} from '@sosarium/formats';
import { rgbaToPixels } from '@sosarium/render';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AnimdataBar } from '@/components/animations/animdata-bar';
import { FrameStrip } from '@/components/animations/frame-strip';
import { GitHubButton } from '@/components/github-button';
import { ThumbnailList, type ThumbnailRow } from '@/components/thumbnail-list';
import { EQUIPMENT_LIST, MOB_LIST } from '@/lib/animation-list-data';
import { actionName, directionName } from '@/lib/animation-names';
import { animationDetails, createPreviewLoader } from '@/lib/animation-preview';
import { getAnimdata, saveAnimationEdits } from '@/lib/animations-save';
import { getAnimationSource, invalidateAnimationSource } from '@/lib/animations-session';
import { tileToCanvas, tileToPngBlob } from '@/lib/art-image';
import { getPreferences } from '@/lib/preferences';
import { useSession } from '@/lib/session';

export const Route = createFileRoute('/_shell/animations')({
  component: AnimationPlayer
});

const DIRECTIONS = [0, 1, 2, 3, 4, 5, 6, 7];
const CANVAS_WIDTH = 300;
const CANVAS_HEIGHT = 260;

const groupKey = (body: number, action: number, direction: number) => `${body}:${action}:${direction}`;

function AnimationPlayer() {
  const session = useSession();
  const [source, setSource] = useState<AnimationSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'mobs' | 'equipment'>('mobs');
  const [body, setBody] = useState<number | null>(null);
  const [actions, setActions] = useState<number[]>([]);
  const [action, setAction] = useState(0);
  const [direction, setDirection] = useState(0);
  const [frames, setFrames] = useState<AnimationFrameData[] | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const frameIntervalMs = getPreferences().animationFrameMs;
  const [status, setStatus] = useState<string | null>(null);
  const [edits, setEdits] = useState<Map<string, EditGroup>>(new Map());
  const [editing, setEditing] = useState<EditGroup | null>(null);
  const [previewFrame, setPreviewFrame] = useState<AnimationFrameData | null>(null);
  const [animdata, setAnimdata] = useState<Animdata | null>(null);
  const [animdataDirty, setAnimdataDirty] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (session.status !== 'ready') {
      setSource(null);
      return;
    }
    let cancelled = false;
    setSource(null);
    setError(null);
    getAnimationSource(reloadKey > 0)
      .then((value) => {
        if (cancelled) {
          return;
        }
        if (!value) {
          setError('Animation files are not available in this session.');
          return;
        }
        setSource(value);
        const first = MOB_LIST[0]?.body ?? value.bodies()[0] ?? null;
        setBody((current) => current ?? first);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not open the animation files.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session, reloadKey]);

  useEffect(() => {
    if (session.status !== 'ready') {
      setAnimdata(null);
      return;
    }
    let cancelled = false;
    getAnimdata()
      .then((value) => {
        if (!cancelled) {
          setAnimdata(value);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAnimdata(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const loadPreview = useMemo(() => (source ? createPreviewLoader(source) : null), [source]);

  const rows = useMemo<ThumbnailRow[]>(() => {
    const named = new Set<number>([...MOB_LIST, ...EQUIPMENT_LIST].map((entry) => entry.body));
    const subtitle = (body: number) => `body ${body} · 0x${body.toString(16).toUpperCase()}`;
    if (tab === 'equipment') {
      return EQUIPMENT_LIST.map((entry) => ({ id: entry.body, name: entry.name, subtitle: subtitle(entry.body) }));
    }
    const mobs = MOB_LIST.map((entry) => ({ id: entry.body, name: entry.name, subtitle: subtitle(entry.body) }));
    const extras = (source?.bodies() ?? [])
      .filter((value) => !named.has(value))
      .map((value) => ({
        id: value,
        name: `unlisted body 0x${value.toString(16).toUpperCase()}`,
        subtitle: subtitle(value)
      }));
    return [...mobs, ...extras];
  }, [tab, source]);

  const listEntry =
    body === null ? null : ([...MOB_LIST, ...EQUIPMENT_LIST].find((entry) => entry.body === body) ?? null);
  const name = listEntry?.name ?? (body !== null ? `unlisted body 0x${body.toString(16).toUpperCase()}` : null);

  useEffect(() => {
    if (!source || body === null) {
      setActions([]);
      return;
    }
    const list = source.actions(body);
    setActions(list);
    if (!list.includes(action)) {
      setAction(list[0] ?? 0);
    }
  }, [source, body, action]);

  useEffect(() => {
    if (!source || body === null) {
      setFrames(null);
      return;
    }
    let cancelled = false;
    setPreviewFrame(null);
    setStatus('Loading frames…');
    source
      .read(body, action, direction)
      .then((value) => {
        if (cancelled) {
          return;
        }
        setFrames(value);
        setFrameIndex(0);
        setStatus(value ? `${value.length} frame${value.length === 1 ? '' : 's'}` : 'no animation data');
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setFrames(null);
          setStatus(cause instanceof Error ? cause.message : 'could not read frames');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [source, body, action, direction]);

  useEffect(() => {
    if (!source || body === null) {
      setEditing(null);
      return;
    }
    const existing = edits.get(groupKey(body, action, direction));
    if (existing) {
      setEditing(existing);
      return;
    }
    let cancelled = false;
    (async () => {
      const kind = source.kind(body);
      if (kind === 'legacy') {
        const group = await source.readGroup(body, action, direction);
        if (!cancelled && group) {
          setEditing(decodeEditGroup(group.bytes));
        } else if (!cancelled) {
          setEditing(null);
        }
        return;
      }
      if (kind === 'uop') {
        const entry = await source.readActionEntry(body, action);
        if (cancelled || !entry) {
          setEditing(null);
          return;
        }
        const directions = decodeUopActionEntryForEdit(entry.bytes);
        const readDirection = direction <= 4 ? direction : direction - (direction - 4) * 2;
        setEditing(directions[readDirection] ?? null);
        return;
      }
      setEditing(null);
    })().catch(() => setEditing(null));
    return () => {
      cancelled = true;
    };
  }, [source, body, action, direction, edits]);

  useEffect(() => {
    if (!playing || !frames || frames.length < 2) {
      return;
    }
    const timer = window.setInterval(() => {
      setFrameIndex((index) => (index + 1) % frames.length);
    }, frameIntervalMs);
    return () => window.clearInterval(timer);
  }, [playing, frames, frameIntervalMs]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    const frame = previewFrame ?? frames?.[frameIndex];
    if (!frame || frame.width === 0) {
      return;
    }
    const details = animationDetails(previewFrame ? [previewFrame] : (frames ?? []));
    if (!details) {
      return;
    }
    const scale = Math.min(1, (CANVAS_WIDTH - 16) / details.width, (CANVAS_HEIGHT - 16) / details.height);
    const offsetX = (CANVAS_WIDTH - details.width * scale) / 2;
    const offsetY = (CANVAS_HEIGHT - details.height * scale) / 2;
    context.imageSmoothingEnabled = false;
    context.drawImage(
      tileToCanvas(frame),
      offsetX + (details.drawCenterX - frame.centerX) * scale,
      offsetY + (details.drawCenterY - frame.centerY - frame.height) * scale,
      frame.width * scale,
      frame.height * scale
    );
  }, [frames, frameIndex, previewFrame]);

  const strip = useMemo(
    () => (frames ?? []).map((frame, index) => ({ key: `frame-${index}`, frame, index })),
    [frames]
  );
  const kind = source && body !== null ? source.kind(body) : null;
  const current = frames?.[frameIndex];
  const selectBody = useCallback((value: number) => setBody(value), []);
  const animdataId = body !== null ? legacyIndexFor(1, body, action, direction) : null;
  const animdataEntry = animdata && animdataId !== null ? (animdata.entries.get(animdataId) ?? null) : null;
  const dirty = edits.size > 0 || animdataDirty;
  const canWrite = session.mode === 'readwrite';

  const exportFrame = async () => {
    if (!current || current.width === 0 || body === null) {
      return;
    }
    const blob = await tileToPngBlob(current);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `anim_${body}_${action}_${direction}_${frameIndex}.png`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importFrame = async (file: File) => {
    if (!editing || !current || current.width === 0 || body === null) {
      return;
    }
    const bitmap = await createImageBitmap(file);
    const scratch = document.createElement('canvas');
    scratch.width = bitmap.width;
    scratch.height = bitmap.height;
    const context = scratch.getContext('2d');
    if (!context) {
      return;
    }
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const pixels = rgbaToPixels(data);
    const runs = runsFromPixels(pixels, bitmap.width, bitmap.height, editing.palette, current.centerX, current.centerY);
    const replacement = {
      centerX: current.centerX,
      centerY: current.centerY,
      width: bitmap.width,
      height: bitmap.height,
      runs
    };
    const updated: EditGroup = {
      palette: editing.palette,
      frames: editing.frames.map((frame, index) => (index === frameIndex ? replacement : frame))
    };
    setEditing(updated);
    setEdits(new Map(edits).set(groupKey(body, action, direction), updated));
    setPreviewFrame({
      centerX: replacement.centerX,
      centerY: replacement.centerY,
      width: replacement.width,
      height: replacement.height,
      pixels: pixelsFromFrame(replacement, editing.palette)
    });
    setSaveMessage(`frame ${frameIndex} replaced from ${file.name} — save to write it`);
  };

  const updateAnimdata = (field: 'frameCount' | 'frameInterval' | 'frameStart', value: number) => {
    if (!animdata || animdataId === null) {
      return;
    }
    const entries = new Map(animdata.entries);
    const entry = entries.get(animdataId) ?? {
      frameData: new Int8Array(64),
      unknown: 0,
      frameCount: 0,
      frameInterval: 0,
      frameStart: 0
    };
    entries.set(animdataId, { ...entry, [field]: Math.max(0, Math.min(255, value)) });
    setAnimdata({ ...animdata, entries });
    setAnimdataDirty(true);
  };

  const save = async () => {
    if (!source || body === null || !dirty) {
      return;
    }
    setSaving(true);
    setSaveMessage(null);
    try {
      const uopEdits = new Map();
      const legacyEdits = new Map();
      const bodyKind = source.kind(body);
      for (const [key, group] of edits) {
        const [editBody, editAction, editDirection] = key.split(':').map(Number) as [number, number, number];
        if (bodyKind === 'uop') {
          const entry = await source.readActionEntry(editBody, editAction);
          if (!entry) {
            continue;
          }
          const directions = decodeUopActionEntryForEdit(entry.bytes);
          const readDirection = editDirection <= 4 ? editDirection : editDirection - (editDirection - 4) * 2;
          directions[readDirection] = group;
          const payload = encodeUopActionEntry(
            directions,
            source.uop()?.resolvedAction(editBody, editAction) ?? editAction
          );
          const fileMap = (uopEdits.get(entry.file) ?? new Map()) as Map<bigint, Uint8Array>;
          fileMap.set(entry.hash, payload);
          uopEdits.set(entry.file, fileMap);
        } else if (bodyKind === 'legacy') {
          const raw = await source.readGroup(editBody, editAction, editDirection);
          if (!raw) {
            continue;
          }
          const fileMap = (legacyEdits.get(raw.file) ?? new Map()) as Map<number, EditGroup | null>;
          fileMap.set(raw.index, group);
          legacyEdits.set(raw.file, fileMap);
        }
      }
      const written = await saveAnimationEdits({
        uopEdits,
        legacyEdits,
        animdata: animdataDirty ? animdata : null
      });
      setEdits(new Map());
      setPreviewFrame(null);
      setAnimdataDirty(false);
      invalidateAnimationSource();
      setReloadKey((value) => value + 1);
      setSaveMessage(`saved ${written.join(', ')}`);
    } catch (cause) {
      setSaveMessage(cause instanceof Error ? cause.message : 'save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-80 flex-none flex-col border-r border-bronze/20">
        <div className="flex border-b border-bronze/20">
          {(['mobs', 'equipment'] as const).map((value) => (
            <button
              className={`flex-1 px-3 py-2 text-xs tracking-widest uppercase ${
                tab === value ? 'bg-bronze/20 text-bronze-bright' : 'text-parchment/40 hover:text-parchment/70'
              }`}
              key={value}
              onClick={() => setTab(value)}
              type="button"
            >
              {value}
            </button>
          ))}
        </div>
        {loadPreview ? (
          <ThumbnailList loadPreview={loadPreview} onSelect={selectBody} rows={rows} selected={body} />
        ) : (
          <div className="p-4 text-xs text-parchment/40">Loading animation list…</div>
        )}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-bronze/20 px-4 py-3 min-h-14">
          <h1 className="min-w-0 truncate font-serif text-lg tracking-widest text-bronze-bright">
            {name ?? 'Animations'}
          </h1>
          <div className="flex-1" />
          <button
            className="rounded border border-bronze/30 px-3 py-1.5 text-xs tracking-widest text-parchment/70 uppercase hover:border-bronze/60 disabled:opacity-40"
            disabled={!current || current.width === 0}
            onClick={() => {
              exportFrame().catch(() => undefined);
            }}
            type="button"
          >
            Export PNG
          </button>
          <button
            className="rounded border border-bronze/30 px-3 py-1.5 text-xs tracking-widest text-parchment/70 uppercase hover:border-bronze/60 disabled:opacity-40"
            disabled={!editing || !current || current.width === 0}
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            Import PNG
          </button>
          <input
            accept="image/png,image/gif,image/bmp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                importFrame(file).catch(() => undefined);
              }
              event.target.value = '';
            }}
            ref={fileInputRef}
            type="file"
          />
          <button
            className={`rounded border px-3 py-1.5 text-xs tracking-widest uppercase ${
              dirty && canWrite
                ? 'border-bronze text-bronze-bright hover:border-bronze/60'
                : 'border-bronze/20 text-parchment/30'
            }`}
            disabled={!dirty || !canWrite || saving}
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
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-none flex-wrap items-center gap-3 border-b border-bronze/20 px-4 py-2 text-xs text-parchment/50">
              <select
                className="field-select rounded border border-bronze/30 bg-ink py-1 pl-2 text-xs text-parchment/80"
                disabled={actions.length === 0}
                onChange={(event) => setAction(Number(event.target.value))}
                value={action}
              >
                {actions.map((value) => {
                  const label = actionName(listEntry?.type, value);
                  return (
                    <option key={value} value={value}>
                      {label ? `${label} (action ${value})` : `action ${value}`}
                    </option>
                  );
                })}
              </select>
              <select
                className="field-select rounded border border-bronze/30 bg-ink py-1 pl-2 text-xs text-parchment/80"
                onChange={(event) => setDirection(Number(event.target.value))}
                value={direction}
              >
                {DIRECTIONS.map((value) => {
                  const label = directionName(value);
                  const suffix = `dir ${value}${value > 4 ? ', mirrored' : ''}`;
                  return (
                    <option key={value} value={value}>
                      {label ? `${label} (${suffix})` : suffix}
                    </option>
                  );
                })}
              </select>
              <button
                className="rounded border border-bronze/30 px-3 py-1 text-xs tracking-widest text-parchment/70 uppercase hover:border-bronze/60"
                onClick={() => setPlaying((value) => !value)}
                type="button"
              >
                {playing ? 'Pause' : 'Play'}
              </button>
              <span className="ml-auto">{frames ? `${frames.length} frame${frames.length === 1 ? '' : 's'}` : ''}</span>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center p-6">
              <div
                className="rounded border border-bronze/20"
                style={{
                  backgroundImage:
                    'linear-gradient(45deg, #1a1613 25%, transparent 25%), linear-gradient(-45deg, #1a1613 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1a1613 75%), linear-gradient(-45deg, transparent 75%, #1a1613 75%)',
                  backgroundSize: '16px 16px',
                  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0'
                }}
              >
                <canvas className="block" height={CANVAS_HEIGHT} ref={canvasRef} width={CANVAS_WIDTH} />
              </div>
            </div>

            <FrameStrip
              frameIndex={frameIndex}
              frames={frames}
              onSelect={(index) => {
                setPlaying(false);
                setFrameIndex(index);
              }}
              strip={strip}
            />
          </div>
        )}

        {body !== null && animdata ? (
          <AnimdataBar
            animdataEntry={animdataEntry}
            animdataId={animdataId}
            canWrite={canWrite}
            saveMessage={saveMessage}
            updateAnimdata={updateAnimdata}
          />
        ) : null}

        <footer className="mt-auto flex min-h-11 items-center justify-between gap-4 border-t border-bronze/20 px-4 py-1.5 text-xs text-parchment/40">
          <span className="truncate">
            {body !== null ? `body ${body} · 0x${body.toString(16).toUpperCase()}` : ''}
            {kind ? ` · ${kind.toUpperCase()}` : ''}
            {source ? ` · ${source.kindLabel}` : ''}
          </span>
          <span>
            {current && current.width > 0 ? `${current.width}×${current.height} · ` : ''}
            {status ?? ''}
          </span>
        </footer>
      </section>
    </div>
  );
}
