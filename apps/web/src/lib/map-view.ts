import type { LandTile, StaticTile } from '@sosarium/formats';
import { rgb555ToRgba } from '@sosarium/render';

import type { MapWorkerResponse } from './map-worker-protocol';

export const CANVAS_PX = 512;
export const ZOOM_STEPS = [2, 4, 8, 16];
export const DEFAULT_ZOOM = 4;

export interface BlockData {
  land: LandTile[];
  landBytes: Uint8Array;
  statics: StaticTile[][][] | null;
  radar: Uint16Array;
  radarNoStatics: Uint16Array;
}

export function flattenStatics(statics: StaticTile[][][] | null): StaticTile[] {
  if (!statics) {
    return [];
  }
  const list: StaticTile[] = [];
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 8; y++) {
      for (const tile of statics[x]?.[y] ?? []) {
        list.push(tile);
      }
    }
  }
  return list;
}

export const PRESETS: { name: string; x: number; y: number }[] = [
  { name: 'Britain', x: 1495, y: 1629 },
  { name: 'Minoc', x: 2545, y: 470 },
  { name: 'Trinsic', x: 1890, y: 2730 },
  { name: 'Moonglow', x: 4447, y: 1155 }
];

export function radarCanvas(radar: Uint16Array): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 8;
  const context = canvas.getContext('2d');
  if (context) {
    const image = context.createImageData(8, 8);
    image.data.set(rgb555ToRgba(radar));
    context.putImageData(image, 0, 0);
  }
  return canvas;
}

export function failPending(pending: Map<number, (response: MapWorkerResponse) => void>, error: string): void {
  for (const [id, resolve] of pending) {
    resolve({ type: 'block', id, error });
  }
  pending.clear();
}
