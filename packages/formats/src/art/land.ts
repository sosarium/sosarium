export const LAND_TILE_SIZE = 44;
export const LAND_PIXEL_COUNT = 1012;
export const MUL_LAND_BYTES = LAND_PIXEL_COUNT * 2;
export const UOP_LAND_BYTES = 2048;

export interface ArtTile {
  width: number;
  height: number;
  pixels: Uint16Array;
}

export function decodeLandTile(bytes: Uint8Array): ArtTile | null {
  if (bytes.byteLength < MUL_LAND_BYTES) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pixels = new Uint16Array(LAND_TILE_SIZE * LAND_TILE_SIZE);

  let source = 0;
  let xOffset = 21;
  let xRun = 2;
  let line = 0;

  for (let y = 0; y < 22; y++, xOffset--, xRun += 2, line += LAND_TILE_SIZE) {
    for (let n = 0; n < xRun; n++) {
      pixels[line + xOffset + n] = view.getUint16(source * 2, true) | 0x8000;
      source++;
    }
  }

  xOffset = 0;
  xRun = 44;
  for (let y = 0; y < 22; y++, xOffset++, xRun -= 2, line += LAND_TILE_SIZE) {
    for (let n = 0; n < xRun; n++) {
      pixels[line + xOffset + n] = view.getUint16(source * 2, true) | 0x8000;
      source++;
    }
  }

  return { width: LAND_TILE_SIZE, height: LAND_TILE_SIZE, pixels };
}

export function encodeLandTile(tile: ArtTile): Uint8Array {
  if (tile.width !== LAND_TILE_SIZE || tile.height !== LAND_TILE_SIZE) {
    throw new Error(`land tiles must be ${LAND_TILE_SIZE}x${LAND_TILE_SIZE}, got ${tile.width}x${tile.height}`);
  }
  const bytes = new Uint8Array(MUL_LAND_BYTES);
  const view = new DataView(bytes.buffer);
  const pixels = tile.pixels;

  let target = 0;
  let xOffset = 21;
  let xRun = 2;
  let line = 0;

  for (let y = 0; y < 22; y++, xOffset--, xRun += 2, line += LAND_TILE_SIZE) {
    for (let n = 0; n < xRun; n++) {
      view.setUint16(target * 2, (pixels[line + xOffset + n] as number) ^ 0x8000, true);
      target++;
    }
  }

  xOffset = 0;
  xRun = 44;
  for (let y = 0; y < 22; y++, xOffset++, xRun -= 2, line += LAND_TILE_SIZE) {
    for (let n = 0; n < xRun; n++) {
      view.setUint16(target * 2, (pixels[line + xOffset + n] as number) ^ 0x8000, true);
      target++;
    }
  }

  return bytes;
}

export function encodeUopLandEntry(tile: ArtTile): Uint8Array {
  const bytes = new Uint8Array(UOP_LAND_BYTES);
  bytes.set(encodeLandTile(tile), 0);
  return bytes;
}
