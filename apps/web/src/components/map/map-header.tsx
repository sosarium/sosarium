import type { FacetDimensions } from '@sosarium/formats';

import { GitHubButton } from '@/components/github-button';
import type { FacetInfo } from '@/lib/map-session';
import { ZOOM_STEPS } from '@/lib/map-view';

interface MapHeaderProps {
  facets: FacetInfo[];
  facet: number;
  setFacet: (facet: number) => void;
  extended: boolean;
  setExtended: (extended: boolean) => void;
  zoom: number;
  setZoom: (zoom: number) => void;
  staticsOn: boolean;
  setStaticsOn: (on: boolean) => void;
  defrag: boolean;
  setDefrag: (on: boolean) => void;
  dimensions: FacetDimensions | null;
  phase: string;
  blockCount: number;
  saveMsg: string | null;
  dirty: boolean;
  readWrite: boolean;
  saving: boolean;
  save: () => Promise<void>;
}

export function MapHeader({
  facets,
  facet,
  setFacet,
  extended,
  setExtended,
  zoom,
  setZoom,
  staticsOn,
  setStaticsOn,
  defrag,
  setDefrag,
  dimensions,
  phase,
  blockCount,
  saveMsg,
  dirty,
  readWrite,
  saving,
  save
}: MapHeaderProps) {
  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-bronze/20 px-4 py-3 min-h-14">
      <h1 className="font-serif text-xl tracking-widest text-bronze-bright uppercase">Map</h1>
      <select
        className="field-select rounded border border-bronze/30 bg-ink py-1.5 pl-2 text-xs text-parchment/80"
        disabled={facets.length === 0}
        onChange={(event) => setFacet(Number(event.target.value))}
        value={facet}
      >
        {facets.map((info) => (
          <option key={info.facet} value={info.facet}>
            {info.name} (facet {info.facet})
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1.5 text-xs text-parchment/60">
        <input
          checked={extended}
          disabled={!facets.find((info) => info.facet === facet)?.hasExtended}
          onChange={(event) => setExtended(event.target.checked)}
          type="checkbox"
        />
        extended (x)
      </label>
      <select
        className="field-select rounded border border-bronze/30 bg-ink py-1.5 pl-2 text-xs text-parchment/80"
        onChange={(event) => setZoom(Number(event.target.value))}
        value={zoom}
      >
        {ZOOM_STEPS.map((value) => (
          <option key={value} value={value}>
            {value}× tiles
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1.5 text-xs text-parchment/60">
        <input checked={staticsOn} onChange={(event) => setStaticsOn(event.target.checked)} type="checkbox" />
        statics
      </label>
      <label className="flex items-center gap-1.5 text-xs text-parchment/60">
        <input checked={defrag} onChange={(event) => setDefrag(event.target.checked)} type="checkbox" />
        defrag on save
      </label>
      <div className="flex-1" />
      <span className="text-xs text-parchment/40">
        {dimensions
          ? `${dimensions.width}×${dimensions.height} tiles · ${dimensions.blockWidth}×${dimensions.blockHeight} blocks`
          : ''}
        {' · '}
        {phase}
        {blockCount > 0 ? ` · ${blockCount} blocks` : ''}
        {saveMsg ? ` · ${saveMsg}` : ''}
      </span>
      <button
        className={`rounded border px-3 py-1.5 text-xs tracking-widest uppercase ${
          dirty && readWrite
            ? 'border-bronze text-bronze-bright hover:border-bronze/60'
            : 'border-bronze/20 text-parchment/30'
        }`}
        disabled={!dirty || !readWrite || saving}
        onClick={() => {
          save().catch(() => undefined);
        }}
        type="button"
      >
        Save
      </button>
      <GitHubButton />
    </header>
  );
}
