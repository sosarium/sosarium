import { parseMulIndex, readMulEntry } from '@sosarium/core';
import { hasAssets, loadAsset } from '@sosarium/core/testing';
import { describe, expect, it } from 'vitest';

import { decodeLight } from './light';
import {
  assignmentsFromSkillGroups,
  encodeSkill,
  parseSkill,
  parseSkillGroups,
  type SkillGroupsFile,
  serializeSkillGroups,
  skillAssignmentsEqual,
  skillGroupsFromAssignments
} from './skills';
import { encodeSoundEntry, parseSound, parseSoundDef, parseSoundIndex, soundSeconds, wavBytes } from './sound';
import { decodeTexture, encodeTexture, textureSize } from './textures';

describe('misc synthetic', () => {
  it('round-trips a texture', () => {
    const pixels = new Uint16Array(64 * 64);
    pixels[5] = 0xf83e;
    const bytes = encodeTexture({ size: 64, pixels });
    const decoded = decodeTexture(bytes, 0);
    expect(decoded?.size).toBe(64);
    expect(decoded?.pixels[5]).toBe(0xf83e);
    expect(textureSize(1)).toBe(128);
  });

  it('round-trips a skill record', () => {
    const bytes = encodeSkill({ index: 0, isAction: true, name: 'Alchemy', extra: 3 });
    const parsed = parseSkill(bytes, 0, 3);
    expect(parsed?.name).toBe('Alchemy');
    expect(parsed?.isAction).toBe(true);
  });

  it('round-trips skill groups in ascii and unicode layouts', () => {
    const file: SkillGroupsFile = {
      unicode: false,
      nameStride: 17,
      groups: [
        { name: 'Misc', skills: [] },
        { name: 'Combat', skills: [1, 3] },
        { name: 'Crafting', skills: [2] }
      ],
      skillList: [0, 1, 2, 1]
    };
    const ascii = parseSkillGroups(serializeSkillGroups(file));
    expect(ascii.unicode).toBe(false);
    expect(ascii.groups.map((group) => group.name)).toEqual(['Misc', 'Combat', 'Crafting']);
    expect(ascii.skillList).toEqual([0, 1, 2, 1]);

    const unicode = parseSkillGroups(serializeSkillGroups({ ...file, unicode: true, nameStride: 34 }));
    expect(unicode.unicode).toBe(true);
    expect(unicode.groups.map((group) => group.name)).toEqual(['Misc', 'Combat', 'Crafting']);
    expect(unicode.skillList).toEqual([0, 1, 2, 1]);
  });

  it('truncates an overlong group name before the stride boundary', () => {
    const file: SkillGroupsFile = {
      unicode: false,
      nameStride: 17,
      groups: [
        { name: 'Misc', skills: [] },
        { name: 'AbcdefghijklmnopQ', skills: [] },
        { name: 'Tail', skills: [] }
      ],
      skillList: []
    };
    const parsed = parseSkillGroups(serializeSkillGroups(file));
    expect(parsed.groups[1]?.name).toBe('Abcdefghijklmnop');
    expect(parsed.groups[2]?.name).toBe('Tail');
  });

  it('derives per-group skill lists from assignments', () => {
    expect(skillGroupsFromAssignments([0, 2, 1, 2], 3, [0, 1, 2, 3])).toEqual([[0], [2], [1, 3]]);
    expect(skillGroupsFromAssignments([0, 2, 1, 2], 3, [3, 0])).toEqual([[0], [], [3]]);
    expect(skillGroupsFromAssignments([9, -1], 2, [0, 1, 2])).toEqual([[0, 1, 2], []]);
  });

  it('projects group skill lists back into assignments', () => {
    expect(assignmentsFromSkillGroups([0, 1, 1], [[2], [0]])).toEqual([1, 1, 0]);
    expect(assignmentsFromSkillGroups([0], [[], [], [4]])).toEqual([0, 0, 0, 0, 2]);
  });

  it('compares assignments with implicit misc trailing zeros', () => {
    expect(skillAssignmentsEqual([0, 1], [0, 1, 0, 0])).toBe(true);
    expect(skillAssignmentsEqual([0, 1], [0, 2])).toBe(false);
    expect(skillAssignmentsEqual([], [0])).toBe(true);
  });

  it('wraps pcm in a 22050 hz mono wav header', () => {
    const wave = new Uint8Array(4410).fill(7);
    const wav = wavBytes(wave);
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...wav.subarray(8, 12))).toBe('WAVE');
    const view = new DataView(wav.buffer);
    expect(view.getUint32(24, true)).toBe(22050);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(wave.byteLength);
    expect(wav.byteLength).toBe(wave.byteLength + 44);
    expect(soundSeconds(new Uint8Array(44100))).toBeCloseTo(1);
  });

  it('parses a sound entry with the 32-byte header', () => {
    const entry = encodeSoundEntry('door1', new Uint8Array(100).fill(3));
    const parsed = parseSound(entry, 42);
    expect(parsed?.name).toBe('door1');
    expect(parsed?.wave.byteLength).toBe(100);
    expect(entry.byteLength).toBe(132);
  });

  it('parses 16-byte soundidx records', () => {
    const bytes = new Uint8Array(32);
    const view = new DataView(bytes.buffer);
    view.setInt32(0, 0, true);
    view.setInt32(4, 1234, true);
    view.setUint16(8, 5, true);
    view.setUint16(10, 0, true);
    view.setInt32(16, 1234, true);
    view.setInt32(20, 99, true);
    view.setUint16(24, 6, true);
    const entries = parseSoundIndex(bytes);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ lookup: 0, length: 1234, index: 5, reserved: 0 });
    expect(entries[1]?.index).toBe(6);
  });

  it('parses sound.def mappings', () => {
    const table = parseSoundDef('# comment\n3 1\n14 2\n');
    expect(table.get(3)).toBe(1);
    expect(table.get(14)).toBe(2);
  });
});

