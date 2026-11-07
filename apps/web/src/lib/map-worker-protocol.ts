import type { FacetDimensions, LandTile, MapUopChunk, StaticTile } from '@sosarium/formats';

export interface MapWorkerRequest {
  type: 'block';
  id: number;
  x: number;
  y: number;
  landBytes?: Uint8Array;
  statics?: StaticTile[] | null;
}

export interface MapWorkerRegionRequest {
  type: 'region';
  id: number;
  request: {
    sourceX: number;
    sourceY: number;
    targetX: number;
    targetY: number;
    width: number;
    height: number;
  };
}

export interface MapWorkerRegionResponse {
  type: 'region';
  id: number;
  landEdits?: [number, Uint8Array][];
  staticEdits?: [number, StaticTile[]][];
  error?: string;
}

export interface MapWorkerFacetImageRequest {
  type: 'facetImage';
  id: number;
}

export interface MapWorkerFacetImageProgress {
  type: 'facetImage-progress';
  id: number;
  done: number;
  total: number;
}

export interface MapWorkerFacetImageResponse {
  type: 'facetImage';
  id: number;
  width?: number;
  height?: number;
  sampleTiles?: number;
  rgba?: Uint8ClampedArray;
  error?: string;
}

export interface MapWorkerTileRequest {
  type: 'mapTile';
  id: number;
  originX: number;
  originY: number;
  tiles: number;
  scale: number;
  statics: boolean;
}

export interface MapWorkerTileResponse {
  type: 'mapTile';
  id: number;
  originX?: number;
  originY?: number;
  tiles?: number;
  scale?: number;
  rgba?: Uint8ClampedArray;
  error?: string;
}

export interface MapWorkerSettings {
  type: 'settings';
  radarColors: Uint16Array;
}

export interface MapWorkerBlockResponse {
  type: 'block';
  id: number;
  landBytes?: Uint8Array;
  land?: LandTile[];
  statics?: StaticTile[][][] | null;
  radar?: Uint16Array;
  radarNoStatics?: Uint16Array;
  error?: string;
}

export interface MapWorkerReady {
  type: 'ready';
  id: string;
}

export type MapWorkerResponse =
  | MapWorkerBlockResponse
  | MapWorkerRegionResponse
  | MapWorkerFacetImageProgress
  | MapWorkerFacetImageResponse
  | MapWorkerTileResponse
  | MapWorkerReady;

export interface MapWorkerInit {
  mapFile: File;
  table: MapUopChunk[] | null;
  dimensions: FacetDimensions;
  staidxFile: File;
  staticsFile: File;
  radarColors: Uint16Array;
  itemHeights: Uint16Array;
  hueColors: Uint16Array;
}
