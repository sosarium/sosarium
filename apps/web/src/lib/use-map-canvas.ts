import type { FacetDimensions, StaticTile } from '@sosarium/formats';
import { type RefObject, useCallback, useEffect, useMemo, useRef } from 'react';

import { type BlockData, CANVAS_PX, radarCanvas, ZOOM_STEPS } from './map-view';
import type { MapWorkerResponse } from './map-worker-protocol';

export interface MapView {
  tileX: number;
  tileY: number;
}

export interface FacetImage {
  width: number;
  height: number;
  sampleTiles: number;
  rgba: Uint8ClampedArray;
}

type CanvasRef = RefObject<HTMLCanvasElement | null>;

export function useMapViewCanvas(
  canvasRef: CanvasRef,
  blocks: Map<string, BlockData>,
  view: MapView,
  zoom: number,
  selected: { x: number; y: number },
  staticsOn: boolean
): void {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    context.fillStyle = '#100d0b';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const firstX = Math.floor(view.tileX / 8);
    const firstY = Math.floor(view.tileY / 8);
    const lastX = Math.ceil((view.tileX + CANVAS_PX / zoom) / 8);
    const lastY = Math.ceil((view.tileY + CANVAS_PX / zoom) / 8);
    for (let bx = firstX; bx <= lastX; bx++) {
      for (let by = firstY; by <= lastY; by++) {
        const block = blocks.get(`${bx},${by}`);
        if (!block) {
          continue;
        }
        const radar = staticsOn ? block.radar : block.radarNoStatics;
        const source = radarCanvas(radar);
        context.imageSmoothingEnabled = false;
        context.drawImage(source, (bx * 8 - view.tileX) * zoom, (by * 8 - view.tileY) * zoom, 8 * zoom, 8 * zoom);
      }
    }
    context.strokeStyle = '#e0b070';
    context.lineWidth = 2;
    const selectionX = (selected.x * 8 - view.tileX) * zoom;
    const selectionY = (selected.y * 8 - view.tileY) * zoom;
    context.strokeRect(selectionX + 1, selectionY + 1, 8 * zoom - 2, 8 * zoom - 2);
  }, [canvasRef, blocks, view, zoom, selected, staticsOn]);
}

interface MinimapOptions {
  canvasRef: CanvasRef;
  workerRef: RefObject<Worker | null>;
  pendingRef: RefObject<Map<number, (response: MapWorkerResponse) => void>>;
  nextIdRef: RefObject<number>;
  phase: string;
  dimensions: FacetDimensions | null;
  view: MapView;
  zoom: number;
  facetImage: FacetImage | null;
  setFacetImage: (image: FacetImage | null) => void;
  setImageProgress: (progress: { done: number; total: number } | null) => void;
}

