import { MemoryWriteSink, type MulEntry, UopContainerWriter } from '@sosarium/core';

const DOUBLE_XOR = 0x80200000;
const FRAME_HEADER_SENTINEL = 0x7fff7fff;
const PALETTE_SIZE = 256;
const UOP_DIRECTIONS = 5;

export interface EditRun {
  x: number;
  y: number;
  data: Uint8Array;
}

export interface EditFrame {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  runs: EditRun[];
}

export interface EditGroup {
  palette: Uint16Array;
  frames: EditFrame[];
}

export const EMPTY_EDIT_FRAME: EditFrame = { centerX: 0, centerY: 0, width: 0, height: 0, runs: [] };

export function paletteIndex(palette: Uint16Array, color: number): number {
  for (let i = 0; i < palette.length; i++) {
    if (palette[i] === color) {
      return i;
    }
  }
  return 0;
}

export function decodeEditGroup(bytes: Uint8Array): EditGroup {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const palette = new Uint16Array(PALETTE_SIZE);
  for (let i = 0; i < PALETTE_SIZE; i++) {
    palette[i] = view.getUint16(i * 2, true) ^ 0x8000;
  }

  const frames: EditFrame[] = [];
  const frameCount = view.getInt32(512, true);
  for (let i = 0; i < frameCount; i++) {
    const offset = 512 + view.getInt32(516 + i * 4, true);
    const centerX = view.getInt16(offset, true);
    const centerY = view.getInt16(offset + 2, true);
    const width = view.getUint16(offset + 4, true);
    const height = view.getUint16(offset + 6, true);
    const runs: EditRun[] = [];
    let position = offset + 8;
    while (width > 0 && height > 0 && position + 4 <= bytes.byteLength) {
      const raw = view.getInt32(position, true);
      position += 4;
      if (raw >>> 0 === FRAME_HEADER_SENTINEL) {
        break;
      }
      const header = (raw ^ DOUBLE_XOR) >>> 0;
      const length = header & 0xfff;
      if (position + length > bytes.byteLength) {
        break;
      }
      runs.push({
        x: (header >>> 22) & 0x3ff,
        y: (header >>> 12) & 0x3ff,
        data: bytes.slice(position, position + length)
      });
      position += length;
    }
    frames.push({ centerX, centerY, width, height, runs });
  }

  return { palette, frames };
}

export function encodeFrameBody(frame: EditFrame): Uint8Array {
  let size = 8 + 4;
  for (const run of frame.runs) {
    size += 4 + run.data.byteLength;
  }
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  view.setInt16(0, frame.centerX, true);
  view.setInt16(2, frame.centerY, true);
  view.setUint16(4, frame.width, true);
  view.setUint16(6, frame.height, true);
  let position = 8;
  for (const run of frame.runs) {
    const header = ((run.data.byteLength & 0xfff) | ((run.y & 0x3ff) << 12) | ((run.x & 0x3ff) << 22)) ^ DOUBLE_XOR;
    view.setUint32(position, header >>> 0, true);
    position += 4;
    out.set(run.data, position);
    position += run.data.byteLength;
  }
  view.setUint32(position, FRAME_HEADER_SENTINEL, true);
  return out;
}

function encodePalette(palette: Uint16Array): Uint8Array {
  const out = new Uint8Array(PALETTE_SIZE * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < PALETTE_SIZE; i++) {
    view.setUint16(i * 2, (palette[i] as number) ^ 0x8000, true);
  }
  return out;
}

function encodeUopPalette(palette: Uint16Array): Uint8Array {
  const out = new Uint8Array(PALETTE_SIZE * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < PALETTE_SIZE; i++) {
    view.setUint16(i * 2, (palette[i] as number) & 0x7fff, true);
  }
  return out;
}

export function encodeEditGroup(group: EditGroup): Uint8Array | null {
  if (group.frames.length === 0) {
    return null;
  }
  const frameBodies = group.frames.map((frame) => encodeFrameBody(frame));
  let size = PALETTE_SIZE * 2 + 4 + group.frames.length * 4;
  for (const body of frameBodies) {
    size += body.byteLength;
  }
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  out.set(encodePalette(group.palette), 0);

  const startPosition = PALETTE_SIZE * 2;
  view.setInt32(startPosition, group.frames.length, true);
  let position = startPosition + 4 + group.frames.length * 4;
  for (let i = 0; i < frameBodies.length; i++) {
    view.setInt32(startPosition + 4 + i * 4, position - startPosition, true);
    const body = frameBodies[i] as Uint8Array;
    out.set(body, position);
    position += body.byteLength;
  }
  return out;
}

