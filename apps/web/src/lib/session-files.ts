import { commitFiles, findFile } from './file-access';
import { type SessionState, sessionStore } from './session';

export function listSessionFiles(session: SessionState): { name: string; size: number }[] {
  return session.files.map((file) => ({ name: file.name, size: file.size }));
}

export async function readSessionFile(session: SessionState, name: string): Promise<Uint8Array | null> {
  const actual = findFile(session, name);
  if (!actual) {
    return null;
  }
  if (session.filesByName) {
    const file = session.filesByName.get(actual.toLowerCase());
    return file ? new Uint8Array(await file.arrayBuffer()) : null;
  }
  if (!session.handle) {
    return null;
  }
  return new Uint8Array(await (await (await session.handle.getFileHandle(actual)).getFile()).arrayBuffer());
}

export async function writeSessionFile(name: string, bytes: Uint8Array): Promise<string> {
  const session = sessionStore.getState();
  const actual = findFile(session, name);
  if (!actual || !session.handle || session.mode !== 'readwrite') {
    throw new Error('this session is read-only or the file is missing');
  }
  await commitFiles(session.handle, [{ name: actual, bytes }]);
  return actual;
}