export function useMapMinimap({
  canvasRef,
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
}: MinimapOptions): void {
  const copyRef = useRef<HTMLCanvasElement | null>(null);

  const drawMinimap = useCallback(() => {
    const canvas = canvasRef.current;
    const copy = copyRef.current;
    if (!canvas || !copy || !facetImage) {
      return;
    }
    canvas.width = Math.min(220, facetImage.width);
    canvas.height = Math.max(1, Math.round((facetImage.height / facetImage.width) * canvas.width));
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    context.imageSmoothingEnabled = false;
    context.drawImage(copy, 0, 0, canvas.width, canvas.height);
    const scaleX = canvas.width / facetImage.width;
    const scaleY = canvas.height / facetImage.height;
    const rectX = (view.tileX / facetImage.sampleTiles) * scaleX;
    const rectY = (view.tileY / facetImage.sampleTiles) * scaleY;
    const rectW = (CANVAS_PX / zoom / facetImage.sampleTiles) * scaleX;
    const rectH = (CANVAS_PX / zoom / facetImage.sampleTiles) * scaleY;
    context.strokeStyle = '#e0b070';
    context.lineWidth = 1;
    context.strokeRect(rectX, rectY, Math.max(2, rectW), Math.max(2, rectH));
  }, [canvasRef, facetImage, view, zoom]);

  useEffect(() => {
    if (phase !== 'ready' || !dimensions) {
      return;
    }
    const worker = workerRef.current;
    if (!worker) {
      return;
    }
    const id = nextIdRef.current++;
    setImageProgress({ done: 0, total: 1 });
    setFacetImage(null);
    pendingRef.current.set(id, (response) => {
      if (
        response.type === 'facetImage' &&
        response.rgba &&
        response.width &&
        response.height &&
        response.sampleTiles
      ) {
        setFacetImage({
          width: response.width,
          height: response.height,
          sampleTiles: response.sampleTiles,
          rgba: response.rgba
        });
      }
      setImageProgress(null);
    });
    worker.postMessage({ type: 'facetImage', id });
  }, [phase, dimensions, workerRef, pendingRef, nextIdRef, setFacetImage, setImageProgress]);

  useEffect(() => {
    if (!facetImage) {
      return;
    }
    const copy = document.createElement('canvas');
    copy.width = facetImage.width;
    copy.height = facetImage.height;
    const context = copy.getContext('2d');
    if (!context) {
      return;
    }
    const image = context.createImageData(facetImage.width, facetImage.height);
    image.data.set(facetImage.rgba);
    context.putImageData(image, 0, 0);
    copyRef.current = copy;
    drawMinimap();
  }, [facetImage, drawMinimap]);

  useEffect(() => {
    drawMinimap();
  }, [drawMinimap]);
}

export function useMapWheelZoom(
  canvasRef: CanvasRef,
  dimensions: FacetDimensions | null,
  view: MapView,
  zoom: number,
  setView: (view: MapView) => void,
  setZoom: (zoom: number) => void
): void {
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (!dimensions) {
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const currentZoom = zoomRef.current;
      const currentView = viewRef.current;
      const anchorX = currentView.tileX + ((event.clientX - rect.left) / rect.width) * (CANVAS_PX / currentZoom);
      const anchorY = currentView.tileY + ((event.clientY - rect.top) / rect.height) * (CANVAS_PX / currentZoom);
      const index = ZOOM_STEPS.indexOf(currentZoom);
      const direction = event.deltaY < 0 ? 1 : -1;
      const nextZoom = ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, index + direction))] ?? currentZoom;
      if (nextZoom === currentZoom) {
        return;
      }
      const visible = CANVAS_PX / nextZoom;
      setView({
        tileX: Math.max(
          0,
          Math.min(dimensions.width - visible, anchorX - ((event.clientX - rect.left) / rect.width) * visible)
        ),
        tileY: Math.max(
          0,
          Math.min(dimensions.height - visible, anchorY - ((event.clientY - rect.top) / rect.height) * visible)
        )
      });
      setZoom(nextZoom);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [canvasRef, dimensions, setView, setZoom]);
}

export function useBlockDetail(canvasRef: CanvasRef, selectedBlock: BlockData | null, staticsOn: boolean) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!selectedBlock) {
      return;
    }
    const radar = staticsOn ? selectedBlock.radar : selectedBlock.radarNoStatics;
    context.imageSmoothingEnabled = false;
    const source = radarCanvas(radar);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
  }, [canvasRef, selectedBlock, staticsOn]);

  const staticsList = useMemo(() => {
    if (!selectedBlock?.statics) {
      return [];
    }
    const rows: (StaticTile & { tileX: number; tileY: number; rowKey: string })[] = [];
    selectedBlock.statics.forEach((row, x) => {
      row.forEach((list, y) => {
        list.forEach((tile, ordinal) => {
          rows.push({
            ...tile,
            tileX: x,
            tileY: y,
            rowKey: `${x}:${y}:${tile.id}:${tile.z}:${tile.hue}:${ordinal}`
          });
        });
      });
    });
    return rows.sort((a, b) => a.tileX - b.tileX || a.tileY - b.tileY || a.z - b.z);
  }, [selectedBlock]);

  const landCells = useMemo(
    () =>
      (selectedBlock?.land ?? []).map((tile, position) => ({
        key: `${position}:${tile.id}:${tile.z}`,
        tile,
        position
      })),
    [selectedBlock]
  );

  return { staticsList, landCells };
}
