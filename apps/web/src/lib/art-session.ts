import { BlobByteSource, type ByteSource, MemoryByteSource, readUopContainer, readUopEntryData } from '@sosarium/core';
import { type ArtSource, MulArtSource, UopArtSource } from '@sosarium/formats';

import { findFile, HandleWritableFile, UnavailableWritableFile } from './file-access';
import { type SessionState, sessionStore } from './session';

let cache: { session: SessionState; source: ArtSource } | null = null;

export function invalidateArtSource(): void {
  cache = null;
}

async function buildMulSource(session: SessionState): Promise<ArtSource | null> {
  const idxName = findFile(session, 'artidx.mul');
  const mulName = findFile(session, 'art.mul');
  if (!idxName || !mulName) {
    return null;
  }

  if (session.filesByName) {
    const idxFile = session.filesByName.get(idxName.toLowerCase());
    const mulFile = session.filesByName.get(mulName.toLowerCase());
    if (!idxFile || !mulFile) {
      return null;
    }
    return new MulArtSource({
      idxBytes: new Uint8Array(await idxFile.arrayBuffer()),
      data: new BlobByteSource(mulFile),
      artFile: new UnavailableWritableFile(),
      idxFile: new UnavailableWritableFile()
    });
  }

  if (!session.handle) {
    return null;
  }
  const idxHandle = await session.handle.getFileHandle(idxName);
  const mulHandle = await session.handle.getFileHandle(mulName);
  return new MulArtSource({
    idxBytes: new Uint8Array(await (await idxHandle.getFile()).arrayBuffer()),
    data: new BlobByteSource(await mulHandle.getFile()),
    artFile: new HandleWritableFile(mulHandle),
    idxFile: new HandleWritableFile(idxHandle)
  });
}

async function buildUopSource(session: SessionState): Promise<ArtSource | null> {
  const uopName = findFile(session, 'artLegacyMUL.uop');
  if (!uopName) {
    return null;
  }

  const readContainer = async (source: ByteSource) => readUopContainer(source);

  if (session.filesByName) {
    const blob = session.filesByName.get(uopName.toLowerCase());
    if (!blob) {
      return null;
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const source = new MemoryByteSource(bytes);
    return new UopArtSource({
      container: await readContainer(source),
      readEntry: (entry) => readUopEntryData(source, entry),
      file: new UnavailableWritableFile(),
      pattern: 'artlegacymul',
      layout: 'v5'
    });
  }

  if (!session.handle) {
    return null;
  }
  const handle = await session.handle.getFileHandle(uopName);
  const source = new BlobByteSource(await handle.getFile());
  return new UopArtSource({
    container: await readContainer(source),
    readEntry: (entry) => readUopEntryData(source, entry),
    file: new HandleWritableFile(handle),
    pattern: 'artlegacymul',
    layout: 'v5'
  });
}

export async function getArtSource(force = false): Promise<ArtSource | null> {
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
  const source = flavor?.art === 'mul' ? await buildMulSource(session) : await buildUopSource(session);
  if (!source) {
    return null;
  }
  cache = { session, source };
  return source;
}

export async function saveArtSource(source: ArtSource): Promise<void> {
  await source.save();
  invalidateArtSource();
}
