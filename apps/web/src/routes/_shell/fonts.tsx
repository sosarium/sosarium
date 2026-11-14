import type { BitmapFont, UnicodeFont } from '@sosarium/formats';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';

import { GitHubButton } from '@/components/github-button';
import { useDocumentMeta } from '@/lib/document-meta';
import { drawFontText, drawUnicodeText, glyphToCanvas, unicodeGlyphToCanvas } from '@/lib/font-image';
import { useSession } from '@/lib/session';
import { loadFonts, loadUnicodeFonts, type UnicodeFontEntry } from '@/lib/text-session';

export const Route = createFileRoute('/_shell/fonts')({
  component: FontsPage
});

const ASCII_START = 0x20;
const ASCII_TOTAL = 0xe0;
const UNICODE_START = 0;
const UNICODE_TOTAL = 0x10000;
const CELL = 28;
const PITCH = 32;
const GRID_PADDING = 12;

function characterFor(code: number): string {
  return code === 0x20 ? ' ' : String.fromCodePoint(code);
}

function GlyphCell({
  canvas,
  code,
  onPick,
  left,
  top
}: Readonly<{
  canvas: HTMLCanvasElement | null;
  code: number;
  onPick: (character: string) => void;
  left: number;
  top: number;
}>) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const target = ref.current;
    if (!target) {
      return;
    }
    if (!canvas) {
      target.width = 1;
      target.height = 1;
      return;
    }
    const scale = Math.min(2, 20 / canvas.width, 20 / canvas.height);
    target.width = Math.max(1, Math.round(canvas.width * scale));
    target.height = Math.max(1, Math.round(canvas.height * scale));
    const context = target.getContext('2d');
    if (!context) {
      return;
    }
    context.imageSmoothingEnabled = false;
    context.drawImage(canvas, 0, 0, target.width, target.height);
  }, [canvas]);

  const style = { left, top, width: CELL, height: CELL };
  if (!canvas) {
    return (
      <div
        className="absolute rounded-sm border border-parchment/10"
        style={style}
        title={`0x${code.toString(16).toUpperCase().padStart(4, '0')}`}
      />
    );
  }

  return (
    <button
      className="absolute flex items-center justify-center rounded-sm border border-bronze/25 bg-ink/60 hover:border-bronze/70 hover:bg-bronze/10"
      onClick={() => onPick(characterFor(code))}
      style={style}
      title={`0x${code.toString(16).toUpperCase().padStart(4, '0')} · click to append`}
      type="button"
    >
      <canvas className="max-h-6 max-w-6" ref={ref} />
    </button>
  );
}

