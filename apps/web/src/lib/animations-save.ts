import { BlobByteSource, readUopEntryData } from '@sosarium/core';
import {
  type AnimationUopFile,
  type Animdata,
  buildAnimationUopFile,
  buildLegacyAnimFiles,
  type EditGroup,
  type LegacyAnimFile,
  parseAnimdata,
  serializeAnimdata
} from '@sosarium/formats';

import { commitFiles, findFile } from './file-access';
import { type SessionState, sessionStore } from './session';

let animdataCache: { session: SessionState; data: Animdata } | null = null;

export async function getAnimdata(): Promise<Animdata | null> {
  const session = sessionStore.getState();
  if (session.status !== 'ready') {
    return null;
  }
  if (animdataCache && animdataCache.session === session) {
    return animdataCache.data;
  }
  const name = findFile(session, 'animdata.mul');
  if (!name) {
    return null;
  }
  let bytes: Uint8Array;
  if (session.filesByName) {
    const file = session.filesByName.get(name.toLowerCase());
    if (!file) {
      return null;
    }
    bytes = new Uint8Array(await file.arrayBuffer());
  } else {
    if (!session.handle) {
      return null;
    }
    bytes = new Uint8Array(await (await (await session.handle.getFileHandle(name)).getFile()).arrayBuffer());
  }
  const data = parseAnimdata(bytes);
  animdataCache = { session, data };
  return data;
}

export function invalidateAnimdata(): void {
  animdataCache = null;
}

export interface AnimationSaveRequest {
  uopEdits: Map<AnimationUopFile, Map<bigint, Uint8Array>>;
  legacyEdits: Map<LegacyAnimFile, Map<number, EditGroup | null>>;
  animdata: Animdata | null;
}

export async function saveAnimationEdits(request: AnimationSaveRequest): Promise<string[]> {
  const session = sessionStore.getState();
  if (session.status !== 'ready' || !session.handle || session.mode !== 'readwrite') {
    throw new Error('this session is read-only');
  }
  const writes: { name: string; bytes: Uint8Array }[] = [];

  for (const [file, edits] of request.legacyEdits) {
    const base = file.fileType === 1 ? 'anim' : `anim${file.fileType}`;
    const idxName = findFile(session, `${base}.idx`);
    const mulName = findFile(session, `${base}.mul`);
    if (!idxName || !mulName) {
      throw new Error(`missing ${base}.idx/${base}.mul`);
    }
    const { idx, mul } = await buildLegacyAnimFiles(
      file.entries,
      (offset, length) => file.data.read(offset, length),
      edits
    );
    writes.push({ name: idxName, bytes: idx }, { name: mulName, bytes: mul });
  }

  for (const [file, edits] of request.uopEdits) {
    const source = await uopSourceFor(session, file);
    const entries: { hash: bigint; payload: Uint8Array }[] = [];
    for (const [hash, entry] of file.container.byIdentifier) {
      const edited = edits.get(hash);
      entries.push({ hash, payload: edited ?? (await readUopEntryData(source, entry)) });
    }
    const bytes = await buildAnimationUopFile(entries, file.container.version === 5 ? 5 : 4);
    writes.push({ name: file.name, bytes });
  }

  if (request.animdata) {
    const name = findFile(session, 'animdata.mul');
    if (!name) {
      throw new Error('missing animdata.mul');
    }
    writes.push({ name, bytes: serializeAnimdata(request.animdata) });
  }

  await commitFiles(session.handle, writes);
  invalidateAnimdata();
  return writes.map((write) => write.name);
}

async function uopSourceFor(session: SessionState, file: AnimationUopFile): Promise<BlobByteSource> {
  const name = findFile(session, file.name);
  if (!name || !session.handle) {
    throw new Error(`missing ${file.name}`);
  }
  const handle = await session.handle.getFileHandle(name);
  return new BlobByteSource(await handle.getFile());
}
