import * as core from '@sosarium/core';
import * as formats from '@sosarium/formats';

import { tileToCanvas } from '@/lib/art-image';
import { findFile } from '@/lib/file-access';
import { sessionStore } from '@/lib/session';
import { listSessionFiles, readSessionFile, writeSessionFile } from '@/lib/session-files';

import type { PluginApi } from './types';

export function createPluginApi(): PluginApi {
  const session = sessionStore.getState();
  return {
    session: {
      name: session.name,
      mode: session.mode,
      files: listSessionFiles(session)
    },
    files: {
      list: () => listSessionFiles(sessionStore.getState()),
      find: (name) => findFile(sessionStore.getState(), name),
      read: (name) => readSessionFile(sessionStore.getState(), name),
      write: (name, bytes) => writeSessionFile(name, bytes),
      canWrite: () => sessionStore.getState().mode === 'readwrite'
    },
    formats,
    core,
    images: { tileToCanvas }
  };
}
