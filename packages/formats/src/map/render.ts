import type { LandTile, StaticTile } from './mapread';
import { type RadarColors, radarItemColor, radarLandColor } from './radarcol';

export interface RadarRenderInput {
  land: LandTile[];
  statics: StaticTile[][][] | null;
  radar: RadarColors;
  itemHeights: Uint16Array | null;
  hueColors: (hueIndex: number) => Uint16Array | null;
}

export function renderRadarBlock(input: RadarRenderInput): Uint16Array {
  const out = new Uint16Array(64);
  const { land, statics, radar, itemHeights, hueColors } = input;

  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const index = y * 8 + x;
      const landTile = land[index] as LandTile;
      let highTop = -255;
      let highZ = -255;
      let highId = 0;
      let highHue = 0;
      let highStatic = false;

      const list = statics?.[x]?.[y];
      if (list) {
        for (const tile of list) {
          const z = tile.z;
          const top = z + (itemHeights?.[tile.id] ?? 0);
          if (top > highTop || (z > highZ && top >= highTop)) {
            highTop = top;
            highZ = z;
            highId = tile.id;
            highHue = tile.hue;
            highStatic = true;
          }
        }
      }

      if (landTile.z > highTop) {
        highId = landTile.id;
        highHue = 0;
        highStatic = false;
      }

      let color: number;
      if (highHue === 0) {
        color = highStatic ? radarItemColor(radar, highId) : radarLandColor(radar, highId);
      } else {
        const ramp = hueColors(highHue - 1);
        const base = radarItemColor(radar, highId);
        color = ramp ? (ramp[(base >> 10) & 0x1f] as number) : base;
      }
      out[index] = color;
    }
  }

  return out;
}
