export interface AnimdataEntry {
  frameData: Int8Array;
  unknown: number;
  frameCount: number;
  frameInterval: number;
  frameStart: number;
}

export interface Animdata {
  entries: Map<number, AnimdataEntry>;
  headers: number[];
  blockCount: number;
  trailing: Uint8Array;
}

const BLOCK_ENTRIES = 8;
const ENTRY_SIZE = 68;
const BLOCK_SIZE = 4 + BLOCK_ENTRIES * ENTRY_SIZE;

export function parseAnimdata(bytes: Uint8Array): Animdata {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = new Map<number, AnimdataEntry>();
  const headers: number[] = [];
  const blockCount = Math.floor(bytes.byteLength / BLOCK_SIZE);

  let id = 0;
  for (let block = 0; block < blockCount; block++) {
    const base = block * BLOCK_SIZE;
    headers.push(view.getInt32(base, true));
    for (let i = 0; i < BLOCK_ENTRIES; i++, id++) {
      const entryBase = base + 4 + i * ENTRY_SIZE;
      const frameData = new Int8Array(bytes.buffer, bytes.byteOffset + entryBase, 64).slice();
      const unknown = bytes[entryBase + 64] as number;
      const frameCount = bytes[entryBase + 65] as number;
      const frameInterval = bytes[entryBase + 66] as number;
      const frameStart = bytes[entryBase + 67] as number;
      const used =
        frameData.some((value) => value !== 0) ||
        unknown !== 0 ||
        frameCount !== 0 ||
        frameInterval !== 0 ||
        frameStart !== 0;
      if (used) {
        entries.set(id, { frameData, unknown, frameCount, frameInterval, frameStart });
      }
    }
  }

  const consumed = blockCount * BLOCK_SIZE;
  return { entries, headers, blockCount, trailing: bytes.slice(consumed) };
}

export function serializeAnimdata(data: Animdata): Uint8Array {
  const maxId = data.entries.size > 0 ? Math.max(...data.entries.keys()) : -1;
  const needed = maxId < 0 ? 0 : Math.floor(maxId / BLOCK_ENTRIES) + 1;
  const blockCount = Math.max(data.blockCount, needed);
  const out = new Uint8Array(blockCount * BLOCK_SIZE + data.trailing.byteLength);
  const view = new DataView(out.buffer);

  let id = 0;
  for (let block = 0; block < blockCount; block++) {
    const base = block * BLOCK_SIZE;
    view.setInt32(base, data.headers[block] ?? 0, true);
    for (let i = 0; i < BLOCK_ENTRIES; i++, id++) {
      const entry = data.entries.get(id);
      if (!entry) {
        continue;
      }
      const entryBase = base + 4 + i * ENTRY_SIZE;
      out.set(entry.frameData, entryBase);
      out[entryBase + 64] = entry.unknown;
      out[entryBase + 65] = entry.frameCount;
      out[entryBase + 66] = entry.frameInterval;
      out[entryBase + 67] = entry.frameStart;
    }
  }

  out.set(data.trailing, blockCount * BLOCK_SIZE);
  return out;
}