export function runsFromPixels(
  pixels: Uint16Array,
  width: number,
  height: number,
  palette: Uint16Array,
  centerX: number,
  centerY: number
): EditRun[] {
  const runs: EditRun[] = [];
  for (let y = 0; y < height; y++) {
    let x = 0;
    while (x < width) {
      while (x < width && pixels[y * width + x] === 0) {
        x++;
      }
      if (x >= width) {
        break;
      }
      let end = x + 1;
      while (end < width && pixels[y * width + end] !== 0) {
        end++;
      }
      const data = new Uint8Array(end - x);
      for (let i = 0; i < data.byteLength; i++) {
        data[i] = paletteIndex(palette, pixels[y * width + x + i] as number);
      }
      runs.push({
        x: (x - centerX + 0x200) & 0x3ff,
        y: (y - centerY - height + 0x200) & 0x3ff,
        data
      });
      x = end + 1;
    }
  }
  return runs;
}

export function pixelsFromFrame(frame: EditFrame, palette: Uint16Array): Uint16Array {
  const pixels = new Uint16Array(frame.width * frame.height);
  for (const run of frame.runs) {
    const startX = frame.centerX - 0x200 + run.x;
    const y = frame.centerY + frame.height - 0x200 + run.y;
    if (y < 0 || y >= frame.height) {
      continue;
    }
    for (let i = 0; i < run.data.byteLength; i++) {
      const x = startX + i;
      if (x >= 0 && x < frame.width) {
        pixels[y * frame.width + x] = palette[run.data[i] as number] as number;
      }
    }
  }
  return pixels;
}

export function encodeUopActionEntry(directions: (EditGroup | null)[], action: number): Uint8Array {
  const groups: (EditGroup | null)[] = [];
  let frameCount = 0;
  for (let direction = 0; direction < UOP_DIRECTIONS; direction++) {
    const group = directions[direction] ?? null;
    groups.push(group);
    frameCount = Math.max(frameCount, group?.frames.length ?? 0);
  }

  const headerCount = frameCount * UOP_DIRECTIONS;
  const dataStart = 40;
  const headerSize = headerCount * 16;
  const payloads: Uint8Array[] = [];

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
    for (let direction = 0; direction < UOP_DIRECTIONS; direction++) {
      const group = groups[direction];
      const frame = group?.frames[frameIndex] ?? EMPTY_EDIT_FRAME;
      const frameBody = encodeFrameBody(frame);
      const payload = new Uint8Array(PALETTE_SIZE * 2 + frameBody.byteLength);
      payload.set(encodeUopPalette(group?.palette ?? new Uint16Array(PALETTE_SIZE)), 0);
      payload.set(frameBody, PALETTE_SIZE * 2);
      payloads.push(payload);
    }
  }

  const payloadStart = dataStart + headerSize;
  const total = payloadStart + payloads.reduce((sum, payload) => sum + payload.byteLength, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(32, headerCount, true);
  view.setUint32(36, dataStart, true);

  const payloadOffsets: number[] = [];
  let payloadOffset = payloadStart;
  for (const payload of payloads) {
    payloadOffsets.push(payloadOffset);
    out.set(payload, payloadOffset);
    payloadOffset += payload.byteLength;
  }

  for (let i = 0; i < headerCount; i++) {
    const direction = Math.floor(i / frameCount);
    const frameIndex = i % frameCount;
    const payloadIndex = frameIndex * UOP_DIRECTIONS + direction;
    const headerPosition = dataStart + i * 16;
    view.setUint16(headerPosition, action, true);
    view.setUint16(headerPosition + 2, i + 1, true);
    view.setBigInt64(headerPosition + 4, 0n, true);
    view.setUint32(headerPosition + 12, (payloadOffsets[payloadIndex] as number) - headerPosition, true);
  }
  return out;
}

