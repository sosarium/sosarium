import type { FacetDimensions } from '@sosarium/formats';

import { GitHubButton } from '@/components/github-button';
import type { FacetInfo } from '@/lib/map-session';

const SCALES = [1, 2, 4];

interface FacetsHeaderProps {
  facets: FacetInfo[];
  facet: number;
  setFacet: (facet: number) => void;
  extended: boolean;
  setExtended: (extended: boolean) => void;
  scale: number;
  setScale: (scale: number) => void;
  staticsOn: boolean;
  setStaticsOn: (on: boolean) => void;
  dimensions: FacetDimensions | null;
  phase: string;
  pendingTiles: number;
  hover: { x: number; y: number } | null;
  error: string | null;
}

export function FacetsHeader({
  facets,
  facet,
  setFacet,
  extended,
  setExtended,
  scale,
  setScale,
  staticsOn,
  setStaticsOn,
  dimensions,
  phase,
  pendingTiles,
  hover,
  error
}: FacetsHeaderProps) {
  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-bronze/20 px-4 py-3 min-h-14">
      <h1 className="font-serif text-xl tracking-widest text-bronze-bright uppercase">Facets</h1>
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
        onChange={(event) => setScale(Number(event.target.value))}
        value={scale}
      >
        {SCALES.map((value) => (
          <option key={value} value={value}>
            {value}× px/tile
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1.5 text-xs text-parchment/60">
        <input checked={staticsOn} onChange={(event) => setStaticsOn(event.target.checked)} type="checkbox" />
        statics (slower)
      </label>
      <div className="flex-1" />
      <span className="text-xs text-parchment/40">
        {dimensions ? `${dimensions.width}×${dimensions.height} tiles · ${scale}×` : ''}
        {' · '}
        {phase}
        {pendingTiles > 0 ? ` · rendering ${pendingTiles} tiles` : ''}
        {hover ? ` · cursor ${hover.x},${hover.y}` : ''}
        {error ? ` · ${error}` : ''}
      </span>
      <GitHubButton />
    </header>
  );
}
