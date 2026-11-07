import { useEffect, useRef, useState } from 'react';

export interface ThumbnailRow {
  id: number;
  name: string;
  subtitle: string;
}

export type PreviewLoader = (id: number) => Promise<HTMLCanvasElement | null>;

function useVisibility(threshold = 0.1) {
  const ref = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || visible) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        }
      },
      { threshold, rootMargin: '200px' }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible, threshold]);

  return { ref, visible };
}

function ThumbnailRowItem({
  row,
  selected,
  onSelect,
  loadPreview
}: {
  row: ThumbnailRow;
  selected: boolean;
  onSelect: (id: number) => void;
  loadPreview: PreviewLoader;
}) {
  const { ref, visible } = useVisibility();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!visible) {
      return;
    }
    let cancelled = false;
    loadPreview(row.id).then((preview) => {
      if (cancelled) {
        return;
      }
      if (!preview) {
        setMissing(true);
        return;
      }
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      const scale = Math.min(40 / preview.width, 40 / preview.height, 1);
      canvas.width = Math.max(1, Math.round(preview.width * scale));
      canvas.height = Math.max(1, Math.round(preview.height * scale));
      const context = canvas.getContext('2d');
      if (!context) {
        return;
      }
      context.imageSmoothingEnabled = false;
      context.drawImage(preview, 0, 0, canvas.width, canvas.height);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, row.id, loadPreview]);

  return (
    <button
      className={`flex w-full items-center gap-3 border-b border-parchment/5 px-3 py-1.5 text-left ${
        selected ? 'bg-bronze/20 text-bronze-bright' : 'text-parchment/60 hover:bg-bronze/10'
      }`}
      onClick={() => onSelect(row.id)}
      ref={ref}
      type="button"
    >
      <span className="flex h-11 w-11 flex-none items-center justify-center rounded border border-parchment/10 bg-ink/60">
        {missing ? <span className="text-[9px] text-parchment/25">none</span> : <canvas ref={canvasRef} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs">{row.name}</span>
        <span className="block text-[10px] text-parchment/30">{row.subtitle}</span>
      </span>
    </button>
  );
}

export function ThumbnailList({
  rows,
  selected,
  onSelect,
  loadPreview
}: {
  rows: ThumbnailRow[];
  selected: number | null;
  onSelect: (id: number) => void;
  loadPreview: PreviewLoader;
}) {
  return (
    <div className="sf-opt scroll-area flex-1 overflow-y-auto">
      {rows.map((row) => (
        <ThumbnailRowItem
          key={`${row.id}-${row.name}`}
          loadPreview={loadPreview}
          onSelect={onSelect}
          row={row}
          selected={row.id === selected}
        />
      ))}
    </div>
  );
}
