import type { RefObject } from 'react';

import type { FacetImage } from '@/lib/use-map-canvas';

interface FacetOverviewPanelProps {
  facetName: string;
  facetImage: FacetImage | null;
  imageProgress: { done: number; total: number } | null;
  marker: { x: number; y: number } | null;
  jumpTo: (x: number, y: number) => void;
  overviewCanvasRef: RefObject<HTMLCanvasElement | null>;
}

export function FacetOverviewPanel({
  facetName,
  facetImage,
  imageProgress,
  marker,
  jumpTo,
  overviewCanvasRef
}: FacetOverviewPanelProps) {
  return (
    <aside className="flex w-56 flex-none flex-col border-l border-bronze/20 p-3 text-xs">
      <h2 className="text-xs tracking-widest text-parchment/40 uppercase">{facetName}</h2>
      <canvas
        className="mt-2 cursor-pointer rounded border border-bronze/20"
        onClick={(event) => {
          if (!facetImage) {
            return;
          }
          const rect = event.currentTarget.getBoundingClientRect();
          const fx = (event.clientX - rect.left) / rect.width;
          const fy = (event.clientY - rect.top) / rect.height;
          jumpTo(fx * facetImage.width * facetImage.sampleTiles, fy * facetImage.height * facetImage.sampleTiles);
        }}
        ref={overviewCanvasRef}
        title="click to jump"
      />
      <p className="mt-1 text-[10px] text-parchment/30">
        {imageProgress
          ? `rendering overview… ${Math.round((imageProgress.done / Math.max(1, imageProgress.total)) * 100)}%`
          : 'facet overview · click to jump'}
      </p>
      <div className="mt-3 flex items-center gap-1.5">
        <input
          className="w-14 rounded border border-bronze/30 bg-ink px-1.5 py-1 text-parchment/80"
          id="facet-jump-x"
          placeholder="x"
        />
        <input
          className="w-14 rounded border border-bronze/30 bg-ink px-1.5 py-1 text-parchment/80"
          id="facet-jump-y"
          placeholder="y"
        />
        <button
          className="rounded border border-bronze/30 px-2 py-1 text-parchment/70"
          onClick={() => {
            const x = Number.parseInt(
              (document.getElementById('facet-jump-x') as HTMLInputElement | null)?.value ?? '',
              10
            );
            const y = Number.parseInt(
              (document.getElementById('facet-jump-y') as HTMLInputElement | null)?.value ?? '',
              10
            );
            if (!Number.isNaN(x) && !Number.isNaN(y)) {
              jumpTo(x, y);
            }
          }}
          type="button"
        >
          Go
        </button>
      </div>
      {marker ? (
        <p className="mt-2 text-parchment/50">
          marker {marker.x},{marker.y}
        </p>
      ) : null}
      <p className="mt-auto pt-3 text-[10px] text-parchment/30">
        Terrain is radar-coloured; editing lives in the Map editor.
      </p>
    </aside>
  );
}
