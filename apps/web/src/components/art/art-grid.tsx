import type { ArtTile } from '@sosarium/formats';
import { type MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from 'react';

import { tileToCanvas } from '@/lib/art-image';

const TILE_SIZE = 44;
const CELL = 48;
const CACHE_LIMIT = 2000;

function tileThumbnail(tile: ArtTile): HTMLCanvasElement {
  const rendered = tileToCanvas(tile);
  const scale = Math.min(1, TILE_SIZE / tile.width, TILE_SIZE / tile.height);
  if (scale >= 1) {
    return rendered;
  }
  const thumb = document.createElement('canvas');
  thumb.width = Math.max(1, Math.round(tile.width * scale));
  thumb.height = Math.max(1, Math.round(tile.height * scale));
  const context = thumb.getContext('2d');
  if (context) {
    context.imageSmoothingEnabled = false;
    context.drawImage(rendered, 0, 0, thumb.width, thumb.height);
  }
  return thumb;
}

export interface ArtGridProps {
  count: number;
  selected: number | null;
  hovered: number | null;
  onSelect: (index: number) => void;
  onHover: (index: number | null) => void;
  loadTile: (index: number) => Promise<ArtTile | null>;
  hasTile: (index: number) => boolean;
  isModified: (index: number) => boolean;
}

export function ArtGrid(props: ArtGridProps) {
  const { count, selected, onSelect, onHover } = props;
  const propsRef = useRef(props);
  propsRef.current = props;

  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cacheRef = useRef(new Map<number, HTMLCanvasElement>());
  const pendingRef = useRef(new Set<number>());
  const frameRef = useRef(0);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const container = containerRef.current;
  const cols = Math.max(1, Math.floor((container?.clientWidth ?? size.width) / CELL));
  const rows = Math.ceil(count / cols);

  const draw = () => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) {
      return;
    }
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    const { count: total } = propsRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const scrollLeft = container.scrollLeft;
    const scrollTop = container.scrollTop;
    const cols = Math.max(1, Math.floor(width / CELL));
    const rows = Math.ceil(total / cols);

    context.fillStyle = '#12100d';
    context.fillRect(0, 0, width, height);

    const firstRow = Math.max(0, Math.floor(scrollTop / CELL) - 1);
    const lastRow = Math.min(rows - 1, Math.ceil((scrollTop + height) / CELL));
    const firstCol = Math.max(0, Math.floor(scrollLeft / CELL) - 1);
    const lastCol = Math.min(cols - 1, Math.ceil((scrollLeft + width) / CELL));

    for (let row = firstRow; row <= lastRow; row++) {
      for (let col = firstCol; col <= lastCol; col++) {
        const index = row * cols + col;
        if (index >= total) {
          continue;
        }
        const x = col * CELL - scrollLeft;
        const y = row * CELL - scrollTop;
        const current = propsRef.current;

        context.fillStyle = '#1b1713';
        context.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);

        const cached = cacheRef.current.get(index);
        if (cached) {
          cacheRef.current.delete(index);
          cacheRef.current.set(index, cached);
          context.drawImage(cached, x + (CELL - cached.width) / 2, y + (CELL - cached.height) / 2);
        } else if (!current.hasTile(index)) {
          context.fillStyle = '#15120f';
          context.fillRect(x + 6, y + 6, CELL - 12, CELL - 12);
        } else if (!pendingRef.current.has(index)) {
          pendingRef.current.add(index);
          current
            .loadTile(index)
            .then((tile) => {
              pendingRef.current.delete(index);
              if (tile) {
                cacheRef.current.set(index, tileThumbnail(tile));
                while (cacheRef.current.size > CACHE_LIMIT) {
                  const oldest = cacheRef.current.keys().next().value as number;
                  cacheRef.current.delete(oldest);
                }
              }
              scheduleDraw();
            })
            .catch(() => {
              pendingRef.current.delete(index);
            });
        }

        if (current.isModified(index)) {
          context.fillStyle = '#b08349';
          context.fillRect(x + CELL - 8, y + 4, 4, 4);
        }
        if (current.hovered === index && selected !== index) {
          context.fillStyle = 'rgba(216, 168, 96, 0.06)';
          context.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
          context.strokeStyle = 'rgba(216, 168, 96, 0.30)';
          context.lineWidth = 1;
          context.strokeRect(x + 1.5, y + 1.5, CELL - 3, CELL - 3);
        }
        if (selected === index) {
          context.fillStyle = 'rgba(216, 168, 96, 0.22)';
          context.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
          context.strokeStyle = '#1b1713';
          context.lineWidth = 4;
          context.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2);
          context.strokeStyle = '#f0c070';
          context.lineWidth = 2;
          context.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2);
        }
      }
    }
  };

  const scheduleDraw = () => {
    if (frameRef.current) {
      return;
    }
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = 0;
      draw();
    });
  };
  const scheduleDrawRef = useRef(scheduleDraw);
  scheduleDrawRef.current = scheduleDraw;

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }
    const measure = () => {
      setSize({ width: element.clientWidth, height: element.clientHeight });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(size.width * dpr));
    canvas.height = Math.max(1, Math.floor(size.height * dpr));
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    const context = canvas.getContext('2d');
    if (context) {
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    scheduleDrawRef.current();
  }, [size]);

  useEffect(() => {
    void selected;
    scheduleDrawRef.current();
  }, [selected]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || selected === null) {
      return;
    }
    const row = Math.floor(selected / cols);
    const col = selected % cols;
    const cellTop = row * CELL;
    const cellLeft = col * CELL;
    if (cellTop < container.scrollTop) {
      container.scrollTop = cellTop;
    } else if (cellTop + CELL > container.scrollTop + container.clientHeight) {
      container.scrollTop = cellTop + CELL - container.clientHeight;
    }
    if (cellLeft < container.scrollLeft) {
      container.scrollLeft = cellLeft;
    } else if (cellLeft + CELL > container.scrollLeft + container.clientWidth) {
      container.scrollLeft = cellLeft + CELL - container.clientWidth;
    }
    scheduleDrawRef.current();
  }, [selected, cols]);

  const moveSelection = (delta: number) => {
    const container = containerRef.current;
    const total = propsRef.current.count;
    if (!container || total === 0) {
      return;
    }
    const current = propsRef.current.selected;
    if (current === null) {
      propsRef.current.onSelect(0);
      return;
    }
    const next = Math.max(0, Math.min(total - 1, current + delta));
    if (next !== current) {
      propsRef.current.onSelect(next);
    }
  };

  const indexFromEvent = (event: ReactMouseEvent<HTMLDivElement>): number | null => {
    const container = containerRef.current;
    if (!container) {
      return null;
    }
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left + container.scrollLeft;
    const y = event.clientY - rect.top + container.scrollTop;
    const cols = Math.max(1, Math.floor(container.clientWidth / CELL));
    const col = Math.floor(x / CELL);
    const row = Math.floor(y / CELL);
    if (col < 0 || col >= cols || row < 0) {
      return null;
    }
    const index = row * cols + col;
    return index < count ? index : null;
  };

  return (
    <div className="relative h-full w-full" ref={wrapperRef}>
      <canvas className="pointer-events-none absolute inset-0" ref={canvasRef} />
      <div
        aria-label="Art tiles"
        className="sf-opt scroll-area absolute inset-0 overflow-y-auto overflow-x-hidden outline-none"
        onKeyDown={(event) => {
          const container = containerRef.current;
          if (!container) {
            return;
          }
          const cols = Math.max(1, Math.floor(container.clientWidth / CELL));
          if (event.key === 'ArrowRight') {
            moveSelection(1);
          } else if (event.key === 'ArrowLeft') {
            moveSelection(-1);
          } else if (event.key === 'ArrowDown') {
            moveSelection(cols);
          } else if (event.key === 'ArrowUp') {
            moveSelection(-cols);
          } else {
            return;
          }
          event.preventDefault();
        }}
        onMouseDown={(event) => {
          event.currentTarget.focus();
          const index = indexFromEvent(event);
          if (index !== null) {
            onSelect(index);
          }
        }}
        onMouseLeave={() => onHover(null)}
        onMouseMove={(event) => {
          onHover(indexFromEvent(event));
          scheduleDrawRef.current();
        }}
        onScroll={() => scheduleDrawRef.current()}
        ref={containerRef}
        role="application"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the grid needs keyboard focus for arrow navigation
        tabIndex={0}
      >
        <div style={{ width: cols * CELL, height: rows * CELL }} />
      </div>
    </div>
  );
}

export { CELL, TILE_SIZE };