function FontsPage() {
  useDocumentMeta('Fonts — Sosarium');
  const session = useSession();
  const [fonts, setFonts] = useState<Awaited<ReturnType<typeof loadFonts>>>(null);
  const [unicodeFonts, setUnicodeFonts] = useState<UnicodeFontEntry[]>([]);
  const [kind, setKind] = useState<'ascii' | 'unicode'>('ascii');
  const [fontIndex, setFontIndex] = useState(0);
  const [unicodeIndex, setUnicodeIndex] = useState(0);
  const [text, setText] = useState('Sosarium — Ultima Online');
  const [color, setColor] = useState('#e0b070');
  const [status, setStatus] = useState('idle');
  const previewRef = useRef<HTMLCanvasElement>(null);
  const glyphCache = useRef(new Map<string, HTMLCanvasElement | null>());
  const gridRef = useRef<HTMLDivElement>(null);
  const [grid, setGrid] = useState({ width: 0, height: 0, scrollTop: 0 });

  const resetGridScroll = () => {
    const element = gridRef.current;
    if (element) {
      element.scrollTop = 0;
    }
    setGrid((current) => ({ ...current, scrollTop: 0 }));
  };

  const asciiFont: BitmapFont | null = fonts?.fonts[fontIndex] ?? null;
  const unicodeFont: UnicodeFont | null = unicodeFonts[unicodeIndex]?.font ?? null;
  const activeFont = kind === 'ascii' ? asciiFont : unicodeFont;

  const glyphCanvas = (code: number): HTMLCanvasElement | null => {
    const key = `${kind}-${kind === 'ascii' ? fontIndex : unicodeIndex}-${code}`;
    if (glyphCache.current.size > 4000) {
      glyphCache.current.clear();
    }
    if (!glyphCache.current.has(key)) {
      glyphCache.current.set(
        key,
        kind === 'ascii'
          ? asciiFont
            ? glyphToCanvas(asciiFont, code)
            : null
          : unicodeFont
            ? unicodeGlyphToCanvas(unicodeFont, code)
            : null
      );
    }
    return glyphCache.current.get(key) ?? null;
  };

  useEffect(() => {
    if (session.status !== 'ready') {
      setFonts(null);
      setUnicodeFonts([]);
      return;
    }
    let cancelled = false;
    setStatus('loading fonts…');
    Promise.all([loadFonts(), loadUnicodeFonts()])
      .then(([ascii, unicode]) => {
        if (cancelled) {
          return;
        }
        setFonts(ascii);
        setUnicodeFonts(unicode);
        glyphCache.current.clear();
        setStatus(
          `${ascii?.fonts.length ?? 0} ascii fonts · ${unicode.length} unicode fonts${unicode.length === 0 ? ' (unifont*.mul not found)' : ''}`
        );
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

  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas || !activeFont) {
      return;
    }
    const rendered =
      kind === 'ascii' && asciiFont
        ? drawFontText(asciiFont, text, { background: '#141110', color })
        : unicodeFont
          ? drawUnicodeText(unicodeFont, text, { background: '#141110', color })
          : null;
    if (!rendered) {
      canvas.width = 1;
      canvas.height = 1;
      return;
    }
    canvas.width = rendered.width;
    canvas.height = rendered.height;
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    context.imageSmoothingEnabled = false;
    context.drawImage(rendered, 0, 0);
  }, [activeFont, asciiFont, unicodeFont, kind, text, color]);

  const start = kind === 'ascii' ? ASCII_START : UNICODE_START;
  const total = kind === 'ascii' ? ASCII_TOTAL : UNICODE_TOTAL;
  const columns = Math.max(1, Math.floor((grid.width - GRID_PADDING * 2) / PITCH));
  const rows = Math.ceil(total / columns);
  const firstRow = Math.max(0, Math.floor((grid.scrollTop - GRID_PADDING) / PITCH) - 2);
  const lastRow = Math.min(rows - 1, Math.ceil((grid.scrollTop + grid.height) / PITCH) + 2);
  const visibleCells: { code: number; left: number; top: number }[] = [];
  if (activeFont) {
    for (let row = firstRow; row <= lastRow; row++) {
      for (let column = 0; column < columns; column++) {
        const code = start + row * columns + column;
        if (code >= start + total) {
          break;
        }
        visibleCells.push({ code, left: GRID_PADDING + column * PITCH, top: GRID_PADDING + row * PITCH });
      }
    }
  }
  const presentCount = useMemo(() => {
    if (kind === 'ascii') {
      return asciiFont ? asciiFont.glyphs.filter((glyph) => glyph && glyph.width > 0 && glyph.height > 0).length : 0;
    }
    return unicodeFont ? unicodeFont.glyphs.filter((glyph) => glyph && glyph.width > 0 && glyph.height > 0).length : 0;
  }, [kind, asciiFont, unicodeFont]);

  useEffect(() => {
    const element = gridRef.current;
    if (!element) {
      return;
    }
    const measure = () => {
      setGrid({ width: element.clientWidth, height: element.clientHeight, scrollTop: element.scrollTop });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);

  const fontRows = (fonts?.fonts ?? []).map((font, slot) => ({
    font,
    rowKey: `${slot}-${font.header}-${font.height}`,
    slot
  }));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-bronze/20 px-4 py-3 min-h-14">
        <h1 className="font-serif text-xl tracking-widest text-bronze-bright uppercase">Fonts</h1>
        <div className="flex overflow-hidden rounded border border-bronze/30">
          <button
            className={`px-3 py-1.5 text-xs tracking-widest uppercase ${kind === 'ascii' ? 'bg-bronze/25 text-bronze-bright' : 'text-parchment/60 hover:bg-bronze/10'}`}
            onClick={() => {
              setKind('ascii');
              resetGridScroll();
            }}
            type="button"
          >
            Ascii fonts
          </button>
          <button
            className={`px-3 py-1.5 text-xs tracking-widest uppercase ${kind === 'unicode' ? 'bg-bronze/25 text-bronze-bright' : 'text-parchment/60 hover:bg-bronze/10'}`}
            onClick={() => {
              setKind('unicode');
              resetGridScroll();
            }}
            type="button"
          >
            Unicode fonts
          </button>
        </div>

        {kind === 'ascii' ? (
          <select
            className="field-select rounded border border-bronze/30 bg-ink py-1.5 pl-2 text-xs text-parchment/80"
            onChange={(event) => {
              setFontIndex(Number(event.target.value));
              resetGridScroll();
            }}
            value={fontIndex}
          >
            {fontRows.map((row) => (
              <option key={row.rowKey} value={row.slot}>
                font {row.slot} · header {row.font.header} · height {row.font.height}
              </option>
            ))}
            {fonts ? null : <option value={0}>font 0</option>}
          </select>
        ) : (
          <select
            className="field-select rounded border border-bronze/30 bg-ink py-1.5 pl-2 text-xs text-parchment/80"
            onChange={(event) => {
              setUnicodeIndex(Number(event.target.value));
              resetGridScroll();
            }}
            value={unicodeIndex}
          >
            {unicodeFonts.map((entry, slot) => (
              <option key={entry.file} value={slot}>
                {entry.file}
              </option>
            ))}
            {unicodeFonts.length === 0 ? <option value={0}>no unifont*.mul</option> : null}
          </select>
        )}

        <input
          className="w-64 rounded border border-bronze/30 bg-ink py-1.5 px-2 text-xs text-parchment/80 placeholder:text-parchment/30"
          onChange={(event) => setText(event.target.value)}
          placeholder="type text to render"
          value={text}
        />
        <label className="flex items-center gap-1.5 text-xs text-parchment/60">
          color
          <input
            className="h-7 w-12 rounded border border-bronze/30 bg-ink"
            onChange={(event) => setColor(event.target.value)}
            type="color"
            value={color}
          />
        </label>
        <GitHubButton />
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <div
          className="sf-opt scroll-area min-h-0 flex-1 overflow-auto border-b border-bronze/20"
          onScroll={(event) => {
            const scrollTop = event.currentTarget.scrollTop;
            setGrid((current) => ({ ...current, scrollTop }));
          }}
          ref={gridRef}
        >
          {activeFont ? (
            <div className="relative" style={{ height: rows * PITCH + GRID_PADDING * 2 }}>
              {visibleCells.map((cell) => (
                <GlyphCell
                  canvas={glyphCanvas(cell.code)}
                  code={cell.code}
                  key={cell.code}
                  left={cell.left}
                  onPick={(character) => setText((current) => current + character)}
                  top={cell.top}
                />
              ))}
            </div>
          ) : (
            <p className="p-4 text-sm text-parchment/40">
              {kind === 'ascii'
                ? 'fonts.mul is not available in this session.'
                : 'No unifont*.mul files in this session.'}
            </p>
          )}
        </div>

        <div className="shrink-0 p-4">
          <h2 className="text-xs tracking-widest text-parchment/40 uppercase">Written text</h2>
          <div className="mt-2 flex min-h-16 items-center rounded border border-bronze/20 bg-[#141110] p-3">
            <canvas className="max-w-full" ref={previewRef} />
          </div>
        </div>
      </div>

      <footer className="mt-auto flex min-h-11 items-center justify-between border-t border-bronze/20 px-4 py-1.5 text-xs text-parchment/40">
        <span>
          {total.toLocaleString()} code points · {presentCount.toLocaleString()} present · click a glyph to append
        </span>
        <span className="truncate">
          {status}
          {kind === 'ascii'
            ? ` · font ${fontIndex} · height ${asciiFont?.height ?? 0}`
            : ` · ${unicodeFonts[unicodeIndex]?.file ?? 'no unicode font'}`}
        </span>
      </footer>
    </div>
  );
}
