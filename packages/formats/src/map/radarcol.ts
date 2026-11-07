export const RADAR_LAND_COUNT = 0x4000;

export interface RadarColors {
  colors: Uint16Array;
}

export function parseRadarCol(bytes: Uint8Array): RadarColors {
  const count = Math.floor(bytes.byteLength / 2);
  const colors = new Uint16Array(count);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < count; i++) {
    colors[i] = view.getUint16(i * 2, true);
  }
  return { colors };
}

export function radarLandColor(radar: RadarColors, id: number): number {
  return id >= 0 && id < radar.colors.length ? (radar.colors[id] as number) : 0;
}

export function radarItemColor(radar: RadarColors, id: number): number {
  const index = id + RADAR_LAND_COUNT;
  return index >= RADAR_LAND_COUNT && index < radar.colors.length ? (radar.colors[index] as number) : 0;
}

export function serializeRadarCol(colors: Uint16Array): Uint8Array {
  const bytes = new Uint8Array(colors.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < colors.length; i++) {
    view.setUint16(i * 2, colors[i] as number, true);
  }
  return bytes;
}