export function decodeUopActionEntryForEdit(bytes: Uint8Array): (EditGroup | null)[] {
  if (bytes.byteLength < 40) {
    return [null, null, null, null, null];
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerCount = view.getUint32(32, true);
  const dataStart = view.getUint32(36, true);
  if (headerCount === 0 || dataStart + headerCount * 16 > bytes.byteLength) {
    return [null, null, null, null, null];
  }

  const headers: { position: number; frameId: number; pixelOffset: number }[] = [];
  for (let i = 0; i < headerCount; i++) {
    const base = dataStart + i * 16;
    headers.push({
      position: base,
      frameId: view.getUint16(base + 2, true),
      pixelOffset: view.getUint32(base + 12, true)
    });
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

  const realFrameCount = Math.round(filled.length / UOP_DIRECTIONS);
  if (realFrameCount <= 0) {
    return [null, null, null, null, null];
  }

  const groups: (EditGroup | null)[] = [null, null, null, null, null];
  for (const header of filled) {
    const direction = Math.floor((header.frameId - 1) / realFrameCount);
    if (direction < 0 || direction >= UOP_DIRECTIONS || direction > 4) {
      continue;
    }
    if (header.position === 0) {
      continue;
    }
    const frameOffset = header.position + header.pixelOffset;
    if (frameOffset + 4 + PALETTE_SIZE * 2 + 8 > bytes.byteLength) {
      continue;
    }
    const palette = new Uint16Array(PALETTE_SIZE);
    for (let i = 0; i < PALETTE_SIZE; i++) {
      const raw = view.getUint16(frameOffset + i * 2, true);
      palette[i] = raw === 0 ? 0 : raw | 0x8000;
    }

    const centerX = view.getInt16(frameOffset + PALETTE_SIZE * 2, true);
    const centerY = view.getInt16(frameOffset + PALETTE_SIZE * 2 + 2, true);
    const width = view.getUint16(frameOffset + PALETTE_SIZE * 2 + 4, true);
    const height = view.getUint16(frameOffset + PALETTE_SIZE * 2 + 6, true);
    const runs: EditRun[] = [];
    let position = frameOffset + PALETTE_SIZE * 2 + 8;
    while (width > 0 && height > 0 && position + 4 <= bytes.byteLength) {
      const raw = view.getInt32(position, true);
      position += 4;
      if (raw >>> 0 === FRAME_HEADER_SENTINEL) {
        break;
      }
      const headerBits = (raw ^ DOUBLE_XOR) >>> 0;
      const length = headerBits & 0xfff;
      if (position + length > bytes.byteLength) {
        break;
      }
      runs.push({
        x: (headerBits >>> 22) & 0x3ff,
        y: (headerBits >>> 12) & 0x3ff,
        data: bytes.slice(position, position + length)
      });
      position += length;
    }

    const group = groups[direction] ?? { palette, frames: [] };
    group.palette = palette;
    group.frames.push({ centerX, centerY, width, height, runs });
    groups[direction] = group;
  }

  return groups;
}

export async function buildLegacyAnimFiles(
  entries: (MulEntry | undefined)[],
  read: (offset: number, length: number) => Promise<Uint8Array>,
  edits: Map<number, EditGroup | null>
): Promise<{ idx: Uint8Array; mul: Uint8Array }> {
  const idx = new Uint8Array(entries.length * 12);
  const idxView = new DataView(idx.buffer);
  const chunks: Uint8Array[] = [];
  let offset = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    let data: Uint8Array | null = null;
    let extra = entry?.extra ?? 0;

    if (edits.has(i)) {
      const group = edits.get(i) ?? null;
      data = group ? encodeEditGroup(group) : null;
      extra = entry?.extra ?? 0;
    } else if (entry) {
      data = await read(entry.lookup, entry.length);
    }

    if (!data) {
      idxView.setInt32(i * 12, -1, true);
      idxView.setInt32(i * 12 + 4, -1, true);
      idxView.setInt32(i * 12 + 8, -1, true);
      continue;
    }

    idxView.setInt32(i * 12, offset, true);
    idxView.setInt32(i * 12 + 4, data.byteLength, true);
    idxView.setInt32(i * 12 + 8, extra, true);
    chunks.push(data);
    offset += data.byteLength;
  }

  const mul = new Uint8Array(offset);
  let position = 0;
  for (const chunk of chunks) {
    mul.set(chunk, position);
    position += chunk.byteLength;
  }
  return { idx, mul };
}

export async function buildAnimationUopFile(
  entries: { hash: bigint; payload: Uint8Array }[],
  version: 4 | 5
): Promise<Uint8Array> {
  const sink = new MemoryWriteSink();
  const writer = new UopContainerWriter(sink, version === 4 ? 'v4' : 'v5', entries.length);
  await writer.writeHeader();
  for (const entry of entries) {
    await writer.writeEntry(entry.hash, entry.payload, 0);
  }
  await writer.complete();
  return sink.toBytes();
}
