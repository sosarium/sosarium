import {
  BlobByteSource,
  type ByteSource,
  hashFileName,
  parseMulIndex,
  readMulEntry,
  readUopContainer,
  readUopEntryData
} from '@sosarium/core';
import {
  decodeLight,
  decodeTexture,
  type LightEntry,
  parseSkill,
  parseSkillGroups,
  parseSound,
  parseSoundIndex,
  type SkillEntry,
  type SkillGroupsFile,
  SOUND_HEADER_LENGTH,
  soundSeconds,
  type Texture,
  wavBytes
} from '@sosarium/formats';

import { findFile } from './file-access';
import { type SessionState, sessionStore } from './session';

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
  return new BlobByteSource(await (await session.handle.getFileHandle(actual)).getFile());
}

async function indexedEntries(indexName: string, dataName: string) {
  const session = sessionStore.getState();
  if (session.status !== 'ready') {
    return null;
  }
  const index = await byteSource(session, indexName);
  const data = await byteSource(session, dataName);
  if (!index || !data) {
    return null;
  }
  return { entries: parseMulIndex(await index.read(0, index.byteLength)), data };
}

export async function loadTextureList(): Promise<{ index: number; size: 64 | 128 }[] | null> {
  const source = await indexedEntries('texidx.mul', 'texmaps.mul');
  if (!source) {
    return null;
  }
  return source.entries
    .map((entry, index) => (entry ? { index, size: entry.extra === 0 ? 64 : 128 } : null))
    .filter((entry): entry is { index: number; size: 64 | 128 } => entry !== null);
}

export async function loadTexture(index: number): Promise<Texture | null> {
  const source = await indexedEntries('texidx.mul', 'texmaps.mul');
  const entry = source?.entries[index];
  if (!source || !entry) {
    return null;
  }
  return decodeTexture(await readMulEntry(source.data, entry), entry.extra);
}

export async function loadLightList(): Promise<number[] | null> {
  const source = await indexedEntries('lightidx.mul', 'light.mul');
  if (!source) {
    return null;
  }
  return source.entries.map((entry, index) => (entry ? index : -1)).filter((index) => index >= 0);
}

export async function loadLight(index: number): Promise<LightEntry | null> {
  const source = await indexedEntries('lightidx.mul', 'light.mul');
  const entry = source?.entries[index];
  if (!source || !entry) {
    return null;
  }
  return decodeLight(await readMulEntry(source.data, entry), entry.extra);
}

export interface SkillsBundle {
  skills: SkillEntry[];
  groups: SkillGroupsFile | null;
}

export async function loadSkills(): Promise<SkillsBundle | null> {
  const source = await indexedEntries('Skills.idx', 'skills.mul');
  if (!source) {
    return null;
  }
  const skills: SkillEntry[] = [];
  for (let index = 0; index < source.entries.length; index++) {
    const entry = source.entries[index];
    if (!entry) {
      continue;
    }
    const skill = parseSkill(await readMulEntry(source.data, entry), index, entry.extra);
    if (skill) {
      skills.push(skill);
    }
  }
  const session = sessionStore.getState();
  const groupSource = await byteSource(session, 'skillgrp.mul');
  const groups = groupSource ? parseSkillGroups(await groupSource.read(0, groupSource.byteLength)) : null;
  return { skills, groups };
}

export interface SoundsBundle {
  entries: { id: number; name: string; seconds: number }[];
  getWav: (id: number) => Promise<Uint8Array | null>;
}

export async function loadSounds(): Promise<SoundsBundle | null> {
  const session = sessionStore.getState();
  if (session.status !== 'ready') {
    return null;
  }
  const entries: { id: number; name: string; seconds: number }[] = [];
  const wavFor = new Map<number, () => Promise<Uint8Array | null>>();

  const index = await byteSource(session, 'soundidx.mul');
  const mul = await byteSource(session, 'sound.mul');
  if (index && mul) {
    const parsed = parseSoundIndex(await index.read(0, index.byteLength));
    for (let i = 0; i < parsed.length; i++) {
      const entry = parsed[i];
      if (!entry || entry.lookup < 0 || entry.length < SOUND_HEADER_LENGTH) {
        continue;
      }
      const sound = parseSound(await mul.read(entry.lookup, entry.length), i);
      if (!sound) {
        continue;
      }
      entries.push({ id: i, name: sound.name, seconds: soundSeconds(sound.wave) });
      wavFor.set(i, async () => wavBytes(sound.wave));
    }
    return { entries, getWav: async (id) => wavFor.get(id)?.() ?? null };
  }

  const uop = await byteSource(session, 'soundLegacyMUL.uop');
  if (!uop) {
    return null;
  }
  const container = await readUopContainer(uop);
  // Sound ids are contiguous in shipped clients, but scanning the bounded id space keeps gaps
  // (custom sound sets) enumerable; each hit costs one small header read.
  for (let i = 0; i < 0x10000; i++) {
    const entry = container.byIdentifier.get(hashFileName(`build/soundlegacymul/${String(i).padStart(8, '0')}.dat`));
    if (!entry) {
      continue;
    }
    const stored = entry.compressionFlag === 0;
    const header = stored
      ? await uop.read(entry.offset + entry.headerLength, Math.min(SOUND_HEADER_LENGTH, entry.size))
      : (await readUopEntryData(uop, entry)).subarray(0, SOUND_HEADER_LENGTH);
    let end = header.length;
    for (let b = 0; b < header.length; b++) {
      if (header[b] === 0) {
        end = b;
        break;
      }
    }
    const name = new TextDecoder('ascii').decode(header.subarray(0, end));
    const bytes = stored ? entry.size : entry.decompressedSize;
    entries.push({ id: i, name, seconds: Math.max(0, bytes - SOUND_HEADER_LENGTH) / 44100 });
    wavFor.set(i, async () => {
      const sound = parseSound(await readUopEntryData(uop, entry), i);
      return sound ? wavBytes(sound.wave) : null;
    });
  }
  return { entries, getWav: async (id) => wavFor.get(id)?.() ?? null };
}
