import type { ArtTile } from './land';

export interface ArtBounds {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

export function measureArtBounds(tile: ArtTile): ArtBounds | null {
  const { width, height, pixels } = tile;
  let xMin = -1;
  let yMin = -1;
  let xMax = -1;
  let yMax = -1;

  for (let y = 0; y < height; y++) {
    const line = y * width;
    for (let x = 0; x < width; x++) {
      if (!((pixels[line + x] as number) & 0x8000)) {
        continue;
      }
      if (xMin === -1 || x < xMin) {
        xMin = x;
      }
      if (x > xMax) {
        xMax = x;
      }
      if (yMin === -1 || y < yMin) {
        yMin = y;
      }
      if (y > yMax) {
        yMax = y;
      }
    }
  }

  return xMin === -1 ? null : { xMin, yMin, xMax, yMax };
}
