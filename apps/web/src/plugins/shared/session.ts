import { findFile, HandleWritableFile } from '@/lib/file-access';
import type { useSession } from '@/lib/session';

export type PluginSession = ReturnType<typeof useSession>;

export async function readSessionBytes(session: PluginSession, name: string): Promise<Uint8Array | null> {
  const actual = findFile(session, name);
  if (!actual) {
    return null;
  }
  const file =
    session.filesByName?.get(actual.toLowerCase()) ??
    (session.handle ? await (await session.handle.getFileHandle(actual)).getFile() : null);
  return file ? new Uint8Array(await file.arrayBuffer()) : null;
}

export async function writeSessionBytes(session: PluginSession, name: string, bytes: Uint8Array): Promise<void> {
  if (!session.handle) {
    throw new Error('this session is read-only');
  }
  const handle = await session.handle.getFileHandle(name, { create: true });
  const writable = new HandleWritableFile(handle);
  await writable.open(false);
  await writable.writeAt(0, bytes);
  await writable.close();
}

export async function readDirectoryBytes(dir: FileSystemDirectoryHandle, name: string): Promise<Uint8Array | null> {
  for await (const entry of dir.values()) {
    if (entry.kind === 'file' && entry.name.toLowerCase() === name.toLowerCase()) {
      return new Uint8Array(await (await (entry as FileSystemFileHandle).getFile()).arrayBuffer());
    }
  }
  return null;
}
