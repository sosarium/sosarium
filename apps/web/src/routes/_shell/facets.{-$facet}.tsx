import type { FacetDimensions } from '@sosarium/formats';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { FacetOverviewPanel } from '@/components/facets/facet-overview-panel';
import { FacetsHeader } from '@/components/facets/facets-header';
import { formatIndexParam, parseIndexParam } from '@/lib/deep-link';
import { FACET_NAMES, type FacetInfo, listFacets, prepareFacetWorker } from '@/lib/map-session';
import { failPending } from '@/lib/map-view';
import type { MapWorkerInit, MapWorkerResponse } from '@/lib/map-worker-protocol';
import { useSession } from '@/lib/session';
import type { FacetImage } from '@/lib/use-map-canvas';
import { useUrlStateSync } from '@/lib/use-url-state';

function toCoordinate(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

export const Route = createFileRoute('/_shell/facets/{-$facet}')({
  validateSearch: (search: Record<string, unknown>) => ({
    statics: search.statics === 1 || search.statics === '1' ? 1 : 0,
    x: toCoordinate(search.x),
    y: toCoordinate(search.y),
    z: search.z === 2 || search.z === '2' ? 2 : search.z === 4 || search.z === '4' ? 4 : 1
  }),
  component: FacetsPage
});

const TILE_PX = 256;
const OCEAN = '#12222f';

interface Viewport {
  width: number;
  height: number;
}

function tileKey(originX: number, originY: number, scale: number, statics: boolean): string {
  return `${originX}:${originY}:${scale}:${statics ? 1 : 0}`;
}

function FacetsPage() {
  const session = useSession();
  const params = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [facets, setFacets] = useState<FacetInfo[]>([]);
  const [facet, setFacet] = useState(() => parseIndexParam(params.facet) ?? 0);
  const [extended, setExtended] = useState(false);
  const [scale, setScale] = useState(() => search.z);
  const [staticsOn, setStaticsOn] = useState(() => search.statics === 1);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [dimensions, setDimensions] = useState<FacetDimensions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scroll, setScroll] = useState({ left: 0, top: 0 });
  const [viewport, setViewport] = useState<Viewport>({ width: 900, height: 620 });
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [marker, setMarker] = useState<{ x: number; y: number } | null>(null);
  const [tileVersion, setTileVersion] = useState(0);
  const [pendingTiles, setPendingTiles] = useState(0);
  const [facetImage, setFacetImage] = useState<FacetImage | null>(null);
  const [imageProgress, setImageProgress] = useState<{ done: number; total: number } | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef(new Map<number, (response: MapWorkerResponse) => void>());
  const nextIdRef = useRef(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overviewCanvasRef = useRef<HTMLCanvasElement>(null);
  const tileCacheRef = useRef(new Map<string, HTMLCanvasElement>());
  const requestedRef = useRef(new Set<string>());
  const requestKeysRef = useRef(new Map<number, string>());
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    left: number;
    top: number;
    moved: boolean;
  } | null>(null);
  const visibleKeysRef = useRef(new Set<string>());

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
    const container = scrollRef.current;
    if (!container) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      setViewport({
        width: Math.max(200, Math.floor(entry.contentRect.width)),
        height: Math.max(200, Math.floor(entry.contentRect.height))
      });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (session.status !== 'ready' || facets.length === 0) {
      return;
    }
    let cancelled = false;
    setPhase('loading');
    setError(null);
    setDimensions(null);
    setFacetImage(null);
    setImageProgress(null);
    setMarker(null);
    tileCacheRef.current = new Map();
    requestedRef.current = new Set();
    workerRef.current?.terminate();
    workerRef.current = null;

    prepareFacetWorker(session, facet, extended)
      .then((init: MapWorkerInit) => {
        if (cancelled) {
          return;
        }
        const worker = new Worker(new URL('../../lib/map-worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (event: MessageEvent<MapWorkerResponse>) => {
          const message = event.data;
          if (message.type === 'ready') {
            setPhase('ready');
            return;
          }
          if (message.type === 'mapTile') {
            const requestKey = requestKeysRef.current.get(message.id);
            requestKeysRef.current.delete(message.id);
            if (message.rgba && message.originX !== undefined && message.originY !== undefined && requestKey) {
              const key = requestKey;
              const canvas = document.createElement('canvas');
              canvas.width = message.tiles ? message.tiles * (message.scale ?? 1) : TILE_PX;
              canvas.height = canvas.width;
              const context = canvas.getContext('2d');
              if (context) {
                const image = context.createImageData(canvas.width, canvas.height);
                image.data.set(message.rgba);
                context.putImageData(image, 0, 0);
              }
              tileCacheRef.current.set(key, canvas);
              requestedRef.current.delete(key);
              const capacity = Math.max(64, visibleKeysRef.current.size * 2);
              if (tileCacheRef.current.size > capacity) {
                for (const cachedKey of tileCacheRef.current.keys()) {
                  if (tileCacheRef.current.size <= capacity) {
                    break;
                  }
                  if (!visibleKeysRef.current.has(cachedKey)) {
                    tileCacheRef.current.delete(cachedKey);
                  }
                }
              }
              setPendingTiles((value) => Math.max(0, value - 1));
              setTileVersion((value) => value + 1);
            } else {
              setPendingTiles((value) => Math.max(0, value - 1));
            }
            return;
          }
          if (message.type === 'facetImage-progress') {
            setImageProgress({ done: message.done, total: message.total });
            return;
          }
          if (message.type === 'facetImage') {
            if (message.rgba && message.width && message.height && message.sampleTiles) {
              setFacetImage({
                width: message.width,
                height: message.height,
                sampleTiles: message.sampleTiles,
                rgba: message.rgba
              });
            }
            setImageProgress(null);
            return;
          }
          const resolve = pendingRef.current.get(message.id);
          pendingRef.current.delete(message.id);
          resolve?.(message);
        };
        worker.onerror = () => {
          setError('the facet worker failed to load');
          failPending(pendingRef.current, 'the facet worker failed');
          setPhase('error');
        };
        worker.postMessage({ type: 'init', ...init });
        workerRef.current = worker;
        setDimensions(init.dimensions);
        setScale(1);
        setPhase('ready');
        setImageProgress({ done: 0, total: 1 });
        worker.postMessage({ type: 'facetImage', id: nextIdRef.current++ });
        scrollRef.current?.scrollTo({ left: 0, top: 0 });
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'could not open the facet');
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

  const cacheScope = `${facet}:${extended ? 'x' : 'm'}:${scale}:${staticsOn ? 's' : 'n'}`;
  useEffect(() => {
    if (cacheScope.length === 0) {
      return;
    }
    tileCacheRef.current = new Map();
    requestedRef.current = new Set();
    requestKeysRef.current = new Map();
    setPendingTiles(0);
    setTileVersion((value) => value + 1);
  }, [cacheScope]);

  const visibleTiles = useMemo(() => {
    if (!dimensions || phase !== 'ready') {
      return [];
    }
    const coveredTiles = TILE_PX / scale;
    const firstX = Math.floor(scroll.left / TILE_PX) * coveredTiles;
    const firstY = Math.floor(scroll.top / TILE_PX) * coveredTiles;
    const lastX = Math.ceil((scroll.left + viewport.width) / TILE_PX) * coveredTiles;
    const lastY = Math.ceil((scroll.top + viewport.height) / TILE_PX) * coveredTiles;
    const list: { originX: number; originY: number; tiles: number }[] = [];
    for (let x = firstX; x <= lastX; x += coveredTiles) {
      for (let y = firstY; y <= lastY; y += coveredTiles) {
        list.push({ originX: x, originY: y, tiles: coveredTiles });
      }
    }
    return list;
  }, [dimensions, phase, scroll, viewport, scale]);

  useEffect(() => {
    visibleKeysRef.current = new Set(visibleTiles.map((tile) => tileKey(tile.originX, tile.originY, scale, staticsOn)));
    for (const key of [...requestedRef.current]) {
      if (!visibleKeysRef.current.has(key) && ![...requestKeysRef.current.values()].includes(key)) {
        requestedRef.current.delete(key);
      }
    }
  }, [visibleTiles, scale, staticsOn]);

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker || phase !== 'ready') {
      return;
    }
    for (const tile of visibleTiles) {
      const key = tileKey(tile.originX, tile.originY, scale, staticsOn);
      if (tileCacheRef.current.has(key) || requestedRef.current.has(key)) {
        continue;
      }
      requestedRef.current.add(key);
      setPendingTiles((value) => value + 1);
      const id = nextIdRef.current++;
      requestKeysRef.current.set(id, key);
      worker.postMessage({
        type: 'mapTile',
        id,
        originX: tile.originX,
        originY: tile.originY,
        tiles: tile.tiles,
        scale,
        statics: staticsOn
      });
    }
  }, [visibleTiles, phase, scale, staticsOn]);

  useEffect(() => {
    // tileVersion only exists to re-run this effect once a tile finishes rendering.
    void tileVersion;
    const canvas = canvasRef.current;
    if (!canvas || !dimensions) {
      return;
    }
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    context.fillStyle = OCEAN;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = false;
    const coveredTiles = TILE_PX / scale;
    const firstX = Math.floor(scroll.left / TILE_PX) * coveredTiles;
    const firstY = Math.floor(scroll.top / TILE_PX) * coveredTiles;
    const lastX = Math.ceil((scroll.left + viewport.width) / TILE_PX) * coveredTiles;
    const lastY = Math.ceil((scroll.top + viewport.height) / TILE_PX) * coveredTiles;
    for (let x = firstX; x <= lastX; x += coveredTiles) {
      for (let y = firstY; y <= lastY; y += coveredTiles) {
        const cached = tileCacheRef.current.get(tileKey(x, y, scale, staticsOn));
        if (!cached) {
          continue;
        }
        context.drawImage(cached, x * scale - scroll.left, y * scale - scroll.top);
      }
    }
    if (marker) {
      context.strokeStyle = '#e0b070';
      context.lineWidth = 1;
      context.strokeRect(marker.x * scale - scroll.left - 4, marker.y * scale - scroll.top - 4, 9, 9);
    }
  }, [dimensions, scroll, viewport, scale, staticsOn, tileVersion, marker]);

  useEffect(() => {
    const canvas = overviewCanvasRef.current;
    if (!canvas || !facetImage || !dimensions) {
      return;
    }
    canvas.width = Math.min(240, facetImage.width);
    canvas.height = Math.max(1, Math.round((facetImage.height / facetImage.width) * canvas.width));
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    const copy = document.createElement('canvas');
    copy.width = facetImage.width;
    copy.height = facetImage.height;
    const copyContext = copy.getContext('2d');
    if (!copyContext) {
      return;
    }
    const image = copyContext.createImageData(facetImage.width, facetImage.height);
    image.data.set(facetImage.rgba);
    copyContext.putImageData(image, 0, 0);
    context.imageSmoothingEnabled = false;
    context.drawImage(copy, 0, 0, canvas.width, canvas.height);
    const scaleX = canvas.width / facetImage.width;
    const scaleY = canvas.height / facetImage.height;
    context.strokeStyle = '#e0b070';
    context.lineWidth = 1;
    context.strokeRect(
      (scroll.left / scale / facetImage.sampleTiles) * scaleX,
      (scroll.top / scale / facetImage.sampleTiles) * scaleY,
      Math.max(2, (viewport.width / scale / facetImage.sampleTiles) * scaleX),
      Math.max(2, (viewport.height / scale / facetImage.sampleTiles) * scaleY)
    );
  }, [facetImage, dimensions, scroll, viewport, scale]);

  const facetName = facets.find((info) => info.facet === facet)?.name ?? FACET_NAMES[facet] ?? 'facet';
  const fullWidth = dimensions ? dimensions.width * scale : 0;
  const fullHeight = dimensions ? dimensions.height * scale : 0;

  const jumpTo = useCallback(
    (tileX: number, tileY: number) => {
      const container = scrollRef.current;
      if (!container) {
        return;
      }
      container.scrollTo({
        left: Math.max(0, tileX * scale - viewport.width / 2),
        top: Math.max(0, tileY * scale - viewport.height / 2)
      });
    },
    [scale, viewport]
  );

  useUrlStateSync({
    apply: () => {
      const parsed = parseIndexParam(params.facet);
      if (parsed !== null) {
        setFacet(parsed);
      }
    },
    paramKey: `${(params.facet ?? '').toLowerCase()}|${search.x ?? ''}|${search.y ?? ''}`,
    stateKey: `${formatIndexParam(facet).toLowerCase()}|${
      dimensions
        ? Math.max(0, Math.min(dimensions.width - 1, Math.round((scroll.left + viewport.width / 2) / scale)))
        : ''
    }|${
      dimensions
        ? Math.max(0, Math.min(dimensions.height - 1, Math.round((scroll.top + viewport.height / 2) / scale)))
        : ''
    }`,
    sync: () => {
      if (!dimensions) {
        return;
      }
      const x = Math.max(0, Math.min(dimensions.width - 1, Math.round((scroll.left + viewport.width / 2) / scale)));
      const y = Math.max(0, Math.min(dimensions.height - 1, Math.round((scroll.top + viewport.height / 2) / scale)));
      const statics = staticsOn ? 1 : 0;
      void navigate({
        to: '/facets/{-$facet}',
        params: { facet: formatIndexParam(facet) },
        replace: true,
        search: { statics, x, y, z: scale }
      });
    }
  });

  useEffect(() => {
    if (!dimensions || search.x === null || search.y === null) {
      return;
    }
    jumpTo(search.x, search.y);
  }, [dimensions, search.x, search.y, jumpTo]);

  const appliedRef = useRef(false);
  useEffect(() => {
    if (appliedRef.current || !dimensions || search.x === null || search.y === null) {
      return;
    }
    appliedRef.current = true;
    requestAnimationFrame(() => jumpTo(search.x ?? 0, search.y ?? 0));
  }, [dimensions, search.x, search.y, jumpTo]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <FacetsHeader
        dimensions={dimensions}
        error={error}
        extended={extended}
        facet={facet}
        facets={facets}
        hover={hover}
        pendingTiles={pendingTiles}
        phase={phase}
        scale={scale}
        setExtended={setExtended}
        setFacet={setFacet}
        setScale={setScale}
        setStaticsOn={setStaticsOn}
        staticsOn={staticsOn}
      />

      {error && phase === 'error' ? (
        <div className="m-6 rounded border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200/90">
          {error}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div
            className="sf-opt scroll-area relative min-h-0 flex-1 overflow-auto bg-[#12222f]"
            onScroll={(event) => {
              const target = event.currentTarget;
              setScroll({ left: target.scrollLeft, top: target.scrollTop });
            }}
            ref={scrollRef}
          >
            <div style={{ width: fullWidth, height: fullHeight, position: 'relative' }}>
              <canvas
                className="cursor-grab touch-none active:cursor-grabbing"
                onPointerCancel={() => {
                  dragRef.current = null;
                }}
                onPointerDown={(event) => {
                  if (event.pointerType === 'touch') {
                    return;
                  }
                  const container = scrollRef.current;
                  if (!container) {
                    return;
                  }
                  event.currentTarget.setPointerCapture(event.pointerId);
                  dragRef.current = {
                    pointerId: event.pointerId,
                    startX: event.clientX,
                    startY: event.clientY,
                    left: container.scrollLeft,
                    top: container.scrollTop,
                    moved: false
                  };
                }}
                onPointerLeave={() => setHover(null)}
                onPointerMove={(event) => {
                  const container = scrollRef.current;
                  const drag = dragRef.current;
                  if (drag && container && drag.pointerId === event.pointerId) {
                    const dx = event.clientX - drag.startX;
                    const dy = event.clientY - drag.startY;
                    if (Math.abs(dx) + Math.abs(dy) > 3) {
                      drag.moved = true;
                    }
                    container.scrollLeft = drag.left - dx;
                    container.scrollTop = drag.top - dy;
                    return;
                  }
                  const rect = event.currentTarget.getBoundingClientRect();
                  setHover({
                    x: Math.max(0, Math.floor((scroll.left + event.clientX - rect.left) / scale)),
                    y: Math.max(0, Math.floor((scroll.top + event.clientY - rect.top) / scale))
                  });
                }}
                onPointerUp={(event) => {
                  const drag = dragRef.current;
                  dragRef.current = null;
                  if (!drag || drag.moved || !dimensions) {
                    return;
                  }
                  const rect = event.currentTarget.getBoundingClientRect();
                  setMarker({
                    x: Math.max(0, Math.floor((scroll.left + event.clientX - rect.left) / scale)),
                    y: Math.max(0, Math.floor((scroll.top + event.clientY - rect.top) / scale))
                  });
                }}
                ref={canvasRef}
                style={{ position: 'sticky', left: 0, top: 0 }}
              />
            </div>
          </div>

          <FacetOverviewPanel
            facetImage={facetImage}
            facetName={facetName}
            imageProgress={imageProgress}
            jumpTo={jumpTo}
            marker={marker}
            overviewCanvasRef={overviewCanvasRef}
          />
        </div>
      )}
    </div>
  );
}
