import { parseVerdata, serializeVerdata, type VerdataPatch } from '@sosarium/core';
import { parseRadarCol, type RadarColors, serializeRadarCol } from '@sosarium/formats';

import { findFile, HandleWritableFile } from './file-access';
import { type SessionState, sessionStore } from './session';

let radarCache: { session: SessionState; colors: Uint16Array } | null = null;

async function readSessionBytes(session: SessionState, name: string): Promise<Uint8Array | null> {
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

export function invalidateRadarColors(): void {
  radarCache = null;
}

export async function loadRadarColors(): Promise<RadarColors | null> {
  const session = sessionStore.getState();
  if (session.status !== 'ready') {
    return null;
  }
  if (radarCache && radarCache.session === session) {
    return { colors: radarCache.colors };
  }
  const bytes = await readSessionBytes(session, 'radarcol.mul');
  if (!bytes) {
    return null;
  }
  const { colors } = parseRadarCol(bytes);
  radarCache = { session, colors };
  return { colors };
}

export function setRadarColor(colors: Uint16Array, index: number, value: number): Uint16Array {
  const next = colors.slice();
  if (index >= 0 && index < next.length) {
    next[index] = value & 0x7fff;
  }
  return next;
}

export async function saveRadarColors(colors: Uint16Array): Promise<string> {
  const session = sessionStore.getState();
  const name = findFile(session, 'radarcol.mul');
  if (!name || !session.handle || session.mode !== 'readwrite') {
    throw new Error('this session is read-only');
  }
  const writable = new HandleWritableFile(await session.handle.getFileHandle(name));
  await writable.open(false);
  await writable.writeAt(0, serializeRadarCol(colors));
  await writable.close();
  radarCache = null;
  return name;
}

export interface VerdataBundle {
  patches: VerdataPatch[];
  bytes: Uint8Array;
}

export async function loadVerdata(): Promise<VerdataBundle | null> {
  const session = sessionStore.getState();
  if (session.status !== 'ready') {
    return null;
  }
  const bytes = await readSessionBytes(session, 'verdata.mul');
  if (!bytes) {
    return null;
  }
  return { patches: parseVerdata(bytes), bytes };
}

export function serializeVerdataPatches(patches: VerdataPatch[]): Uint8Array {
  return serializeVerdata(patches);
}

export async function saveVerdata(patches: VerdataPatch[], appended: Uint8Array): Promise<string> {
  const session = sessionStore.getState();
  const name = findFile(session, 'verdata.mul');
  if (!name || !session.handle || session.mode !== 'readwrite') {
    throw new Error('this session is read-only');
  }
  const base = serializeVerdata(patches);
  const bytes = new Uint8Array(base.byteLength + appended.byteLength);
  bytes.set(base);
  bytes.set(appended, base.byteLength);
  const writable = new HandleWritableFile(await session.handle.getFileHandle(name));
  await writable.open(false);
  await writable.writeAt(0, bytes);
  await writable.close();
  return name;
}
