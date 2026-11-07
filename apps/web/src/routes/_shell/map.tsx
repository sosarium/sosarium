import { type FacetDimensions, radarItemColor, radarLandColor, type StaticTile } from '@sosarium/formats';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { MapHeader } from '@/components/map/map-header';
import { MapSidebar } from '@/components/map/map-sidebar';
import { MapStage } from '@/components/map/map-stage';
import { saveFacet, setLandTile } from '@/lib/map-edit';
import { type FacetInfo, listFacets, prepareFacetWorker } from '@/lib/map-session';
import { type BlockData, CANVAS_PX, DEFAULT_ZOOM, failPending, flattenStatics } from '@/lib/map-view';
import type { MapWorkerBlockResponse, MapWorkerInit, MapWorkerResponse } from '@/lib/map-worker-protocol';
import { getPreferences } from '@/lib/preferences';
import { useSession } from '@/lib/session';
import {
  type FacetImage,
  useBlockDetail,
  useMapMinimap,
  useMapViewCanvas,
  useMapWheelZoom
} from '@/lib/use-map-canvas';

export const Route = createFileRoute('/_shell/map')({
  component: MapPage
});

function MapPage() {
  const session = useSession();
  const [facets, setFacets] = useState<FacetInfo[]>([]);
  const [facet, setFacet] = useState(0);
  const [extended, setExtended] = useState(false);
  const [dimensions, setDimensions] = useState<FacetDimensions | null>(null);
  const [view, setView] = useState({
    tileX: 1495 - CANVAS_PX / DEFAULT_ZOOM / 2,
    tileY: 1629 - CANVAS_PX / DEFAULT_ZOOM / 2
  });
  const [selected, setSelected] = useState({ x: 186, y: 203 });
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [hover, setHover] = useState<{ tileX: number; tileY: number } | null>(null);
  const [facetImage, setFacetImage] = useState<FacetImage | null>(null);
  const [imageProgress, setImageProgress] = useState<{ done: number; total: number } | null>(null);
  const [blocks, setBlocks] = useState<Map<string, BlockData>>(new Map());
  const [staticsOn, setStaticsOn] = useState(() => getPreferences().mapStaticsDefault);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [blockCount, setBlockCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [jumpX, setJumpX] = useState('1495');
  const [jumpY, setJumpY] = useState('1629');
  const [landEdits, setLandEdits] = useState<Map<number, Uint8Array>>(new Map());
  const [staticEdits, setStaticEdits] = useState<Map<number, StaticTile[] | null>>(new Map());
  const [radarColors, setRadarColors] = useState<Uint16Array | null>(null);
  const [radarDirty, setRadarDirty] = useState(false);
  const [defrag, setDefrag] = useState(false);
  const [selectedTile, setSelectedTile] = useState(0);
  const [tileId, setTileId] = useState('');
  const [tileZ, setTileZ] = useState('');
  const [staticForm, setStaticForm] = useState({ id: '0x1', x: '0', y: '0', z: '0', hue: '0' });
  const [recolor, setRecolor] = useState('#000000');
  const [copyForm, setCopyForm] = useState({ sx: '0', sy: '0', tx: '0', ty: '0', size: '1' });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [selectedStaticIndex, setSelectedStaticIndex] = useState(0);
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef(new Map<number, (response: MapWorkerResponse) => void>());
  const nextIdRef = useRef(1);
  const viewCanvasRef = useRef<HTMLCanvasElement>(null);
  const detailCanvasRef = useRef<HTMLCanvasElement>(null);
  const overviewCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (session.status !== 'ready') {
      setFacets([]);
      return;
    }
    const list = listFacets(session);
    setFacets(list);
    if (list.length > 0 && !list.some((info) => info.facet === facet)) {
      setFacet(list[0]?.facet ?? 0);
    }
  }, [session, facet]);

  useEffect(() => {
    if (session.status !== 'ready' || facets.length === 0) {
      return;
    }
    let cancelled = false;
    setPhase('loading');
    setBlockCount(0);
    setError(null);
    setBlocks(new Map());
    workerRef.current?.terminate();
    workerRef.current = null;
    failPending(pendingRef.current, 'the map worker was replaced');

    prepareFacetWorker(session, facet, extended)
      .then((init: MapWorkerInit) => {
        if (cancelled) {
          return;
        }
        const worker = new Worker(new URL('../../lib/map-worker.ts', import.meta.url), { type: 'module' });
        worker.onerror = () => {
          setError('the map worker failed to load');
          failPending(pendingRef.current, 'the map worker failed');
          setPhase('error');
        };
        worker.onmessage = (event: MessageEvent<MapWorkerResponse>) => {
          const message = event.data;
          if (message.type === 'ready') {
            setPhase('ready');
            return;
          }
          if (message.type === 'facetImage-progress') {
            setImageProgress({ done: message.done, total: message.total });
            return;
          }
          const resolve = pendingRef.current.get(message.id);
          pendingRef.current.delete(message.id);
          resolve?.(message);
        };
        worker.postMessage({ type: 'init', ...init });
        workerRef.current = worker;
        setRadarColors(init.radarColors);
        setDimensions(init.dimensions);
        setLandEdits(new Map());
        setStaticEdits(new Map());
        setRadarDirty(false);
        setSaveMsg(null);
        const useBritain = init.dimensions.width >= 6144;
        const centerX = useBritain ? 1495 : Math.floor(init.dimensions.width / 2);
        const centerY = useBritain ? 1629 : Math.floor(init.dimensions.height / 2);
        const half = CANVAS_PX / DEFAULT_ZOOM / 2;
        setZoom(DEFAULT_ZOOM);
        setView({
          tileX: Math.max(0, Math.min(init.dimensions.width - 1, centerX - half)),
          tileY: Math.max(0, Math.min(init.dimensions.height - 1, centerY - half))
        });
        setSelected({
          x: Math.max(0, Math.min(init.dimensions.blockWidth - 1, Math.floor(centerX / 8))),
          y: Math.max(0, Math.min(init.dimensions.blockHeight - 1, Math.floor(centerY / 8)))
        });
        setFacetImage(null);
        setImageProgress(null);
        setHover(null);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'could not open the map');
          setPhase('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [session, facet, extended, facets.length]);

  useEffect(
    () => () => {
      workerRef.current?.terminate();
    },
    []
  );

  const requestBlock = useCallback(
    (
      x: number,
      y: number,
      overrides?: { landBytes?: Uint8Array; statics?: StaticTile[] }
    ): Promise<MapWorkerBlockResponse> => {
      const worker = workerRef.current;
      if (!worker) {
        return Promise.resolve({ type: 'block', id: -1, error: 'no worker' });
      }
      const id = nextIdRef.current++;
      return new Promise<MapWorkerBlockResponse>((resolve) => {
        pendingRef.current.set(id, (response) => resolve(response as MapWorkerBlockResponse));
        worker.postMessage({ type: 'block', id, x, y, ...overrides });
      });
    },
    []
  );

  useEffect(() => {
    if (phase !== 'ready' || !dimensions) {
      return;
    }
    let cancelled = false;
    const visibleTiles = CANVAS_PX / zoom;
    const startX = Math.floor(view.tileX / 8) - 1;
    const startY = Math.floor(view.tileY / 8) - 1;
    const endX = Math.ceil((view.tileX + visibleTiles) / 8) + 1;
    const endY = Math.ceil((view.tileY + visibleTiles) / 8) + 1;
    const wanted: { x: number; y: number }[] = [];
    for (let bx = startX; bx < endX; bx++) {
      for (let by = startY; by < endY; by++) {
        if (bx < 0 || by < 0 || bx >= dimensions.blockWidth || by >= dimensions.blockHeight) {
          continue;
        }
        if (!blocks.has(`${bx},${by}`)) {
          wanted.push({ x: bx, y: by });
        }
      }
    }
    if (wanted.length === 0) {
      return;
    }
    (async () => {
      const next = new Map(blocks);
      const blockHeight = dimensions.blockHeight;
      const responses = await Promise.all(
        wanted.map((position) =>
          requestBlock(position.x, position.y, {
            landBytes: landEdits.get(position.x * blockHeight + position.y),
            statics: staticEdits.has(position.x * blockHeight + position.y)
              ? (staticEdits.get(position.x * blockHeight + position.y) ?? [])
              : undefined
          }).then((response) => ({ position, response }))
        )
      );
      if (cancelled) {
        return;
      }
      for (const { position, response } of responses) {
        if (response.error) {
          setError(`block ${position.x},${position.y}: ${response.error}`);
          return;
        }
        if (!response.land || !response.radar || !response.radarNoStatics) {
          continue;
        }
        next.set(`${position.x},${position.y}`, {
          land: response.land,
          landBytes: response.landBytes ?? new Uint8Array(196),
          statics: response.statics ?? null,
          radar: response.radar,
          radarNoStatics: response.radarNoStatics
        });
      }
      if (!cancelled) {
        setBlocks(next);
        setBlockCount(next.size);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, dimensions, view, zoom, blocks, requestBlock, landEdits, staticEdits]);

  useMapViewCanvas(viewCanvasRef, blocks, view, zoom, selected, staticsOn);

  useMapMinimap({
    canvasRef: overviewCanvasRef,
    workerRef,
    pendingRef,
    nextIdRef,
    phase,
    dimensions,
    view,
    zoom,
    facetImage,
    setFacetImage,
    setImageProgress
  });

  useMapWheelZoom(viewCanvasRef, dimensions, view, zoom, setView, setZoom);

  const selectedBlock = blocks.get(`${selected.x},${selected.y}`) ?? null;

  const { staticsList, landCells } = useBlockDetail(detailCanvasRef, selectedBlock, staticsOn);

  const selectedIndex = dimensions ? selected.x * dimensions.blockHeight + selected.y : 0;
  const selectedTileData = selectedBlock?.land[selectedTile] ?? null;
  const currentLandColor =
    radarColors && selectedTileData ? radarLandColor({ colors: radarColors }, selectedTileData.id) : 0;
  const selectedStatic = staticsList[selectedStaticIndex] ?? null;
  const currentStaticColor =
    radarColors && selectedStatic ? radarItemColor({ colors: radarColors }, selectedStatic.id) : 0;

  const invalidateBlock = (blockX: number, blockY: number) => {
    setBlocks((current) => {
      const next = new Map(current);
      next.delete(`${blockX},${blockY}`);
      return next;
    });
  };

  const applyLandEdit = () => {
    if (!selectedBlock || !dimensions) {
      return;
    }
    const id = Number.parseInt(tileId.replace(/^0x/i, ''), tileId.startsWith('0x') ? 16 : 10);
    const z = Number.parseInt(tileZ, 10);
    const bytes = landEdits.get(selectedIndex) ?? selectedBlock.landBytes ?? new Uint8Array(196);
    const updated = setLandTile(bytes, selectedTile, Number.isNaN(id) ? 0 : id, Number.isNaN(z) ? 0 : z);
    setLandEdits(new Map(landEdits).set(selectedIndex, updated));
    invalidateBlock(selected.x, selected.y);
    setSaveMsg(
      `land tile ${selectedTile} set to 0x${(Number.isNaN(id) ? 0 : id).toString(16)} z ${Number.isNaN(z) ? 0 : z}`
    );
  };

  const applyStaticAdd = () => {
    if (!selectedBlock || !dimensions) {
      return;
    }
    const parse = (value: string) => {
      const trimmed = value.trim();
      const parsed = Number.parseInt(trimmed.replace(/^0x/i, ''), trimmed.startsWith('0x') ? 16 : 10);
      return Number.isNaN(parsed) ? 0 : parsed;
    };
    const tile: StaticTile = {
      id: parse(staticForm.id),
      x: Math.max(0, Math.min(7, parse(staticForm.x))),
      y: Math.max(0, Math.min(7, parse(staticForm.y))),
      z: Math.max(-128, Math.min(127, parse(staticForm.z))),
      hue: Math.max(-32768, Math.min(32767, parse(staticForm.hue)))
    };
    const list = staticEdits.has(selectedIndex)
      ? (staticEdits.get(selectedIndex) ?? [])
      : flattenStatics(selectedBlock.statics);
    setStaticEdits(new Map(staticEdits).set(selectedIndex, [...list, tile]));
    invalidateBlock(selected.x, selected.y);
    setSaveMsg(`static 0x${tile.id.toString(16)} added to block ${selected.x},${selected.y}`);
  };

  const applyStaticRemove = () => {
    if (!selectedStatic) {
      return;
    }
    const list = staticEdits.has(selectedIndex)
      ? (staticEdits.get(selectedIndex) ?? [])
      : flattenStatics(selectedBlock?.statics ?? null);
    const position = list.findIndex(
      (tile) =>
        tile.id === selectedStatic.id &&
        tile.x === selectedStatic.x &&
        tile.y === selectedStatic.y &&
        tile.z === selectedStatic.z &&
        tile.hue === selectedStatic.hue
    );
    if (position < 0) {
      return;
    }
    const next = [...list.slice(0, position), ...list.slice(position + 1)];
    setStaticEdits(new Map(staticEdits).set(selectedIndex, next));
    invalidateBlock(selected.x, selected.y);
    setSaveMsg('static removed');
  };

  const applyClearStatics = () => {
    setStaticEdits(new Map(staticEdits).set(selectedIndex, []));
    invalidateBlock(selected.x, selected.y);
    setSaveMsg(`statics cleared in block ${selected.x},${selected.y}`);
  };

  const applyRecolor = () => {
    if (!radarColors || !selectedTileData) {
      return;
    }
    const hex = recolor.replace('#', '');
    const value = Number.parseInt(hex, 16);
    if (Number.isNaN(value)) {
      return;
    }
    const next = radarColors.slice();
    next[selectedTileData.id] = value & 0x7fff;
    setRadarColors(next);
    setRadarDirty(true);
    workerRef.current?.postMessage({ type: 'settings', radarColors: next });
    setBlocks(new Map());
    setSaveMsg(`radar color of land 0x${selectedTileData.id.toString(16)} set to ${recolor}`);
  };

  const applyRegionCopy = async () => {
    const worker = workerRef.current;
    if (!worker || !dimensions) {
      return;
    }
    const parse = (value: string) => {
      const parsed = Number.parseInt(value, 10);
      return Number.isNaN(parsed) ? 0 : parsed;
    };
    setSaveMsg('copying region…');
    const id = nextIdRef.current++;
    const response = await new Promise<MapWorkerResponse>((resolve) => {
      pendingRef.current.set(id, resolve);
      worker.postMessage({
        type: 'region',
        id,
        request: {
          sourceX: parse(copyForm.sx),
          sourceY: parse(copyForm.sy),
          targetX: parse(copyForm.tx),
          targetY: parse(copyForm.ty),
          width: Math.max(1, parse(copyForm.size)),
          height: Math.max(1, parse(copyForm.size))
        }
      });
    });
    if (response.type !== 'region' || response.error || !response.landEdits || !response.staticEdits) {
      setSaveMsg((response.type === 'region' ? response.error : null) ?? 'region copy failed');
      return;
    }
    const nextLand = new Map(landEdits);
    for (const [index, bytes] of response.landEdits) {
      nextLand.set(index, bytes);
    }
    const nextStatics = new Map(staticEdits);
    for (const [index, tiles] of response.staticEdits) {
      nextStatics.set(index, tiles);
    }
    setLandEdits(nextLand);
    setStaticEdits(nextStatics);
    setBlocks(new Map());
    setSaveMsg(`region copied (${response.landEdits.length} blocks)`);
  };

  const save = async () => {
    if (!dimensions) {
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const result = await saveFacet(session, {
        facet,
        extended,
        dimensions,
        landEdits,
        staticEdits,
        radarColors: radarDirty ? radarColors : null,
        defrag
      });
      setLandEdits(new Map());
      setStaticEdits(new Map());
      setRadarDirty(false);
      setBlocks(new Map());
      setSaveMsg(
        result.files.length > 0
          ? `saved ${result.files.join(', ')}${result.tilesWritten ? ` · ${result.tilesWritten} statics` : ''}`
          : 'nothing to save'
      );
    } catch (cause) {
      setSaveMsg(cause instanceof Error ? cause.message : 'save failed');
    } finally {
      setSaving(false);
    }
  };

  const dirty = landEdits.size > 0 || staticEdits.size > 0 || radarDirty || defrag;

  const move = (directionX: number, directionY: number) => {
    if (!dimensions) {
      return;
    }
    const visible = CANVAS_PX / zoom;
    setView((current) => ({
      tileX: Math.max(0, Math.min(dimensions.width - visible, current.tileX + directionX * visible)),
      tileY: Math.max(0, Math.min(dimensions.height - visible, current.tileY + directionY * visible))
    }));
  };

  const jumpToTile = (tileX: number, tileY: number) => {
    if (!dimensions) {
      return;
    }
    const blockX = Math.max(0, Math.min(dimensions.blockWidth - 1, Math.floor(tileX / 8)));
    const blockY = Math.max(0, Math.min(dimensions.blockHeight - 1, Math.floor(tileY / 8)));
    const visible = CANVAS_PX / zoom;
    setSelected({ x: blockX, y: blockY });
    setView({
      tileX: Math.max(0, Math.min(dimensions.width - visible, tileX - visible / 2)),
      tileY: Math.max(0, Math.min(dimensions.height - visible, tileY - visible / 2))
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <MapHeader
        blockCount={blockCount}
        defrag={defrag}
        dimensions={dimensions}
        dirty={dirty}
        extended={extended}
        facet={facet}
        facets={facets}
        phase={phase}
        readWrite={session.mode === 'readwrite'}
        save={save}
        saveMsg={saveMsg}
        saving={saving}
        setDefrag={setDefrag}
        setExtended={setExtended}
        setFacet={setFacet}
        setStaticsOn={setStaticsOn}
        setZoom={setZoom}
        staticsOn={staticsOn}
        zoom={zoom}
      />

      {error ? (
        <div className="m-6 rounded border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200/90">
          {error}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <MapStage
            dimensions={dimensions}
            facet={facet}
            facetImage={facetImage}
            facets={facets}
            hover={hover}
            imageProgress={imageProgress}
            jumpToTile={jumpToTile}
            move={move}
            overviewCanvasRef={overviewCanvasRef}
            setHover={setHover}
            setSelected={setSelected}
            setView={setView}
            view={view}
            viewCanvasRef={viewCanvasRef}
            zoom={zoom}
          />

          <MapSidebar
            applyClearStatics={applyClearStatics}
            applyLandEdit={applyLandEdit}
            applyRecolor={applyRecolor}
            applyRegionCopy={applyRegionCopy}
            applyStaticAdd={applyStaticAdd}
            applyStaticRemove={applyStaticRemove}
            copyForm={copyForm}
            currentLandColor={currentLandColor}
            currentStaticColor={currentStaticColor}
            detailCanvasRef={detailCanvasRef}
            jumpToTile={jumpToTile}
            jumpX={jumpX}
            jumpY={jumpY}
            landCells={landCells}
            radarColors={radarColors}
            recolor={recolor}
            selected={selected}
            selectedStatic={selectedStatic}
            selectedStaticIndex={selectedStaticIndex}
            selectedTile={selectedTile}
            setCopyForm={setCopyForm}
            setJumpX={setJumpX}
            setJumpY={setJumpY}
            setRecolor={setRecolor}
            setSelectedStaticIndex={setSelectedStaticIndex}
            setSelectedTile={setSelectedTile}
            setStaticForm={setStaticForm}
            setTileId={setTileId}
            setTileZ={setTileZ}
            staticForm={staticForm}
            staticsList={staticsList}
            tileId={tileId}
            tileZ={tileZ}
          />
        </div>
      )}
    </div>
  );
}
