import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';

import { GitHubButton } from '@/components/github-button';
import { useDocumentMeta } from '@/lib/document-meta';
import { invalidateRadarColors, loadRadarColors, saveRadarColors, setRadarColor } from '@/lib/radarcol-session';
import { useSession } from '@/lib/session';

export const Route = createFileRoute('/_shell/radarcol')({
  component: RadarColPage
});

const PAGE_SIZE = 100;
const LAND_COUNT = 0x4000;

function normalizeHex(value: number): string {
  return value.toString(16).toUpperCase().padStart(4, '0');
}

function RadarColPage() {
  useDocumentMeta('Radar colors — Sosarium');
  const session = useSession();
  const [colors, setColors] = useState<Uint16Array | null>(null);
  const [original, setOriginal] = useState<Uint16Array | null>(null);
  const [tab, setTab] = useState<'land' | 'items'>('land');
  const [offset, setOffset] = useState(0);
  const [jump, setJump] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [colorInput, setColorInput] = useState('');
  const [status, setStatus] = useState('idle');
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    if (session.status !== 'ready') {
      setColors(null);
      return;
    }
    let cancelled = false;
    setStatus('loading radarcol.mul…');
    loadRadarColors()
      .then((value) => {
        if (cancelled) {
          return;
        }
        setColors(value?.colors ?? null);
        setOriginal(value?.colors.slice() ?? null);
        setStatus(value ? `${value.colors.length} colours` : 'radarcol.mul not found');
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setStatus(cause instanceof Error ? cause.message : 'load failed');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const dirty = useMemo(() => {
    if (!colors || !original) {
      return false;
    }
    for (let i = 0; i < colors.length; i++) {
      if (colors[i] !== original[i]) {
        return true;
      }
    }
    return false;
  }, [colors, original]);

  const base = tab === 'land' ? 0 : LAND_COUNT;
  const limit = tab === 'land' ? LAND_COUNT : (colors?.length ?? LAND_COUNT) - LAND_COUNT;
  const pageStart = base + offset;
  const rows = useMemo(() => {
    if (!colors) {
      return [];
    }
    const end = Math.min(pageStart + PAGE_SIZE, base + limit);
    const list: { id: number; color: number }[] = [];
    for (let id = pageStart; id < end; id++) {
      list.push({ id, color: colors[id] ?? 0 });
    }
    return list;
  }, [colors, pageStart, base, limit]);

  const applyColor = () => {
    if (!colors || selected === null) {
      return;
    }
    const value = Number.parseInt(colorInput.replace(/^#/, ''), 16);
    if (Number.isNaN(value)) {
      return;
    }
    const next = setRadarColor(colors, selected, value);
    setColors(next);
    setSaveMsg(`colour 0x${normalizeHex(selected)} set to ${normalizeHex(value)}`);
  };

  const save = async () => {
    if (!colors) {
      return;
    }
    setSaveMsg(null);
    try {
      const name = await saveRadarColors(colors);
      invalidateRadarColors();
      setOriginal(colors.slice());
      setSaveMsg(`saved ${name}`);
    } catch (cause) {
      setSaveMsg(cause instanceof Error ? cause.message : 'save failed');
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-bronze/20 px-4 py-3 min-h-14">
        <h1 className="font-serif text-xl tracking-widest text-bronze-bright uppercase">Radar colors</h1>
        {(['land', 'items'] as const).map((value) => (
          <button
            className={`rounded border px-3 py-1.5 text-xs tracking-widest uppercase ${
              tab === value ? 'border-bronze bg-bronze/20 text-bronze-bright' : 'border-bronze/20 text-parchment/40'
            }`}
            key={value}
            onClick={() => {
              setTab(value);
              setOffset(0);
              setSelected(null);
            }}
            type="button"
          >
            {value === 'land' ? 'Land' : 'Items'}
          </button>
        ))}
        <input
          className="w-24 rounded border border-bronze/30 bg-ink py-1.5 px-2 text-xs text-parchment/80"
          onChange={(event) => setJump(event.target.value)}
          placeholder="id"
          value={jump}
        />
        <button
          className="rounded border border-bronze/30 px-2 py-1.5 text-xs text-parchment/70"
          onClick={() => {
            const parsed = Number.parseInt(jump.replace(/^0x/i, ''), jump.startsWith('0x') ? 16 : 10);
            if (Number.isNaN(parsed)) {
              return;
            }
            if (parsed < LAND_COUNT) {
              setTab('land');
              setOffset(Math.max(0, parsed - 50));
            } else {
              setTab('items');
              setOffset(Math.max(0, parsed - LAND_COUNT - 50));
            }
            setSelected(parsed);
            setColorInput(colors ? normalizeHex(colors[parsed] ?? 0) : '');
          }}
          type="button"
        >
          Jump
        </button>
        <div className="flex-1" />
        <span className="text-xs text-parchment/40">
          {status}
          {saveMsg ? ` · ${saveMsg}` : ''}
        </span>
        <button
          className={`rounded border px-3 py-1.5 text-xs tracking-widest uppercase ${
            dirty && session.mode === 'readwrite'
              ? 'border-bronze text-bronze-bright'
              : 'border-bronze/20 text-parchment/30'
          }`}
          disabled={!dirty || session.mode !== 'readwrite'}
          onClick={() => {
            save().catch(() => undefined);
          }}
          type="button"
        >
          Save
        </button>
        <GitHubButton />
      </header>

      <div className="sf-opt scroll-area min-h-0 flex-1 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="text-parchment/40">
            <tr>
              <th className="w-24 text-left">id</th>
              <th className="text-left">colour</th>
              <th className="w-40 text-left">swatch</th>
            </tr>
          </thead>
          <tbody className="text-parchment/70">
            {rows.map((row) => (
              <tr
                className={`cursor-pointer border-b border-parchment/5 ${
                  row.id === selected ? 'bg-bronze/20 text-bronze-bright' : 'hover:bg-bronze/10'
                }`}
                key={row.id}
                onClick={() => {
                  setSelected(row.id);
                  setColorInput(normalizeHex(row.color));
                }}
              >
                <td className="px-3 py-1 font-mono">0x{normalizeHex(row.id)}</td>
                <td className="px-3 py-1 font-mono">{normalizeHex(row.color)}</td>
                <td className="px-3 py-1">
                  <span
                    className="inline-block h-4 w-24 rounded border border-parchment/10"
                    style={{
                      backgroundColor: `rgb(${((row.color >> 10) & 0x1f) * 8}, ${((row.color >> 5) & 0x1f) * 8}, ${(row.color & 0x1f) * 8})`
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="mt-auto flex min-h-11 items-center gap-3 border-t border-bronze/20 px-4 py-2 text-xs">
        <button
          className="rounded border border-bronze/30 px-2 py-1 text-parchment/70 disabled:opacity-40"
          disabled={offset === 0}
          onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}
          type="button"
        >
          Prev
        </button>
        <button
          className="rounded border border-bronze/30 px-2 py-1 text-parchment/70 disabled:opacity-40"
          disabled={offset + PAGE_SIZE >= limit}
          onClick={() => setOffset((value) => value + PAGE_SIZE)}
          type="button"
        >
          Next
        </button>
        <span className="text-parchment/40">
          0x{normalizeHex(pageStart)}–0x{normalizeHex(Math.min(pageStart + PAGE_SIZE - 1, base + limit - 1))} of {limit}
        </span>
        <div className="flex-1" />
        {selected !== null ? (
          <>
            <span className="text-parchment/50">0x{normalizeHex(selected)}</span>
            <input
              className="w-24 rounded border border-bronze/30 bg-ink px-2 py-1 text-parchment/80"
              onChange={(event) => setColorInput(event.target.value)}
              value={colorInput}
            />
            <button
              className="rounded border border-bronze/30 px-2 py-1 text-parchment/70"
              onClick={applyColor}
              type="button"
            >
              Apply
            </button>
          </>
        ) : (
          <span className="text-parchment/30">select a row to edit its colour</span>
        )}
      </footer>
    </div>
  );
}
