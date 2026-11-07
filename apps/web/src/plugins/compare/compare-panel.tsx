import { parseMulIndex } from '@sosarium/core';
import {
  diffHues,
  diffIndexTables,
  diffTiledata,
  type HuesDiff,
  type IndexTableDiff,
  parseHues,
  parseTileData,
  type TiledataDiff
} from '@sosarium/formats';
import { useMemo, useState } from 'react';

import { useSession } from '@/lib/session';
import { readDirectoryBytes, readSessionBytes } from '@/plugins/shared/session';

interface CompareResult {
  tiledata: TiledataDiff | null;
  hues: HuesDiff | null;
  art: IndexTableDiff | null;
  gumps: IndexTableDiff | null;
}

export function ComparePanel() {
  const session = useSession();
  const [status, setStatus] = useState<string | null>(null);
  const [compare, setCompare] = useState<CompareResult | null>(null);
  const [busy, setBusy] = useState(false);

  const runCompare = async () => {
    if (!('showDirectoryPicker' in window)) {
      setStatus('the directory picker is not available in this browser');
      return;
    }
    setBusy(true);
    setStatus('comparing…');
    try {
      const dir = await window.showDirectoryPicker({ id: 'uo-compare', mode: 'read' });
      const [tiledataA, tiledataB, huesA, huesB, artIdxA, artIdxB, gumpIdxA, gumpIdxB] = await Promise.all([
        readSessionBytes(session, 'tiledata.mul'),
        readDirectoryBytes(dir, 'tiledata.mul'),
        readSessionBytes(session, 'hues.mul'),
        readDirectoryBytes(dir, 'hues.mul'),
        readSessionBytes(session, 'artidx.mul'),
        readDirectoryBytes(dir, 'artidx.mul'),
        readSessionBytes(session, 'gumpidx.mul'),
        readDirectoryBytes(dir, 'gumpidx.mul')
      ]);
      const result: CompareResult = { tiledata: null, hues: null, art: null, gumps: null };
      if (tiledataA && tiledataB) {
        result.tiledata = diffTiledata(parseTileData(tiledataA), parseTileData(tiledataB));
      }
      if (huesA && huesB) {
        result.hues = diffHues(parseHues(huesA), parseHues(huesB));
      }
      if (artIdxA && artIdxB) {
        result.art = diffIndexTables(parseMulIndex(artIdxA), parseMulIndex(artIdxB));
      }
      if (gumpIdxA && gumpIdxB) {
        result.gumps = diffIndexTables(parseMulIndex(gumpIdxA), parseMulIndex(gumpIdxB));
      }
      setCompare(result);
      setStatus('comparison complete');
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : 'compare failed');
    } finally {
      setBusy(false);
    }
  };

  const compareSummary = useMemo(() => {
    if (!compare) {
      return null;
    }
    return [
      compare.tiledata
        ? `tiledata: ${compare.tiledata.landChanged} land / ${compare.tiledata.itemChanged} item records differ`
        : null,
      compare.hues ? `hues: ${compare.hues.changed} differences` : null,
      compare.art
        ? `art: ${compare.art.onlyA}+${compare.art.onlyB} missing, ${compare.art.differingLength} length diffs`
        : null,
      compare.gumps
        ? `gumps: ${compare.gumps.onlyA}+${compare.gumps.onlyB} missing, ${compare.gumps.differingLength} length diffs`
        : null
    ].filter((line): line is string => line !== null);
  }, [compare]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-bronze/20 px-4 py-2">
        <div className="flex-1" />
        <span className="max-w-xl text-xs text-parchment/40">{status ?? '\u00A0'}</span>
      </div>

      <div className="sf-opt scroll-area min-h-0 flex-1 overflow-y-auto p-4 text-xs">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <button
              className="rounded border border-bronze/30 px-3 py-1.5 text-parchment/70 disabled:opacity-40"
              disabled={busy}
              onClick={() => {
                runCompare().catch(() => undefined);
              }}
              type="button"
            >
              Pick compare folder
            </button>
            <span className="text-parchment/40">
              compares tiledata, hues and the art/gump index tables against this session
            </span>
          </div>
          {compareSummary ? (
            <ul className="space-y-1 text-parchment/70">
              {compareSummary.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
          {compare?.tiledata && compare.tiledata.itemSamples.length > 0 ? (
            <table className="w-full">
              <thead className="text-parchment/40">
                <tr>
                  <th className="text-left">item</th>
                  <th className="text-left">field</th>
                  <th className="text-left">this</th>
                  <th className="text-left">other</th>
                </tr>
              </thead>
              <tbody className="text-parchment/70">
                {compare.tiledata.itemSamples.slice(0, 12).map((sample) => (
                  <tr key={`${sample.index}-${sample.field}`}>
                    <td className="font-mono">0x{sample.index.toString(16)}</td>
                    <td>{sample.field}</td>
                    <td>{String(sample.a)}</td>
                    <td>{String(sample.b)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {compare?.hues && compare.hues.samples.length > 0 ? (
            <p className="text-parchment/50">
              hues: first difference · group {compare.hues.samples[0]?.index} · {compare.hues.samples[0]?.field} ·{' '}
              {String(compare.hues.samples[0]?.a)} vs {String(compare.hues.samples[0]?.b)}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
