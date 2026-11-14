import { type ArtTile, applyHue, HUE_COUNT, type HueDataSource } from '@sosarium/formats';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';

import { IndexTable, type IndexTableRow } from '@/components/common/index-table';
import { GitHubButton } from '@/components/github-button';
import { HueRamp } from '@/components/hues/hue-ramp';
import { tileToCanvas } from '@/lib/art-image';
import { getArtSource } from '@/lib/art-session';
import { useDocumentMeta } from '@/lib/document-meta';
import { getHueDataSource, saveHueDataSource } from '@/lib/hues-session';
import { useSession } from '@/lib/session';

export const Route = createFileRoute('/_shell/hues')({
  component: HueEditor
});

function parseArtIndex(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) {
    return 2;
  }
  const value = /^0x/i.test(trimmed) ? Number.parseInt(trimmed.slice(2), 16) : Number.parseInt(trimmed, 10);
  return Number.isFinite(value) && value >= 0 ? value : 2;
}

function HueEditor() {
  useDocumentMeta('Hues — Sosarium');
  const session = useSession();
  const [source, setSource] = useState<HueDataSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(1);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [tableStart, setTableStart] = useState('0');
  const [tableEnd, setTableEnd] = useState('0');
  const [artIndex, setArtIndex] = useState('2');
  const [onlyGray, setOnlyGray] = useState(false);
  const [preview, setPreview] = useState<ArtTile | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (session.status !== 'ready') {
      setSource(null);
      return;
    }
    let cancelled = false;
    setSource(null);
    setError(null);
    getHueDataSource()
      .then((value) => {
        if (cancelled) {
          return;
        }
        if (value) {
          setSource(value);
        } else {
          setError('hues.mul is not available in this session.');
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not open hues.mul.');
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
    return source.hues.map((hue, index) => ({ index, name: hue.name || '(unnamed)' }));
  }, [source, version]);

  const selectedHue = source && selected !== null ? source.hues[selected] : undefined;

  useEffect(() => {
    if (!selectedHue) {
      return;
    }
    setName(selectedHue.name);
    setTableStart(String(selectedHue.tableStart));
    setTableEnd(String(selectedHue.tableEnd));
  }, [selectedHue]);

  const artId = parseArtIndex(artIndex);

  useEffect(() => {
    void version;
    if (!source || selected === null) {
      setPreview(null);
      return;
    }
    const hue = source.hues[selected];
    if (!hue) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    getArtSource()
      .then(async (art) => {
        if (!art) {
          return null;
        }
        const tile = await art.readStatic(artId);
        return tile ? applyHue(tile, hue, onlyGray) : null;
      })
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
  }, [source, selected, version, artId, onlyGray]);

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

  const handleApply = () => {
    if (!source || selected === null) {
      return;
    }
    source.update(selected, {
      name: name.slice(0, 20),
      tableStart: Number(tableStart) & 0xffff,
      tableEnd: Number(tableEnd) & 0xffff
    });
    setVersion((value) => value + 1);
    setStatus('Applied — save to write the change to disk.');
  };

  const handleColor = (slot: number, color: number) => {
    if (!source || selected === null) {
      return;
    }
    source.setColor(selected, slot, color);
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
      await saveHueDataSource(source);
      const fresh = await getHueDataSource(true);
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
        <h1 className="font-serif text-xl tracking-widest text-bronze-bright uppercase">Hues</h1>
        <span className="text-xs text-parchment/40">{HUE_COUNT} groups</span>
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
                isModified={(index) => source.isModified(index)}
                key={`hues-${version}`}
                onSelect={setSelected}
                rows={rows}
                selected={selected}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-parchment/40">Loading hues…</div>
            )}
          </div>

          <aside className="scroll-area flex w-96 shrink-0 flex-col gap-4 overflow-y-auto border-l border-bronze/20 p-4">
            <h2 className="text-xs tracking-widest text-parchment/40 uppercase">Hue group</h2>
            {selected === null || !selectedHue ? (
              <p className="text-sm text-parchment/50">Select a hue group.</p>
            ) : (
              <>
                <div>
                  <div className="font-mono text-lg text-bronze-bright">
                    0x{selected.toString(16).toUpperCase().padStart(4, '0')}
                  </div>
                  <div className="text-xs text-parchment/50">Hue · {selected} decimal</div>
                </div>

                <HueRamp colors={selectedHue.colors} editable={writeable} onChange={handleColor} />

                <div className="flex flex-col gap-2">
                  <label className="flex flex-col gap-1 text-xs text-parchment/60">
                    Name
                    <input
                      className="rounded border border-bronze/30 bg-ink px-2 py-1.5 text-sm text-parchment/85"
                      maxLength={20}
                      onChange={(event) => setName(event.target.value)}
                      value={name}
                    />
                  </label>
                  <div className="flex gap-2">
                    <label className="flex flex-1 flex-col gap-1 text-xs text-parchment/60">
                      Table start
                      <input
                        className="rounded border border-bronze/30 bg-ink px-2 py-1.5 text-right text-sm text-parchment/85"
                        max={65535}
                        min={0}
                        onChange={(event) => setTableStart(event.target.value)}
                        type="number"
                        value={tableStart}
                      />
                    </label>
                    <label className="flex flex-1 flex-col gap-1 text-xs text-parchment/60">
                      Table end
                      <input
                        className="rounded border border-bronze/30 bg-ink px-2 py-1.5 text-right text-sm text-parchment/85"
                        max={65535}
                        min={0}
                        onChange={(event) => setTableEnd(event.target.value)}
                        type="number"
                        value={tableEnd}
                      />
                    </label>
                  </div>
                  <button
                    className="rounded border border-bronze/60 bg-bronze/10 px-4 py-1.5 text-xs tracking-widest text-bronze-bright uppercase hover:bg-bronze/20"
                    onClick={handleApply}
                    type="button"
                  >
                    Apply changes
                  </button>
                </div>

                <div className="flex flex-col gap-2 border-t border-bronze/10 pt-3">
                  <h3 className="text-xs tracking-widest text-parchment/40 uppercase">Preview on art</h3>
                  <div className="flex items-center gap-2">
                    <label className="flex flex-1 flex-col gap-1 text-xs text-parchment/60">
                      Item id
                      <input
                        className="rounded border border-bronze/30 bg-ink px-2 py-1.5 text-sm text-parchment/85"
                        onChange={(event) => setArtIndex(event.target.value)}
                        value={artIndex}
                      />
                    </label>
                    <label className="mt-4 flex items-center gap-1.5 text-xs text-parchment/60">
                      <input
                        checked={onlyGray}
                        className="accent-bronze"
                        onChange={(event) => setOnlyGray(event.target.checked)}
                        type="checkbox"
                      />
                      Gray only
                    </label>
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
                      <span className="text-xs text-parchment/30">no art for this id</span>
                    )}
                  </div>
                </div>

                {source?.isModified(selected) ? (
                  <span className="w-fit rounded bg-bronze/15 px-2 py-0.5 text-xs text-bronze-bright">modified</span>
                ) : null}
              </>
            )}
          </aside>
        </div>
      )}

      <footer className="mt-auto flex min-h-11 items-center justify-between border-t border-bronze/20 px-4 py-1.5 text-xs text-parchment/40">
        <span>{source ? `${source.blockCount} hex blocks` : ''}</span>
        <span>{status ?? (writeable ? 'Editing enabled' : 'Read-only session')}</span>
      </footer>
    </div>
  );
}
