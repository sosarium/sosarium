import { HueDataSource } from '@sosarium/formats';

import { findFile, HandleWritableFile, UnavailableWritableFile } from './file-access';
import { type SessionState, sessionStore } from './session';

let cache: { session: SessionState; source: HueDataSource } | null = null;

export function invalidateHueSource(): void {
  cache = null;
}

export async function getHueDataSource(force = false): Promise<HueDataSource | null> {
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

  const name = findFile(session, 'hues.mul');
  if (!name) {
    return null;
  }

  let source: HueDataSource;
  if (session.filesByName) {
    const file = session.filesByName.get(name.toLowerCase());
    if (!file) {
      return null;
    }
    source = new HueDataSource(new Uint8Array(await file.arrayBuffer()), new UnavailableWritableFile());
  } else {
    if (!session.handle) {
      return null;
    }
    const handle = await session.handle.getFileHandle(name);
    source = new HueDataSource(
      new Uint8Array(await (await handle.getFile()).arrayBuffer()),
      new HandleWritableFile(handle)
    );
  }

  cache = { session, source };
  return source;
}

export async function saveHueDataSource(source: HueDataSource): Promise<void> {
  await source.save();
  invalidateHueSource();
}
