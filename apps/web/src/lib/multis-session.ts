import { BlobByteSource, type ByteSource, type MulEntry, parseMulIndex, readMulEntry } from '@sosarium/core';
import { type MultiGroup, multiFormatFromLength, parseMultiGroup, serializeMultiGroup } from '@sosarium/formats';

import { commitFiles, findFile } from './file-access';
import { type SessionState, sessionStore } from './session';

export interface MultisSource {
  kind: 'mul' | 'uop';
  entries: (MulEntry | undefined)[];
  format: 'new' | 'old';
  read: (index: number) => Promise<MultiGroup | null>;
  ids: () => number[];
}

let cache: { session: SessionState; source: MultisSource } | null = null;

export function invalidateMultisSource(): void {
  cache = null;
}

async function byteSource(session: SessionState, name: string): Promise<ByteSource | null> {
  const actual = findFile(session, name);
  if (!actual) {
    return null;
  }
  if (session.filesByName) {
    const file = session.filesByName.get(actual.toLowerCase());
    return file ? new BlobByteSource(file) : null;
  }
  if (!session.handle) {
    return null;
  }
  return new BlobByteSource(await (await session.handle.getFileHandle(actual)).getFile());
}

export async function getMultisSource(force = false): Promise<MultisSource | null> {
  const session = sessionStore.getState();
  if (session.status !== 'ready') {
    return null;
  }
  if (cache && cache.session === session && !force) {
    return cache.source;
  }

  const indexSource = await byteSource(session, 'multi.idx');
  const dataSource = await byteSource(session, 'multi.mul');
  if (!indexSource || !dataSource) {
    return null;
  }

  const entries = parseMulIndex(await indexSource.read(0, indexSource.byteLength));
  const source: MultisSource = {
    kind: 'mul',
    entries,
    format: 'new',
    ids: () => entries.map((entry, index) => (entry ? index : -1)).filter((index) => index >= 0),
    async read(index: number) {
      const entry = entries[index];
      if (!entry) {
        return null;
      }
      const format = multiFormatFromLength(entry.length);
      if (!format) {
        return null;
      }
      const bytes = await readMulEntry(dataSource, entry);
      return parseMultiGroup(bytes, format);
    }
  };
  cache = { session, source };
  return source;
}

export async function saveMultiEdits(edits: Map<number, MultiGroup>): Promise<string[]> {
  const session = sessionStore.getState();
  const source = await getMultisSource();
  if (session.status !== 'ready' || !session.handle || session.mode !== 'readwrite') {
    throw new Error('this session is read-only');
  }
  if (!source) {
    throw new Error('multi.mul/multi.idx are not available in this session');
  }
  const idxName = findFile(session, 'multi.idx');
  const mulName = findFile(session, 'multi.mul');
  if (!idxName || !mulName) {
    throw new Error('multi.mul/multi.idx are not available in this session');
  }

  const dataSource = new BlobByteSource(await (await session.handle.getFileHandle(mulName)).getFile());
  const indexBytes = new Uint8Array(source.entries.length * 12);
  const indexView = new DataView(indexBytes.buffer);
  const chunks: Uint8Array[] = [];
  let offset = 0;

  const editedFormat = source.entries.some((entry) => entry && multiFormatFromLength(entry.length) === 'new')
    ? 'new'
    : 'old';

  for (let index = 0; index < source.entries.length; index++) {
    const entry = source.entries[index];
    let bytes: Uint8Array | null = null;

    if (edits.has(index)) {
      const group = edits.get(index);
      bytes = group ? serializeMultiGroup(group, editedFormat) : null;
    } else if (entry) {
      bytes = await dataSource.read(entry.lookup, entry.length);
    }

    if (!bytes) {
      indexView.setInt32(index * 12, -1, true);
      indexView.setInt32(index * 12 + 4, -1, true);
      indexView.setInt32(index * 12 + 8, -1, true);
      continue;
    }

    indexView.setInt32(index * 12, offset, true);
    indexView.setInt32(index * 12 + 4, bytes.byteLength, true);
    indexView.setInt32(index * 12 + 8, entry?.extra ?? 0, true);
    chunks.push(bytes);
    offset += bytes.byteLength;
  }

  const mulBytes = new Uint8Array(offset);
  let position = 0;
  for (const chunk of chunks) {
    mulBytes.set(chunk, position);
    position += chunk.byteLength;
  }

  await commitFiles(session.handle, [
    { name: idxName, bytes: indexBytes },
    { name: mulName, bytes: mulBytes }
  ]);
  invalidateMultisSource();
  return [idxName, mulName];
}
