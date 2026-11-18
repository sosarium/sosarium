import { type ClientFileEntry, detectClientFlavor, detectClientVersion } from '@sosarium/core';

import { clearDirectoryHandle, loadDirectoryHandle, saveDirectoryHandle } from './idb';
import { emptySession, type SessionMode, type SessionState, sessionStore } from './session';

const RESTORE_TIMEOUT_MS = 5000;

async function readClientVersion(
  files: ClientFileEntry[],
  getFile: (name: string) => Promise<File>
): Promise<string | null> {
  const entry = files.find((file) => file.name.toLowerCase() === 'client.exe');
  if (!entry) {
    return null;
  }
  try {
    const file = await getFile(entry.name);
    return detectClientVersion(new Uint8Array(await file.arrayBuffer()));
  } catch {
    return null;
  }
}

export function supportsDirectoryPicker(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export async function pickUoFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!supportsDirectoryPicker()) {
    return null;
  }
  try {
    return await window.showDirectoryPicker({ id: 'uo-client', mode: 'readwrite' });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return null;
    }
    throw error;
  }
}

async function listRootFiles(dir: FileSystemDirectoryHandle): Promise<ClientFileEntry[]> {
  const files: ClientFileEntry[] = [];
  for await (const entry of dir.values()) {
    if (entry.kind !== 'file') {
      continue;
    }
    const file = await entry.getFile();
    files.push({ name: entry.name, size: file.size, lastModified: file.lastModified });
  }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

export async function openDirectory(
  handle: FileSystemDirectoryHandle,
  mode: SessionMode,
  persist = true
): Promise<SessionState> {
  const files = await listRootFiles(handle);
  if (persist) {
    await saveDirectoryHandle(handle);
  }
  const clientVersion = await readClientVersion(files, async (name) => (await handle.getFileHandle(name)).getFile());
  return {
    status: 'ready',
    name: handle.name,
    mode,
    flavor: detectClientFlavor(files.map((file) => file.name)),
    clientVersion,
    files,
    handle,
    filesByName: null
  };
}

export async function openFileList(list: FileList): Promise<SessionState> {
  const entries = Array.from(list);
  const hasStructure = entries.some((file) => file.webkitRelativePath.includes('/'));
  const files: ClientFileEntry[] = [];
  const filesByName = new Map<string, File>();
  let folderName: string | null = null;

  for (const file of entries) {
    const relativePath = file.webkitRelativePath || file.name;
    const segments = relativePath.split('/');
    if (hasStructure) {
      if (segments.length !== 2) {
        continue;
      }
      folderName = folderName ?? segments[0];
    }
    files.push({ name: file.name, size: file.size, lastModified: file.lastModified });
    filesByName.set(file.name.toLowerCase(), file);
  }

  files.sort((a, b) => a.name.localeCompare(b.name));

  const clientVersion = await readClientVersion(files, async (name) => {
    const file = filesByName.get(name.toLowerCase());
    if (!file) {
      throw new Error(`missing ${name}`);
    }
    return file;
  });

  return {
    status: 'ready',
    name: folderName,
    mode: 'readonly',
    flavor: detectClientFlavor(files.map((file) => file.name)),
    clientVersion,
    files,
    handle: null,
    filesByName
  };
}

export async function openDroppedDirectory(handle: FileSystemDirectoryHandle): Promise<SessionState | null> {
  let mode: SessionMode = 'readonly';
  const writePermission = await handle.requestPermission({ mode: 'readwrite' });
  if (writePermission === 'granted') {
    mode = 'readwrite';
  } else if ((await handle.requestPermission({ mode: 'read' })) !== 'granted') {
    return null;
  }
  return openDirectory(handle, mode);
}

let restorePromise: Promise<void> | null = null;

export async function restoreSession(): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }
  if (!restorePromise) {
    restorePromise = doRestore();
  }
  return restorePromise;
}

async function doRestore(): Promise<void> {
  if (sessionStore.getState().status !== 'empty') {
    return;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<'stalled'>((resolve) => {
    timer = setTimeout(() => resolve('stalled'), RESTORE_TIMEOUT_MS);
  });
  const result = await Promise.race([readSavedSession().catch(() => 'stalled' as const), timedOut]);
  clearTimeout(timer);
  if (result === 'stalled') {
    sessionStore.set({ ...emptySession, status: 'stalled' });
  } else if (result) {
    sessionStore.set(result);
  }
}

async function readSavedSession(): Promise<SessionState | null> {
  const handle = await loadDirectoryHandle();
  if (!handle) {
    return null;
  }

  if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') {
    return openDirectory(handle, 'readwrite', false);
  }

  if ((await handle.queryPermission({ mode: 'read' })) === 'granted') {
    return openDirectory(handle, 'readonly', false);
  }

  return {
    status: 'needs-permission',
    name: handle.name,
    mode: 'readonly',
    flavor: null,
    clientVersion: null,
    files: [],
    handle,
    filesByName: null
  };
}

export async function reconnect(): Promise<boolean> {
  const { handle } = sessionStore.getState();
  if (!handle) {
    return false;
  }
  const writePermission = await handle.requestPermission({ mode: 'readwrite' });
  if (writePermission === 'granted') {
    sessionStore.set(await openDirectory(handle, 'readwrite', false));
    return true;
  }
  if ((await handle.requestPermission({ mode: 'read' })) === 'granted') {
    sessionStore.set(await openDirectory(handle, 'readonly', false));
    return true;
  }
  return false;
}

export async function closeSession(): Promise<void> {
  await clearDirectoryHandle();
  restorePromise = null;
  sessionStore.reset();
}
