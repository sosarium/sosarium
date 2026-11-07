import { MemoryByteSource, readUopContainer, readUopEntryData } from '@sosarium/core';
import { type GumpSource, MulGumpSource, UopGumpSource } from '@sosarium/formats';

import { findFile, HandleWritableFile, UnavailableWritableFile } from './file-access';
import { type SessionState, sessionStore } from './session';

let cache: { session: SessionState; source: GumpSource } | null = null;

export function invalidateGumpSource(): void {
  cache = null;
}

async function buildMulGumpSource(session: SessionState): Promise<GumpSource | null> {
  const idxName = findFile(session, 'gumpidx.mul');
  const mulName = findFile(session, 'gumpart.mul');
  if (!idxName || !mulName) {
    return null;
  }

  if (session.filesByName) {
    const idxFile = session.filesByName.get(idxName.toLowerCase());
    const mulFile = session.filesByName.get(mulName.toLowerCase());
    if (!idxFile || !mulFile) {
      return null;
    }
    return new MulGumpSource({
      idxBytes: new Uint8Array(await idxFile.arrayBuffer()),
      data: new MemoryByteSource(new Uint8Array(await mulFile.arrayBuffer())),
      gumpFile: new UnavailableWritableFile(),
      idxFile: new UnavailableWritableFile()
    });
  }

  if (!session.handle) {
    return null;
  }
  const idxHandle = await session.handle.getFileHandle(idxName);
  const mulHandle = await session.handle.getFileHandle(mulName);
  return new MulGumpSource({
    idxBytes: new Uint8Array(await (await idxHandle.getFile()).arrayBuffer()),
    data: new MemoryByteSource(new Uint8Array(await (await mulHandle.getFile()).arrayBuffer())),
    gumpFile: new HandleWritableFile(mulHandle),
    idxFile: new HandleWritableFile(idxHandle)
  });
}

async function buildUopGumpSource(session: SessionState): Promise<GumpSource | null> {
  const name = findFile(session, 'gumpartLegacyMUL.uop');
  if (!name) {
    return null;
  }

  if (session.filesByName) {
    const blob = session.filesByName.get(name.toLowerCase());
    if (!blob) {
      return null;
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const source = new MemoryByteSource(bytes);
    return new UopGumpSource({
      container: await readUopContainer(source),
      readEntry: (entry) => readUopEntryData(source, entry),
      file: new UnavailableWritableFile(),
      layout: 'v4'
    });
  }

  if (!session.handle) {
    return null;
  }
  const handle = await session.handle.getFileHandle(name);
  const source = new MemoryByteSource(new Uint8Array(await (await handle.getFile()).arrayBuffer()));
  return new UopGumpSource({
    container: await readUopContainer(source),
    readEntry: (entry) => readUopEntryData(source, entry),
    file: new HandleWritableFile(handle),
    layout: 'v4'
  });
}

export async function getGumpSource(force = false): Promise<GumpSource | null> {
  const session = sessionStore.getState();
  if (session.status !== 'ready') {
    return null;
  }
  if (cache && cache.session === session && !force) {
    return cache.source;
  }
  if (force) {
    cache = null;
  }

  const flavor = session.flavor;
  const source = flavor?.gump === 'mul' ? await buildMulGumpSource(session) : await buildUopGumpSource(session);
  if (!source) {
    return null;
  }
  cache = { session, source };
  return source;
}

export async function saveGumpSource(source: GumpSource): Promise<void> {
  await source.save();
  invalidateGumpSource();
}
