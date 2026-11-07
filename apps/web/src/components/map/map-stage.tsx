import type { FacetDimensions } from '@sosarium/formats';
import { type RefObject, useRef } from 'react';

import type { FacetInfo } from '@/lib/map-session';
import { CANVAS_PX } from '@/lib/map-view';
import type { FacetImage, MapView } from '@/lib/use-map-canvas';

interface MapStageProps {
  viewCanvasRef: RefObject<HTMLCanvasElement | null>;
  overviewCanvasRef: RefObject<HTMLCanvasElement | null>;
  dimensions: FacetDimensions | null;
  view: MapView;
  setView: (view: MapView) => void;
  zoom: number;
  hover: { tileX: number; tileY: number } | null;
  setHover: (hover: { tileX: number; tileY: number } | null) => void;
  setSelected: (selected: { x: number; y: number }) => void;
  move: (directionX: number, directionY: number) => void;
  jumpToTile: (tileX: number, tileY: number) => void;
  facetImage: FacetImage | null;
  imageProgress: { done: number; total: number } | null;
  facets: FacetInfo[];
  facet: number;
}

export function MapStage({
  viewCanvasRef,
  overviewCanvasRef,
  dimensions,
  view,
  setView,
  zoom,
  hover,
  setHover,
  setSelected,
  move,
  jumpToTile,
  facetImage,
  imageProgress,
  facets,
  facet
}: MapStageProps) {
  const dragRef = useRef<{ startX: number; startY: number; tileX: number; tileY: number; moved: boolean } | null>(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-4">
      <canvas
        className="cursor-grab touch-none rounded border border-bronze/20"
        height={CANVAS_PX}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = {
            startX: event.clientX,
            startY: event.clientY,
            tileX: view.tileX,
            tileY: view.tileY,
            moved: false
          };
        }}
        onPointerLeave={() => setHover(null)}
        onPointerMove={(event) => {
          if (!dimensions) {
            return;
          }
          const rect = event.currentTarget.getBoundingClientRect();
          const visibleTiles = CANVAS_PX / zoom;
          setHover({
            tileX: Math.floor(view.tileX + ((event.clientX - rect.left) / rect.width) * visibleTiles),
            tileY: Math.floor(view.tileY + ((event.clientY - rect.top) / rect.height) * visibleTiles)
          });
          const drag = dragRef.current;
          if (!drag) {
            return;
          }
          if (Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY) > 3) {
            drag.moved = true;
          }
          const dx = (event.clientX - drag.startX) / zoom;
          const dy = (event.clientY - drag.startY) / zoom;
          setView({
            tileX: Math.max(0, Math.min(dimensions.width - visibleTiles, drag.tileX - dx)),
            tileY: Math.max(0, Math.min(dimensions.height - visibleTiles, drag.tileY - dy))
          });
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current;
          dragRef.current = null;
          if (!drag || drag.moved || !dimensions) {
            return;
          }
          const rect = event.currentTarget.getBoundingClientRect();
          const visibleTiles = CANVAS_PX / zoom;
          const tileX = view.tileX + ((event.clientX - rect.left) / rect.width) * visibleTiles;
          const tileY = view.tileY + ((event.clientY - rect.top) / rect.height) * visibleTiles;
          setSelected({
            x: Math.max(0, Math.min(dimensions.blockWidth - 1, Math.floor(tileX / 8))),
            y: Math.max(0, Math.min(dimensions.blockHeight - 1, Math.floor(tileY / 8)))
          });
        }}
        ref={viewCanvasRef}
        width={CANVAS_PX}
      />
      <div className="flex items-center gap-2 text-xs text-parchment/50">
        <button className="rounded border border-bronze/30 px-2 py-1" onClick={() => move(0, -1)} type="button">
          ↑
        </button>
        <button className="rounded border border-bronze/30 px-2 py-1" onClick={() => move(-1, 0)} type="button">
          ←
        </button>
        <button className="rounded border border-bronze/30 px-2 py-1" onClick={() => move(1, 0)} type="button">
          →
        </button>
        <button className="rounded border border-bronze/30 px-2 py-1" onClick={() => move(0, 1)} type="button">
          ↓
        </button>
        <span className="ml-3">
          view {Math.round(view.tileX)},{Math.round(view.tileY)} · {zoom}×
          {hover ? ` · cursor ${hover.tileX},${hover.tileY}` : ''}
        </span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <canvas
          className="cursor-pointer rounded border border-bronze/20"
          onClick={(event) => {
            if (!facetImage) {
              return;
            }
            const rect = event.currentTarget.getBoundingClientRect();
            const fx = (event.clientX - rect.left) / rect.width;
            const fy = (event.clientY - rect.top) / rect.height;
            jumpToTile(
              Math.floor(fx * facetImage.width * facetImage.sampleTiles),
              Math.floor(fy * facetImage.height * facetImage.sampleTiles)
            );
          }}
          ref={overviewCanvasRef}
          title="facet overview — click to jump"
        />
        <span className="text-[10px] text-parchment/30">
          {imageProgress
            ? `generating facet overview… ${Math.round((imageProgress.done / Math.max(1, imageProgress.total)) * 100)}%`
            : `${facets.find((info) => info.facet === facet)?.name ?? 'facet'} overview`}
        </span>
      </div>
    </div>
  );
}
