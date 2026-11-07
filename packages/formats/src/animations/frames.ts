export interface AnimationFrameData {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  pixels: Uint16Array;
}

export const PALETTE_SIZE = 256;
export const FRAME_HEADER_SENTINEL = 0x7fff7fff;
const DOUBLE_XOR = 0x80200000;

export function emptyFrame(): AnimationFrameData {
  return { centerX: 0, centerY: 0, width: 0, height: 0, pixels: new Uint16Array(0) };
}

export function readLegacyPalette(bytes: Uint8Array, offset: number): Uint16Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const palette = new Uint16Array(PALETTE_SIZE);
  for (let i = 0; i < PALETTE_SIZE; i++) {
    palette[i] = view.getUint16(offset + i * 2, true) ^ 0x8000;
  }
  return palette;
}

export function readUopPalette(bytes: Uint8Array, offset: number): Uint16Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const palette = new Uint16Array(PALETTE_SIZE);
  for (let i = 0; i < PALETTE_SIZE; i++) {
    const raw = view.getUint16(offset + i * 2, true);
    palette[i] = raw === 0 ? 0 : raw | 0x8000;
  }
  return palette;
}

export function decodeFrame(
  bytes: Uint8Array,
  offset: number,
  palette: Uint16Array,
  flip: boolean
): AnimationFrameData {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (offset + 8 > bytes.byteLength) {
    return emptyFrame();
  }
  const xCenter = view.getInt16(offset, true);
  const yCenter = view.getInt16(offset + 2, true);
  const width = view.getUint16(offset + 4, true);
  const height = view.getUint16(offset + 6, true);
  if (width === 0 || height === 0 || width > 0x400 || height > 0x400) {
    return emptyFrame();
  }

  const pixels = new Uint16Array(width * height);
  const xBase = xCenter - 0x200;
  const yBase = yCenter + height - 0x200;
  let position = offset + 8;

  while (position + 4 <= bytes.byteLength) {
    const rawHeader = view.getInt32(position, true);
    position += 4;
    if (rawHeader >>> 0 === FRAME_HEADER_SENTINEL) {
      break;
    }
    const header = (rawHeader ^ DOUBLE_XOR) >>> 0;
    const runLength = header & 0xfff;
    const runY = yBase + ((header >>> 12) & 0x3ff);
    const runX = (header >>> 22) & 0x3ff;

    if (position + runLength > bytes.byteLength) {
      break;
    }

    for (let i = 0; i < runLength; i++) {
      const paletteIndex = bytes[position + i] as number;
      const x = flip ? width - 1 - xBase + runX - i : xBase + runX + i;
      if (x >= 0 && x < width && runY >= 0 && runY < height) {
        pixels[runY * width + x] = palette[paletteIndex] as number;
      }
    }
    position += runLength;
  }

  const centerX = flip ? width - xCenter : xCenter;
  return { centerX, centerY: yCenter, width, height, pixels };
}

export function decodeLegacyAnimationGroup(bytes: Uint8Array, flip: boolean): AnimationFrameData[] | null {
  if (bytes.byteLength < 520) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const palette = readLegacyPalette(bytes, 0);
  const frameCount = view.getInt32(512, true);
  if (frameCount <= 0 || frameCount > 4096 || 516 + frameCount * 4 > bytes.byteLength) {
    return null;
  }
  const frames: AnimationFrameData[] = new Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    const frameOffset = 512 + view.getInt32(516 + i * 4, true);
    frames[i] = decodeFrame(bytes, frameOffset, palette, flip);
  }
  return frames;
}

export function decodeUopAnimationEntry(
  bytes: Uint8Array,
  direction: number,
  flip: boolean
): AnimationFrameData[] | null {
  if (bytes.byteLength < 40) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const frameCount = view.getUint32(32, true);
  const dataStart = view.getUint32(36, true);
  if (frameCount === 0 || frameCount > 4096 || dataStart >= bytes.byteLength) {
    return null;
  }
  if (dataStart + frameCount * 16 > bytes.byteLength) {
    return null;
  }

  const headers: { position: number; frameId: number; pixelOffset: number }[] = new Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    const base = dataStart + i * 16;
    headers[i] = {
      position: base,
      frameId: view.getUint16(base + 2, true),
      pixelOffset: view.getUint32(base + 12, true)
    };
  }

  const filled: { position: number; frameId: number; pixelOffset: number }[] = [];
  let lastId = 1;
  for (const header of headers) {
    while (header.frameId - lastId > 1) {
      lastId++;
      filled.push({ position: 0, frameId: lastId, pixelOffset: 0 });
    }
    filled.push(header);
    lastId = header.frameId;
  }

  const realFrameCount = Math.round(filled.length / 5);
  if (realFrameCount <= 0) {
    return null;
  }

  const frames: AnimationFrameData[] = [];
  for (const header of filled) {
    const frameDirection = Math.floor((header.frameId - 1) / realFrameCount);
    if (frameDirection < direction) {
      continue;
    }
    if (frameDirection > direction) {
      break;
    }
    if (header.position === 0) {
      frames.push(emptyFrame());
      continue;
    }
    const frameOffset = header.position + header.pixelOffset;
    if (frameOffset + 512 > bytes.byteLength) {
      frames.push(emptyFrame());
      continue;
    }
    const palette = readUopPalette(bytes, frameOffset);
    frames.push(decodeFrame(bytes, frameOffset + 512, palette, flip));
  }

  return frames.length > 0 ? frames : null;
}
