import { type LandTile, radarLandColor, type StaticTile } from '@sosarium/formats';
import type { RefObject } from 'react';

import { PRESETS } from '@/lib/map-view';

type StaticRow = StaticTile & { tileX: number; tileY: number; rowKey: string };
export type StaticForm = Record<'id' | 'x' | 'y' | 'z' | 'hue', string>;
export type CopyForm = Record<'sx' | 'sy' | 'tx' | 'ty' | 'size', string>;

interface MapSidebarProps {
  selected: { x: number; y: number };
  detailCanvasRef: RefObject<HTMLCanvasElement | null>;
  jumpX: string;
  setJumpX: (value: string) => void;
  jumpY: string;
  setJumpY: (value: string) => void;
  jumpToTile: (tileX: number, tileY: number) => void;
  staticsList: StaticRow[];
  selectedStaticIndex: number;
  setSelectedStaticIndex: (index: number) => void;
  selectedTile: number;
  setSelectedTile: (position: number) => void;
  landCells: { key: string; tile: LandTile; position: number }[];
  setTileId: (value: string) => void;
  setTileZ: (value: string) => void;
  radarColors: Uint16Array | null;
  tileId: string;
  tileZ: string;
  applyLandEdit: () => void;
  currentLandColor: number;
  recolor: string;
  setRecolor: (value: string) => void;
  applyRecolor: () => void;
  staticForm: StaticForm;
  setStaticForm: (form: StaticForm) => void;
  applyStaticAdd: () => void;
  selectedStatic: StaticRow | null;
  applyStaticRemove: () => void;
  applyClearStatics: () => void;
  currentStaticColor: number;
  copyForm: CopyForm;
  setCopyForm: (form: CopyForm) => void;
  applyRegionCopy: () => Promise<void>;
}

