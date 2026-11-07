import { BlobByteSource, type ByteSource, parseMulIndex, readUopContainer, readUopEntryData } from '@sosarium/core';
import {
  AnimationSource,
  type AnimationUopFile,
  AnimationUopSource,
  LegacyAnimationSource,
  type LegacyAnimFile
} from '@sosarium/formats';

import { findFile } from './file-access';
import { type SessionState, sessionStore } from './session';

let cache: { session: SessionState; source: AnimationSource } | null = null;

export function invalidateAnimationSource(): void {
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
  const handle = await session.handle.getFileHandle(actual);
  return new BlobByteSource(await handle.getFile());
}

async function uopFile(session: SessionState, name: string): Promise<AnimationUopFile | null> {
  const source = await byteSource(session, name);
  if (!source) {
    return null;
  }
  return {
    name,
    container: await readUopContainer(source),
    readEntry: (entry) => readUopEntryData(source, entry)
  };
}

export async function getAnimationSource(force = false): Promise<AnimationSource | null> {
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

  const frameFiles: AnimationUopFile[] = [];
  for (let index = 1; index <= 6; index++) {
    const file = await uopFile(session, `AnimationFrame${index}.uop`);
    if (file) {
      frameFiles.push(file);
    }
  }
  const sequenceFile = await uopFile(session, 'AnimationSequence.uop');

  let uop: AnimationUopSource | null = null;
  if (frameFiles.length > 0) {
    uop = new AnimationUopSource(frameFiles, sequenceFile);
    if (sequenceFile) {
      await uop.loadSequences();
    }
  }

  const legacyFiles: LegacyAnimFile[] = [];
  for (let fileType = 1; fileType <= 6; fileType++) {
    const base = fileType === 1 ? 'anim' : `anim${fileType}`;
    const idx = await byteSource(session, `${base}.idx`);
    const mul = await byteSource(session, `${base}.mul`);
    if (idx && mul) {
      legacyFiles.push({
        fileType,
        entries: parseMulIndex(await idx.read(0, idx.byteLength)),
        data: mul
      });
    }
  }

  if (frameFiles.length === 0 && legacyFiles.length === 0) {
    return null;
  }

  const source = new AnimationSource(uop, legacyFiles.length > 0 ? new LegacyAnimationSource(legacyFiles) : null);
  cache = { session, source };
  return source;
}