describe.skipIf(!hasAssets())('misc (real client)', () => {
  it('round-trips real textures byte-for-byte', async () => {
    const entries = parseMulIndex(await loadAsset('texidx.mul').readAll());
    const data = loadAsset('texmaps.mul');
    let checked = 0;
    for (let index = 0; index < entries.length && checked < 5; index += 311) {
      const entry = entries[index];
      if (!entry) {
        continue;
      }
      const bytes = await readMulEntry(data, entry);
      const texture = decodeTexture(bytes, entry.extra);
      expect(texture).not.toBeNull();
      const reserialized = encodeTexture(texture as NonNullable<typeof texture>);
      expect(Buffer.from(reserialized).equals(Buffer.from(bytes.subarray(0, reserialized.byteLength)))).toBe(true);
      expect([64, 128]).toContain(texture?.size);
      checked++;
    }
    expect(checked).toBeGreaterThan(3);
  });

  it('decodes real light entries', async () => {
    const entries = parseMulIndex(await loadAsset('lightidx.mul').readAll());
    const data = loadAsset('light.mul');
    let checked = 0;
    for (let index = 0; index < entries.length && checked < 4; index += 9) {
      const entry = entries[index];
      if (!entry) {
        continue;
      }
      const bytes = await readMulEntry(data, entry);
      const light = decodeLight(bytes, entry.extra);
      if (!light) {
        continue;
      }
      expect(light.width).toBeGreaterThan(0);
      expect(light.pixels.length).toBe(light.width * light.height);
      checked++;
    }
    expect(checked).toBeGreaterThan(2);
  });

  it('reads real skills and skill groups', async () => {
    const entries = parseMulIndex(await loadAsset('skills.idx').readAll());
    const data = loadAsset('skills.mul');
    const skills = [];
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index];
      if (!entry) {
        continue;
      }
      const bytes = await readMulEntry(data, entry);
      const skill = parseSkill(bytes, index, entry.extra);
      if (skill) {
        skills.push(skill);
      }
    }
    expect(skills.length).toBeGreaterThan(40);
    expect(skills.some((skill) => skill.name === 'Alchemy')).toBe(true);

    const groups = parseSkillGroups(await loadAsset('skillgrp.mul').readAll());
    expect(groups.groups.length).toBeGreaterThan(5);
    expect(groups.groups[0]?.name).toBe('Misc');
    expect(groups.skillList.length).toBeGreaterThan(40);
  });

  it('round-trips real skillgrp.mul byte-for-byte', async () => {
    const bytes = await loadAsset('skillgrp.mul').readAll();
    const groups = parseSkillGroups(bytes);
    for (const [skillId, group] of groups.skillList.entries()) {
      expect(group, `skill ${skillId} group`).toBeGreaterThanOrEqual(0);
      expect(group, `skill ${skillId} group`).toBeLessThan(groups.groups.length);
    }
    const reserialized = serializeSkillGroups(groups);
    expect(Buffer.from(reserialized).equals(Buffer.from(bytes))).toBe(true);
  });

  it('enumerates real sounds from soundLegacyMUL.uop entries', async () => {
    const { hashFileName, readUopContainer, readUopEntryData } = await import('@sosarium/core');
    const source = loadAsset('soundLegacyMUL.uop');
    const container = await readUopContainer(source);
    expect(container.entryCount).toBeGreaterThan(1000);
    const names: string[] = [];
    for (const index of [0, 1, 2, 100]) {
      const entry = container.byIdentifier.get(
        hashFileName(`build/soundlegacymul/${String(index).padStart(8, '0')}.dat`)
      );
      expect(entry).toBeDefined();
      const sound = parseSound(await readUopEntryData(source, entry as NonNullable<typeof entry>), index);
      expect(sound).not.toBeNull();
      expect((sound as NonNullable<typeof sound>).wave.byteLength).toBeGreaterThan(1000);
      names.push((sound as NonNullable<typeof sound>).name);
    }
    expect(names[0]).toBe('d_frst01.wav');
    expect(names[1]).toBe('d_frst02.wav');
    expect(names[3]).toBe('bull1.wav');
  });
});