export function MapSidebar({
  selected,
  detailCanvasRef,
  jumpX,
  setJumpX,
  jumpY,
  setJumpY,
  jumpToTile,
  staticsList,
  selectedStaticIndex,
  setSelectedStaticIndex,
  selectedTile,
  setSelectedTile,
  landCells,
  setTileId,
  setTileZ,
  radarColors,
  tileId,
  tileZ,
  applyLandEdit,
  currentLandColor,
  recolor,
  setRecolor,
  applyRecolor,
  staticForm,
  setStaticForm,
  applyStaticAdd,
  selectedStatic,
  applyStaticRemove,
  applyClearStatics,
  currentStaticColor,
  copyForm,
  setCopyForm,
  applyRegionCopy
}: MapSidebarProps) {
  return (
    <aside className="flex w-96 flex-none flex-col border-l border-bronze/20">
      <div className="border-b border-bronze/20 p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs tracking-widest text-parchment/40 uppercase">Block</h2>
          <span className="text-xs text-parchment/50">
            {selected.x},{selected.y} · tiles {selected.x * 8},{selected.y * 8}
          </span>
        </div>
        <canvas
          className="mt-2 rounded border border-bronze/20"
          height={256}
          ref={detailCanvasRef}
          style={{ imageRendering: 'pixelated' }}
          width={256}
        />
      </div>

      <div className="border-b border-bronze/20 p-3">
        <h2 className="text-xs tracking-widest text-parchment/40 uppercase">Jump to tile</h2>
        <div className="mt-2 flex items-center gap-2 text-xs">
          <input
            className="w-20 rounded border border-bronze/30 bg-ink px-2 py-1 text-parchment/80"
            onChange={(event) => setJumpX(event.target.value)}
            value={jumpX}
          />
          <input
            className="w-20 rounded border border-bronze/30 bg-ink px-2 py-1 text-parchment/80"
            onChange={(event) => setJumpY(event.target.value)}
            value={jumpY}
          />
          <button
            className="rounded border border-bronze/30 px-2 py-1 text-parchment/70"
            onClick={() => jumpToTile(Number(jumpX) || 0, Number(jumpY) || 0)}
            type="button"
          >
            Go
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {PRESETS.map((preset) => (
            <button
              className="rounded border border-bronze/30 px-2 py-1 text-parchment/60 hover:border-bronze/60"
              key={preset.name}
              onClick={() => {
                setJumpX(String(preset.x));
                setJumpY(String(preset.y));
                jumpToTile(preset.x, preset.y);
              }}
              type="button"
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <h2 className="border-b border-bronze/20 px-3 py-2 text-xs tracking-widest text-parchment/40 uppercase">
          Statics ({staticsList.length})
        </h2>
        <div className="sf-opt scroll-area min-h-0 flex-1 overflow-y-auto px-3 py-2 text-xs">
          <table className="w-full">
            <thead className="text-parchment/40">
              <tr>
                <th className="text-left">id</th>
                <th className="text-left">x,y</th>
                <th className="text-left">z</th>
                <th className="text-left">hue</th>
              </tr>
            </thead>
            <tbody className="text-parchment/70">
              {staticsList.map((tile, index) => (
                <tr
                  className={index === selectedStaticIndex ? 'bg-bronze/20' : ''}
                  key={tile.rowKey}
                  onClick={() => setSelectedStaticIndex(index)}
                >
                  <td className="font-mono">0x{tile.id.toString(16).toUpperCase().padStart(4, '0')}</td>
                  <td>
                    {tile.tileX},{tile.tileY}
                  </td>
                  <td>{tile.z}</td>
                  <td>{tile.hue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="border-t border-bronze/20 px-3 py-2 text-xs">
        <h2 className="mb-1 text-xs tracking-widest text-parchment/40 uppercase">
          Land · tile {selectedTile} ({selectedTile % 8},{Math.floor(selectedTile / 8)})
        </h2>
        <div className="grid grid-cols-8 gap-px font-mono text-[9px] text-parchment/60">
          {landCells.map(({ key, tile, position }) => (
            <button
              className={`rounded-sm px-0.5 py-px text-center ${
                position === selectedTile ? 'bg-bronze/40 text-bronze-bright' : 'bg-ink/60'
              }`}
              key={key}
              onClick={() => {
                setSelectedTile(position);
                setTileId(`0x${tile.id.toString(16).toUpperCase()}`);
                setTileZ(String(tile.z));
                const color = radarColors ? radarLandColor({ colors: radarColors }, tile.id) : 0;
                setRecolor(`#${color.toString(16).padStart(4, '0')}`);
              }}
              title={`tile ${selected.x * 8 + (position % 8)},${selected.y * 8 + Math.floor(position / 8)} · z ${tile.z}`}
              type="button"
            >
              {tile.id.toString(16).toUpperCase().padStart(4, '0')}
            </button>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            className="w-20 rounded border border-bronze/30 bg-ink px-2 py-1 text-parchment/80"
            onChange={(event) => setTileId(event.target.value)}
            placeholder="0x0003"
            value={tileId}
          />
          <input
            className="w-14 rounded border border-bronze/30 bg-ink px-2 py-1 text-parchment/80"
            onChange={(event) => setTileZ(event.target.value)}
            placeholder="z"
            value={tileZ}
          />
          <button
            className="rounded border border-bronze/30 px-2 py-1 text-parchment/70"
            onClick={applyLandEdit}
            type="button"
          >
            Apply tile
          </button>
          <span className="font-mono text-parchment/30">radar {currentLandColor.toString(16).padStart(4, '0')}</span>
          <input
            className="w-20 rounded border border-bronze/30 bg-ink px-2 py-1 text-parchment/80"
            onChange={(event) => setRecolor(event.target.value)}
            value={recolor}
          />
          <button
            className="rounded border border-bronze/30 px-2 py-1 text-parchment/70"
            onClick={applyRecolor}
            type="button"
          >
            Recolor
          </button>
        </div>
      </div>

      <div className="border-t border-bronze/20 px-3 py-2 text-xs">
        <h2 className="mb-1 text-xs tracking-widest text-parchment/40 uppercase">Statics edit</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            className="w-16 rounded border border-bronze/30 bg-ink px-2 py-1 text-parchment/80"
            onChange={(event) => setStaticForm({ ...staticForm, id: event.target.value })}
            value={staticForm.id}
          />
          <input
            className="w-10 rounded border border-bronze/30 bg-ink px-1.5 py-1 text-parchment/80"
            onChange={(event) => setStaticForm({ ...staticForm, x: event.target.value })}
            value={staticForm.x}
          />
          <input
            className="w-10 rounded border border-bronze/30 bg-ink px-1.5 py-1 text-parchment/80"
            onChange={(event) => setStaticForm({ ...staticForm, y: event.target.value })}
            value={staticForm.y}
          />
          <input
            className="w-10 rounded border border-bronze/30 bg-ink px-1.5 py-1 text-parchment/80"
            onChange={(event) => setStaticForm({ ...staticForm, z: event.target.value })}
            value={staticForm.z}
          />
          <input
            className="w-12 rounded border border-bronze/30 bg-ink px-1.5 py-1 text-parchment/80"
            onChange={(event) => setStaticForm({ ...staticForm, hue: event.target.value })}
            value={staticForm.hue}
          />
          <button
            className="rounded border border-bronze/30 px-2 py-1 text-parchment/70"
            onClick={applyStaticAdd}
            type="button"
          >
            Add
          </button>
          <button
            className="rounded border border-bronze/30 px-2 py-1 text-parchment/70 disabled:opacity-40"
            disabled={!selectedStatic}
            onClick={applyStaticRemove}
            type="button"
          >
            Remove
          </button>
          <button
            className="rounded border border-bronze/30 px-2 py-1 text-parchment/70"
            onClick={applyClearStatics}
            type="button"
          >
            Clear block
          </button>
        </div>
        <p className="mt-1 text-[10px] text-parchment/30">
          id / x / y / z / hue · static radar {currentStaticColor.toString(16).padStart(4, '0')}
        </p>
      </div>

      <div className="border-t border-bronze/20 px-3 py-2 text-xs">
        <h2 className="mb-1 text-xs tracking-widest text-parchment/40 uppercase">Region copy</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            className="w-12 rounded border border-bronze/30 bg-ink px-1.5 py-1 text-parchment/80"
            onChange={(event) => setCopyForm({ ...copyForm, sx: event.target.value })}
            title="source block x"
            value={copyForm.sx}
          />
          <input
            className="w-12 rounded border border-bronze/30 bg-ink px-1.5 py-1 text-parchment/80"
            onChange={(event) => setCopyForm({ ...copyForm, sy: event.target.value })}
            title="source block y"
            value={copyForm.sy}
          />
          <span className="text-parchment/30">→</span>
          <input
            className="w-12 rounded border border-bronze/30 bg-ink px-1.5 py-1 text-parchment/80"
            onChange={(event) => setCopyForm({ ...copyForm, tx: event.target.value })}
            title="target block x"
            value={copyForm.tx}
          />
          <input
            className="w-12 rounded border border-bronze/30 bg-ink px-1.5 py-1 text-parchment/80"
            onChange={(event) => setCopyForm({ ...copyForm, ty: event.target.value })}
            title="target block y"
            value={copyForm.ty}
          />
          <input
            className="w-12 rounded border border-bronze/30 bg-ink px-1.5 py-1 text-parchment/80"
            onChange={(event) => setCopyForm({ ...copyForm, size: event.target.value })}
            title="size in blocks"
            value={copyForm.size}
          />
          <button
            className="rounded border border-bronze/30 px-2 py-1 text-parchment/70"
            onClick={() => {
              applyRegionCopy().catch(() => undefined);
            }}
            type="button"
          >
            Copy
          </button>
        </div>
        <p className="mt-1 text-[10px] text-parchment/30">source x,y → target x,y · size (blocks)</p>
      </div>
    </aside>
  );
}
