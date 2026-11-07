import {
  type ClilocFile,
  type FontsFile,
  parseCliloc,
  parseFonts,
  parseSpeech,
  parseUnicodeFont,
  type SpeechEntry,
  serializeCliloc,
  serializeFonts,
  serializeSpeech,
  UNICODE_FONT_FILES,
  type UnicodeFont
} from '@sosarium/formats';

import { findFile, HandleWritableFile } from './file-access';
import { type SessionState, sessionStore } from './session';
import { readSessionFile } from './session-files';

export function listClilocLocales(session: SessionState): { name: string; locale: string }[] {
  return session.files
    .filter((file) => /^cliloc\.[a-z]+$/i.test(file.name))
    .map((file) => ({ name: file.name, locale: file.name.split('.').pop()?.toLowerCase() ?? 'enu' }))
    .sort((a, b) => a.locale.localeCompare(b.locale));
}

export async function loadCliloc(locale: string): Promise<ClilocFile | null> {
  const session = sessionStore.getState();
  if (session.status !== 'ready') {
    return null;
  }
  const bytes = await readSessionFile(session, `Cliloc.${locale}`);
  if (!bytes) {
    return null;
  }
  return parseCliloc(bytes, locale);
}

export async function saveCliloc(file: ClilocFile): Promise<string> {
  const session = sessionStore.getState();
  const name = findFile(session, `Cliloc.${file.language}`);
  if (!name || !session.handle || session.mode !== 'readwrite') {
    throw new Error('this session is read-only');
  }
  const writable = new HandleWritableFile(await session.handle.getFileHandle(name));
  await writable.open(false);
  await writable.writeAt(0, serializeCliloc(file));
  await writable.close();
  return name;
}

export async function loadSpeech(): Promise<SpeechEntry[] | null> {
  const session = sessionStore.getState();
  const bytes = await readSessionFile(session, 'speech.mul');
  if (!bytes) {
    return null;
  }
  return parseSpeech(bytes);
}

export async function saveSpeech(entries: SpeechEntry[]): Promise<string> {
  const session = sessionStore.getState();
  const name = findFile(session, 'speech.mul');
  if (!name || !session.handle || session.mode !== 'readwrite') {
    throw new Error('this session is read-only');
  }
  const writable = new HandleWritableFile(await session.handle.getFileHandle(name));
  await writable.open(false);
  await writable.writeAt(0, serializeSpeech(entries));
  await writable.close();
  return name;
}

export async function loadFonts(): Promise<FontsFile | null> {
  const session = sessionStore.getState();
  const bytes = await readSessionFile(session, 'fonts.mul');
  if (!bytes) {
    return null;
  }
  return parseFonts(bytes);
}

export interface UnicodeFontEntry {
  file: string;
  index: number;
  font: UnicodeFont;
}

export async function loadUnicodeFonts(): Promise<UnicodeFontEntry[]> {
  const session = sessionStore.getState();
  const entries: UnicodeFontEntry[] = [];
  for (let index = 0; index < UNICODE_FONT_FILES.length; index++) {
    const file = UNICODE_FONT_FILES[index] as string;
    const bytes = await readSessionFile(session, file);
    if (!bytes) {
      continue;
    }
    entries.push({ file, font: parseUnicodeFont(bytes), index });
  }
  return entries;
}

export async function saveFonts(file: FontsFile): Promise<string> {
  const session = sessionStore.getState();
  const name = findFile(session, 'fonts.mul');
  if (!name || !session.handle || session.mode !== 'readwrite') {
    throw new Error('this session is read-only');
  }
  const writable = new HandleWritableFile(await session.handle.getFileHandle(name));
  await writable.open(false);
  await writable.writeAt(0, serializeFonts(file));
  await writable.close();
  return name;
}
